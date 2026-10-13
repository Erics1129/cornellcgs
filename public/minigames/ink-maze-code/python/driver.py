# Ink Maze level 26 (Python): the driver. Compiled once per worker by
# runtime.js. _ink_run(source, stdin_text) compiles the player's code as
# "solution.py" (so error lines are the player's own), rewrites it to honour
# the cooperative deadline, runs it in a fresh namespace, then runs the hidden
# harness against it, and returns a JSON string the runtime turns into a
# RuntimeOutcome. stdout/stderr bytes go to the JS capture the runtime installs.
#
# The worker is a WebAssembly thread; in WebKit worker.terminate() does not stop
# a running WebAssembly loop (contract.ts D1-D9), so the program must stop
# ITSELF at the deadline. THREE cooperative mechanisms do that:
#   1. an AST rewrite that calls __ink_tick__() at every loop body, function
#      entry AND comprehension/generator-expression (so the clock is read even
#      inside a `sum(... for ...)` that iterates in C); __ink_tick__ samples the
#      clock and raises a sticky, uncatchable _InkStop once the deadline (or an
#      output/memory limit) has passed, so a bare `except`/`finally` loop cannot
#      swallow it;
#   2. Pyodide's interrupt buffer (runtime.js), read as a getter that returns
#      SIGINT past the deadline. CPython's eval loop raises KeyboardInterrupt at
#      the next bytecode boundary, so ANY code that runs bytecode per step -- a
#      generator expression, a comprehension, a callable-iterator (iter(f, s)),
#      a key=/reduce lambda -- is stopped even though the AST never saw it. The
#      driver DISARMS the buffer the moment it catches the stop, so the re-fire
#      cannot corrupt the interpreter during cleanup (the old "lost sys.stderr").
#   3. the C-level library loops that run with NO Python bytecode per step
#      (sum(range(1e18)), any(iter(int,1)), reduce(op.add, count()),
#      deque(count(), 0), math.factorial(1e8), re backtracking) cannot be
#      reached by 1 or 2, so they are BOUNDED at the source: the C consumers and
#      the infinite itertools / 2-arg iter sources are wrapped to drive their
#      input through a ticking Python generator (back to mechanism 1/2), the
#      heavy math builtins are capped, and the re module is refused. See _arm().
# The host's terminate() is only the backstop (a bug if it is ever needed).
#
# Names starting with "__ink" are reserved; player code that uses one is a
# compile error, so the player can neither shadow nor disable the machinery.
import sys, io, os, gc, ast, json, time, builtins, traceback, linecache

FILENAME = 'solution.py'
RESERVED_PREFIX = '__ink'
# the browser bridge modules, hidden + refused while player code runs
_BLOCKED_ROOTS = ('js', 'pyodide', 'pyodide_js', '_pyodide', '_pyodide_core', 'micropip')
# modules with unbounded C loops that nothing in this game needs; refused while
# player code runs (re/regex backtracking has no Python back-edge to tick)
_BANNED_ROOTS = ('re', 'regex', 'sre_compile', 'sre_parse', '_sre')
# poll the clock at most this many loop/function ticks apart (contract D2: <= ~50 ms of run between reads)
_TICK_SAMPLE = 2048
# the largest argument the capped math builtins accept (a real solution needs none)
_MATH_ARG_CAP = 100000
# keep int<->str conversions a ValueError, never a multi-second hang (contract D2 / fix 2d)
_INT_STR_DIGITS_CAP = 4300

# ---- JS bridge (set as driver globals by runtime.js) -----------------------
#   _JS_STARTED()      compiling is done; the run deadline starts now
#   _JS_POLL()         truthy once the deadline passed or an output/memory limit was hit
#   _JS_LIMITKIND()    '' | 'time_limit' | 'memory_limit' | 'output_limit'
#   _JS_DISARM()       stop the interrupt buffer firing (called once the stop is caught)
# HARNESS_SOURCE, RECURSION_LIMIT, ANSWER_CHARS are set too.


class _InkStop(BaseException):
    """The cooperative deadline / limit. BaseException and sticky, so player
    code cannot swallow it with `except Exception` or a looping `finally`."""


# driver-scope state the AST tick reads and writes (reset every run)
__ink_tc = 0
__ink_stopped = False


def __ink_tick__():
    global __ink_tc, __ink_stopped
    if __ink_stopped:
        raise _InkStop()
    __ink_tc += 1
    if __ink_tc >= _TICK_SAMPLE:
        __ink_tc = 0
        if _JS_POLL():
            __ink_stopped = True
            raise _InkStop()


def __ink_iter__(iterable):
    """A ticking pass-through iterator. Wrapping an iterable in this turns an
    otherwise C-only consumption (sum/any/all/max/min/sorted/reduce/deque/...)
    into one that runs a Python back-edge per element, so mechanisms 1 and 2
    both see it. Used by the AST (around every comprehension iterable) and by
    the C-consumer / infinite-source wrappers in _arm()."""
    for item in iterable:
        __ink_tick__()
        yield item


class _Instrument(ast.NodeTransformer):
    """Inserts __ink_tick__() at the top of every function and loop body, and
    wraps the outermost iterable of every comprehension / generator expression
    in __ink_iter__ so it ticks per element even when a C builtin drives it."""

    def _tick(self, ref):
        call = ast.Expr(value=ast.Call(func=ast.Name(id='__ink_tick__', ctx=ast.Load()), args=[], keywords=[]))
        return ast.copy_location(ast.fix_missing_locations(call), ref)

    def _inject(self, body):
        if not body:
            return body
        at = 0
        # keep a leading docstring first, so __doc__ survives
        if isinstance(body[0], ast.Expr) and isinstance(getattr(body[0], 'value', None), ast.Constant) and isinstance(body[0].value.value, str):
            at = 1
        return body[:at] + [self._tick(body[at] if at < len(body) else body[0])] + body[at:]

    def visit_FunctionDef(self, node):
        self.generic_visit(node)
        node.body = self._inject(node.body)
        return node

    visit_AsyncFunctionDef = visit_FunctionDef

    def _loop(self, node):
        self.generic_visit(node)
        node.body = self._inject(node.body)
        return node

    visit_For = _loop
    visit_AsyncFor = _loop
    visit_While = _loop

    def _comp(self, node):
        self.generic_visit(node)
        gens = getattr(node, 'generators', None)
        if gens:
            outer = gens[0]
            wrapped = ast.Call(func=ast.Name(id='__ink_iter__', ctx=ast.Load()), args=[outer.iter], keywords=[])
            outer.iter = ast.copy_location(ast.fix_missing_locations(wrapped), outer.iter)
        return node

    visit_ListComp = _comp
    visit_SetComp = _comp
    visit_DictComp = _comp
    visit_GeneratorExp = _comp


class _ReservedName(SyntaxError):
    pass


def _check_reserved(tree):
    """Reject any player name starting with RESERVED_PREFIX, so the deadline
    machinery (__ink_tick__, __ink_iter__, ...) cannot be shadowed or disabled."""
    def bad(name, node):
        if isinstance(name, str) and name.startswith(RESERVED_PREFIX):
            e = _ReservedName('names starting with "%s" are reserved by the judge' % RESERVED_PREFIX)
            e.lineno = getattr(node, 'lineno', None)
            e.offset = (getattr(node, 'col_offset', 0) or 0) + 1
            e.filename = FILENAME
            e.text = None
            raise e
    for node in ast.walk(tree):
        if isinstance(node, (ast.FunctionDef, ast.AsyncFunctionDef, ast.ClassDef)):
            bad(node.name, node)
        elif isinstance(node, ast.Name) and isinstance(node.ctx, (ast.Store, ast.Del)):
            bad(node.id, node)
        elif isinstance(node, (ast.Global, ast.Nonlocal)):
            for n in node.names:
                bad(n, node)
        elif isinstance(node, ast.arg):
            bad(node.arg, node)
        elif isinstance(node, (ast.Import, ast.ImportFrom)):
            for alias in node.names:
                bad(alias.asname or alias.name, node)
        elif isinstance(node, (ast.keyword,)) and node.arg:
            bad(node.arg, node)


# ---------------------------------------------------------------------------
# Bounding the C-level surface (mechanism 3). CPython's own C loops take no
# Python back-edge, so neither the AST tick nor the interrupt buffer can stop
# them. The only general fix without SharedArrayBuffer is to keep the player
# from reaching one that does not terminate: wrap the O(1)-memory C consumers
# so they drive their iterable through __ink_iter__ (ticking), wrap the infinite
# itertools / 2-arg iter sources the same way, cap the heavy integer math, and
# keep int<->str conversions a ValueError. O(n)-memory consumers (list/set/dict/
# tuple/sorted-materialise/str.join) already stop at the memory cap.
_ARMED = '__ink_wrapped__'
_math = _functools = _collections = _operator = _itertools = None
_real_set_int_max = None
_BASE_GC_CALLBACKS = []
# the untouched originals, captured once at startup so every re-arm rebuilds the
# wrappers from them (immune to a run that reassigns the attribute)
_ORIG = {}
_os_close_guard = None
_ticking_deque = None


def _is_wrapped(fn):
    return getattr(fn, _ARMED, False)


def _wrap_iterable_first(func):
    """func(iterable, *rest) -> func(__ink_iter__(iterable), *rest)."""
    if _is_wrapped(func):
        return func
    def wrapper(iterable, *rest, **kw):
        return func(__ink_iter__(iterable), *rest, **kw)
    try:
        wrapper.__name__ = getattr(func, '__name__', 'wrapped')
    except Exception:
        pass
    setattr(wrapper, _ARMED, True)
    return wrapper


def _wrap_minmax(func):
    """max/min: the single-iterable form ticks; the varargs form is finite."""
    if _is_wrapped(func):
        return func
    def wrapper(*args, **kw):
        if len(args) == 1:
            return func(__ink_iter__(args[0]), **kw)
        return func(*args, **kw)
    setattr(wrapper, _ARMED, True)
    return wrapper


def _wrap_iter(real_iter):
    """iter(callable, sentinel) is an unbounded C source; make it tick."""
    if _is_wrapped(real_iter):
        return real_iter
    def wrapper(*args):
        if len(args) == 2:
            return __ink_iter__(real_iter(*args))
        return real_iter(*args)
    setattr(wrapper, _ARMED, True)
    return wrapper


def _wrap_reduce(real_reduce):
    """functools.reduce(function, iterable[, initial]): wrap the iterable (2nd)."""
    if _is_wrapped(real_reduce):
        return real_reduce
    def wrapper(function, iterable, *initial):
        return real_reduce(function, __ink_iter__(iterable), *initial)
    setattr(wrapper, _ARMED, True)
    return wrapper


def _wrap_two_arg_consumer(func):
    """operator.countOf/indexOf(iterable, value): wrap the iterable."""
    if _is_wrapped(func):
        return func
    def wrapper(iterable, value):
        return func(__ink_iter__(iterable), value)
    setattr(wrapper, _ARMED, True)
    return wrapper


def _wrap_source(factory):
    """itertools.count/cycle/repeat: make the (possibly infinite) source tick."""
    if _is_wrapped(factory):
        return factory
    def wrapper(*args, **kw):
        return __ink_iter__(factory(*args, **kw))
    setattr(wrapper, _ARMED, True)
    return wrapper


def _capped_math(real):
    if _is_wrapped(real):
        return real
    def wrapper(n, *rest):
        if isinstance(n, int) and n > _MATH_ARG_CAP:
            raise ValueError('argument too large for this game (limit %d)' % _MATH_ARG_CAP)
        for extra in rest:
            if isinstance(extra, int) and extra > _MATH_ARG_CAP:
                raise ValueError('argument too large for this game (limit %d)' % _MATH_ARG_CAP)
        return real(n, *rest)
    setattr(wrapper, _ARMED, True)
    return wrapper


def _capped_pow(real_pow):
    if _is_wrapped(real_pow):
        return real_pow
    def wrapper(base, exp, mod=None):
        if mod is None and isinstance(exp, int) and exp > _MATH_ARG_CAP and isinstance(base, int) and abs(base) > 1:
            raise ValueError('pow() exponent too large for this game (limit %d)' % _MATH_ARG_CAP)
        return real_pow(base, exp) if mod is None else real_pow(base, exp, mod)
    setattr(wrapper, _ARMED, True)
    return wrapper


def _clamped_set_int_max(limit):
    # never let the player raise the ceiling above the default, and never let 0
    # (which means "unlimited") through -- that would reopen the int<->str hang
    value = int(limit)
    if value == 0 or value > _INT_STR_DIGITS_CAP:
        value = _INT_STR_DIGITS_CAP
    _real_set_int_max(value)


def _make_deque_wrapper(real_deque):
    class _TickingDeque(real_deque):
        def __init__(self, iterable=(), maxlen=None):
            real_deque.__init__(self, __ink_iter__(iterable), maxlen)

        def extend(self, iterable):
            return real_deque.extend(self, __ink_iter__(iterable))

        def extendleft(self, iterable):
            return real_deque.extendleft(self, __ink_iter__(iterable))
    setattr(_TickingDeque, _ARMED, True)
    return _TickingDeque


def _make_os_close_guard(real_close):
    def guard(fd, *rest):
        if fd in (0, 1, 2):
            raise OSError(9, 'cannot close a standard stream in this game')
        return real_close(fd, *rest)
    setattr(guard, _ARMED, True)
    return guard


def _arm_builtins():
    """Assign the stored wrapper objects to builtins. Stable objects, rebuilt
    from the untouched originals in _ORIG, so a run cannot leave a real one
    exposed or make the fingerprint drift."""
    b = builtins
    b.__ink_tick__ = __ink_tick__
    b.__ink_iter__ = __ink_iter__
    for name, wrapper in _ORIG['builtins_wrappers'].items():
        setattr(b, name, wrapper)


def _arm_modules():
    """Re-apply the C-surface wrappers to the stdlib modules each run (a run may
    have un-wrapped them; _restore only restores module identity, not attrs).
    Every wrapper is a stable object built once from the original."""
    for module, attrs in _ORIG['module_wrappers']:
        for name, wrapper in attrs.items():
            setattr(module, name, wrapper)
    if _collections is not None and _ticking_deque is not None:
        _collections.deque = _ticking_deque
    if _os_close_guard is not None:
        os.close = _os_close_guard


def _arm_setup():
    """Import the bounded modules once, build every wrapper from the untouched
    original, and arm everything. Runs once at startup, before _BASE_FP."""
    global _math, _functools, _collections, _operator, _itertools
    global _real_set_int_max, _os_close_guard, _ticking_deque
    import math as _m, functools as _f, collections as _c, operator as _o, itertools as _i
    _math, _functools, _collections, _operator, _itertools = _m, _f, _c, _o, _i

    # builtins: wrap from the originals
    bw = {}
    for name in ('sum', 'any', 'all', 'sorted'):
        bw[name] = _wrap_iterable_first(getattr(builtins, name))
    for name in ('max', 'min'):
        bw[name] = _wrap_minmax(getattr(builtins, name))
    bw['iter'] = _wrap_iter(builtins.iter)
    bw['pow'] = _capped_pow(builtins.pow)
    _ORIG['builtins_wrappers'] = bw

    # stdlib modules with O(1)-memory C consumers / infinite sources
    mw = []
    math_attrs = {'factorial': _capped_math(_math.factorial), 'prod': _wrap_iterable_first(_math.prod)}
    if hasattr(_math, 'comb'):
        math_attrs['comb'] = _capped_math(_math.comb)
    if hasattr(_math, 'perm'):
        math_attrs['perm'] = _capped_math(_math.perm)
    if hasattr(_math, 'fsum'):
        math_attrs['fsum'] = _wrap_iterable_first(_math.fsum)
    mw.append((_math, math_attrs))
    mw.append((_functools, {'reduce': _wrap_reduce(_functools.reduce)}))
    op_attrs = {}
    for name in ('countOf', 'indexOf'):
        if hasattr(_operator, name):
            op_attrs[name] = _wrap_two_arg_consumer(getattr(_operator, name))
    if op_attrs:
        mw.append((_operator, op_attrs))
    it_attrs = {}
    for name in ('count', 'cycle', 'repeat'):
        if hasattr(_itertools, name):
            it_attrs[name] = _wrap_source(getattr(_itertools, name))
    if it_attrs:
        mw.append((_itertools, it_attrs))
    _ORIG['module_wrappers'] = mw
    _ticking_deque = _make_deque_wrapper(_collections.deque)

    # fd 0/1/2 must stay open (closing them crashes the interpreter, not just the run)
    _os_close_guard = _make_os_close_guard(os.close)

    # keep int<->str conversions a ValueError, not a multi-second hang
    _real_set_int_max = sys.set_int_max_str_digits
    try:
        sys.set_int_max_str_digits(_INT_STR_DIGITS_CAP)
    except Exception:
        pass
    sys.set_int_max_str_digits = _clamped_set_int_max

    _arm_builtins()
    _arm_modules()


# ---------------------------------------------------------------------------
_harness_ns = {'__name__': '_ink_harness'}
exec(compile(HARNESS_SOURCE, '<harness>', 'exec'), _harness_ns)
_harness = _harness_ns['_ink_harness']


class _Blocker:
    """First finder on sys.meta_path: refuses the browser bridge AND the
    unbounded-C modules (re/regex) while player code runs."""
    active = False

    def find_spec(self, name, path=None, target=None):
        if self.active:
            root = name.split('.')[0]
            if root in _BLOCKED_ROOTS:
                raise ModuleNotFoundError("module '%s' is not available in this game" % name, name=name)
            if root in _BANNED_ROOTS:
                raise ModuleNotFoundError("module '%s' is not available in this game (unbounded pattern matching)" % name, name=name)
        return None


_blocker = _Blocker()
sys.meta_path.insert(0, _blocker)

# Unwinding an exception through more than ~450 Python frames overflows the
# browser's native stack in Safari/WebKit (measured: 400 unwinds cleanly, 500
# kills the interpreter), so cap the recursion limit. The player may lower it.
_real_setrecursionlimit = sys.setrecursionlimit


def _setrecursionlimit(limit):
    _real_setrecursionlimit(max(50, min(int(limit), RECURSION_LIMIT)))


_real_setrecursionlimit(RECURSION_LIMIT)
sys.setrecursionlimit = _setrecursionlimit

_arm_setup()
try:
    _BASE_GC_CALLBACKS = list(gc.callbacks)
except Exception:
    _BASE_GC_CALLBACKS = []

_BASE_BUILTINS = dict(builtins.__dict__)
_BASE_MODULES = dict(sys.modules)
_BASE_PATH = list(sys.path)
_BASE_META_PATH = list(sys.meta_path)
_BASE_LIMIT = sys.getrecursionlimit()
_BASE_CWD = os.getcwd()


def _restore():
    """Undo what the previous run may have changed in the interpreter."""
    sys.settrace(None)
    sys.setprofile(None)
    builtins.__dict__.clear()
    builtins.__dict__.update(_BASE_BUILTINS)
    for name in list(sys.modules):
        if name not in _BASE_MODULES:
            del sys.modules[name]
    for name, module in _BASE_MODULES.items():
        if sys.modules.get(name) is not module:
            sys.modules[name] = module
    sys.path[:] = _BASE_PATH
    sys.meta_path[:] = _BASE_META_PATH
    sys.setrecursionlimit = _setrecursionlimit
    _real_setrecursionlimit(_BASE_LIMIT)
    sys.set_int_max_str_digits = _clamped_set_int_max
    try:
        _real_set_int_max(_INT_STR_DIGITS_CAP)
    except Exception:
        pass
    # a poisoned gc.callbacks list would run player code during the NEXT run's gc
    try:
        gc.callbacks[:] = _BASE_GC_CALLBACKS
    except Exception:
        pass
    # re-apply the C-surface wrappers the run may have removed
    _arm_modules()
    # fresh text streams on fd 1 and 2 every run (a player may have patched or closed the old ones)
    sys.stdout = io.open(1, 'w', buffering=1 << 16, encoding='utf-8', errors='backslashreplace', closefd=False)
    sys.stderr = io.open(2, 'w', buffering=1 << 12, encoding='utf-8', errors='backslashreplace', closefd=False)
    sys.stdin = io.StringIO('')
    try:
        os.chdir(_BASE_CWD)
    except OSError:
        pass
    gc.enable()
    gc.collect()


def _hide_bridge():
    hidden = {}
    for name in list(sys.modules):
        root = name.split('.')[0]
        if root in _BLOCKED_ROOTS or root in _BANNED_ROOTS:
            hidden[name] = sys.modules.pop(name)
    _blocker.active = True
    return hidden


def _show_bridge(hidden):
    _blocker.active = False
    sys.modules.update(hidden)


def _player_frames(tb):
    return [f for f in traceback.extract_tb(tb) if f.filename == FILENAME]


def _describe(exc):
    """The exception as the player should see it: only frames from solution.py."""
    exc.__context__ = None
    exc.__cause__ = None
    te = traceback.TracebackException.from_exception(exc, capture_locals=False)
    frames = [f for f in te.stack if f.filename == FILENAME]
    te.stack = traceback.StackSummary.from_list(frames)
    text = ''.join(te.format())
    if len(text) > 20000:
        text = text[:10000] + '\n... (traceback cut) ...\n' + text[-8000:]
    last = frames[-1] if frames else None
    message = str(exc)
    if len(message) > 2000:
        message = message[:2000] + '...'
    return {
        'type': type(exc).__name__,
        'message': message,
        'line': last.lineno if last else None,
        'traceback': text,
    }


def _flush(streams):
    for stream in streams:
        try:
            stream.flush()
        except BaseException:
            pass


def _healthy():
    """False when the run broke something _restore() cannot repair (a closed fd 1 or 2)."""
    try:
        os.fstat(1)
        os.fstat(2)
        return True
    except BaseException:
        return False


def _audit(event, args):
    # an audit hook from player code survives every later run and cannot be removed, so refuse it
    if event == 'sys.addaudithook':
        raise RuntimeError('sys.addaudithook is not available in this game')


sys.addaudithook(_audit)

# fingerprint the callables/submodules of the modules the driver relies on; any
# change after a run marks the interpreter unhealthy so the page replaces it
_WATCH = ('io', '_io', 'os', 'json', 'traceback', 'linecache', 'gc', 'time', 'codecs', 'sys', 'ast')


def _fingerprint():
    fp = {}
    for name in _WATCH:
        m = sys.modules.get(name)
        fp[name] = (id(m), {k: id(v) for k, v in vars(m).items() if callable(v) or type(v) is type(sys)}) if m else None
    return fp


def _compile_error(exc, started):
    return json.dumps({
        'phase': 'compile', 'ok': False, 'limit': None,
        'error': {
            'type': type(exc).__name__, 'message': getattr(exc, 'msg', None) or str(exc),
            'line': getattr(exc, 'lineno', None), 'col': getattr(exc, 'offset', None),
            'endLine': getattr(exc, 'end_lineno', None), 'endCol': getattr(exc, 'end_offset', None),
            'text': (getattr(exc, 'text', '') or '').rstrip('\n'),
            'traceback': ''.join(traceback.format_exception_only(type(exc), exc)),
        },
        'pyMs': (time.perf_counter() - started) * 1000,
    })


def _disarm():
    # stop the interrupt buffer re-firing now that we are unwinding/cleaning up
    try:
        _JS_DISARM()
    except BaseException:
        pass


def _ink_run(source, stdin_text):
    global __ink_tc, __ink_stopped
    _restore()
    __ink_tc = 0
    __ink_stopped = False
    started = time.perf_counter()
    linecache.cache[FILENAME] = (len(source), None, [line + '\n' for line in source.split('\n')], FILENAME)
    # ---- compile (only the player's code; the harness was compiled at startup)
    try:
        tree = ast.parse(source, FILENAME, 'exec')
        _check_reserved(tree)
        tree = _Instrument().visit(tree)
        ast.fix_missing_locations(tree)
        code = compile(tree, FILENAME, 'exec', dont_inherit=True)
    except SyntaxError as e:   # includes IndentationError, TabError, _ReservedName
        return _compile_error(e, started)
    except (ValueError, OverflowError, MemoryError, RecursionError) as e:   # e.g. NUL bytes, absurd nesting
        return json.dumps({'phase': 'compile', 'ok': False, 'limit': None,
                           'error': {'type': type(e).__name__, 'message': str(e)[:2000], 'line': None},
                           'pyMs': (time.perf_counter() - started) * 1000})
    # ---- run
    _JS_STARTED()            # the time limit starts now
    namespace = {'__name__': 'solution', '__file__': FILENAME, '__builtins__': builtins,
                 '__ink_tick__': __ink_tick__, '__ink_iter__': __ink_iter__}
    streams = (sys.stdout, sys.stderr)
    hidden = _hide_bridge()
    progress = [0]
    limit, error = None, None
    try:
        exec(code, namespace)
        solution_class = namespace.get('Solution')
        if not isinstance(solution_class, type) or not callable(getattr(solution_class, 'solve', None)):
            raise NameError('solution.py must define a class Solution with a method solve(self, grid, ink)')
        _harness(solution_class, stdin_text, sys.stdout.write, progress, ANSWER_CHARS)
    except _InkStop:
        _disarm()
        limit = _JS_LIMITKIND() or 'time_limit'
    except MemoryError as e:
        _disarm()
        limit = 'memory_limit'
        error = {'type': 'MemoryError', 'message': 'ran out of memory', 'line': (_player_frames(e.__traceback__)[-1].lineno if _player_frames(e.__traceback__) else None)}
    except KeyboardInterrupt:
        # the interrupt buffer fired: a deadline reached through a C-driven loop
        _disarm()
        limit = _JS_LIMITKIND() or 'time_limit'
    except SystemExit as e:
        _disarm()
        kind = _JS_LIMITKIND()
        if kind:
            limit = kind
        else:
            frames = _player_frames(e.__traceback__)
            error = {'type': 'SystemExit', 'message': 'solve() must return; it called exit(%r)' % (e.code,),
                     'line': frames[-1].lineno if frames else None, 'test': progress[0]}
    except BaseException as e:   # the player's own error
        _disarm()
        kind = _JS_LIMITKIND()
        if kind:
            limit = kind
        else:
            error = _describe(e)
            error['test'] = progress[0]
    finally:
        _disarm()
        _show_bridge(hidden)
        _flush(streams)
    del namespace
    # run the garbage now, under this run's own deadline, so a looping __del__
    # (instrumented like any player function) stops at the deadline instead of
    # hanging the next run; the gc swallows a finalizer's _InkStop itself. The
    # interrupt buffer is disarmed by now, so the AST tick (mechanism 1) is what
    # stops a finalizer that spins a comprehension.
    try:
        gc.enable()
        gc.collect()
    except BaseException:
        pass
    # anything that burned past the deadline during the run or its cleanup (a
    # finalizer, a swallowed output flood) is still a limit, never a silent ok
    if limit is None and _JS_POLL():
        limit = _JS_LIMITKIND() or 'time_limit'
    intact = _fingerprint() == _BASE_FP
    healthy = _healthy() and intact and limit != 'memory_limit'
    return json.dumps({
        'phase': 'run', 'ok': error is None and limit is None, 'limit': limit,
        'error': error, 'pyMs': (time.perf_counter() - started) * 1000,
        'healthy': healthy, 'intact': intact, 'recursionLimit': sys.getrecursionlimit(),
    })


_BASE_FP = _fingerprint()
