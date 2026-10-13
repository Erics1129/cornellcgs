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
#      inside a `sum(... for ...)` that iterates in C). __ink_tick__ raises a
#      sticky, uncatchable _InkStop once the deadline passed, placed at the TOP
#      of each body (outside any player try), so a bare `except`/`finally` loop
#      cannot swallow it -- the next body re-enters the tick and re-raises.
#      CRUCIAL: the player code is compiled as the body of a nested function, so
#      __ink_tick__ and __ink_iter__ resolve as CLOSURE free variables
#      (LOAD_DEREF), NOT as player-writable globals (LOAD_GLOBAL). Writing
#      globals()['__ink_tick__'] = ... (or exec('__ink_tick__ = ...')) therefore
#      cannot shadow them: the injected calls never look at the player's globals.
#   2. Pyodide's interrupt buffer (runtime.js), read as a RE-ARMING getter that
#      returns SIGINT on every read while the deadline has passed. CPython's eval
#      loop raises KeyboardInterrupt at the next bytecode boundary, so ANY code
#      that runs bytecode per step -- a key= / reduce lambda, a callable-iterator
#      -- is stopped even though the AST never saw it, and a single swallow
#      cannot end the stop (it re-fires). The buffer is DISARMED only while the
#      driver formats a result / runs cleanup (where a re-fire used to corrupt
#      the interpreter), and re-armed, guarded, around any player-controlled
#      formatting (a looping __str__).
#   3. the C-level library loops that run with NO Python bytecode per step
#      (sum(range(1e18)), any(iter(int,1)), reduce(op.add, count()),
#      deque(count(), 0), math.factorial(1e8), re backtracking) cannot be
#      reached by 1 or 2, so they are BOUNDED at the source: the C consumers and
#      the infinite itertools / 2-arg iter sources are wrapped to drive their
#      input through a ticking Python generator (back to mechanism 1/2), the
#      heavy math builtins are capped, and the re module is refused. See _arm_setup().
# The host's terminate() is only the backstop (a bug if it is ever needed).
#
# Names starting with "__ink" are reserved; player code that uses one is a
# compile error, and the machinery lives in closure cells / the JS interrupt
# buffer that player code cannot rebind, so it can neither shadow nor disable it.
import sys, io, os, gc, ast, json, time, builtins, traceback, linecache, tokenize

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
# reject source whose brackets nest deeper than _MAX_NESTING, or whose leading
# whitespace is longer than _MAX_INDENT characters (a proxy for block nesting),
# BEFORE parsing: the WebKit wasm native stack is small and a deeply nested
# expression or block overflows the C parser (a Pyodide fatal + forced worker
# rebuild) instead of a clean compile error. Both caps are far beyond any real
# solution (WebKit was measured to overflow the parser past ~200 levels).
_MAX_NESTING = 100
_MAX_INDENT = 400
# attribute names that reach an object's closure cells / globals / frames; a
# player reading or writing one could rebind the deadline machinery's cell, so
# access to them is a compile error (defence in depth behind the JS buffer)
_INTROSPECT_ATTRS = frozenset((
    '__closure__', '__globals__', '__code__', 'cell_contents',
    'f_globals', 'f_locals', 'f_builtins', 'f_back', 'f_trace',
    'gi_frame', 'cr_frame', 'ag_frame',
))
# calls that would compile/run new code outside the instrumentation
_BANNED_CALLS = frozenset(('exec', 'eval', 'compile'))

# ---- JS bridge (set as driver globals by runtime.js) -----------------------
#   _JS_STARTED()      compiling is done; the run deadline starts now
#   _JS_POLL()         truthy once the deadline passed or an output/memory limit was hit
#   _JS_LIMITKIND()    '' | 'time_limit' | 'memory_limit' | 'output_limit'
#   _JS_DISARM()       disable the interrupt buffer (called the instant we leave player code)
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
    the C-consumer / infinite-source wrappers in _arm_setup()."""
    for item in iterable:
        __ink_tick__()
        yield item


# ---------------------------------------------------------------------------
# Instrumentation. The player code is parsed, screened, rewritten so every loop
# body / function entry / comprehension ticks, and then WRAPPED as the body of a
# nested function so the tick references compile to LOAD_DEREF (closure cells)
# instead of LOAD_GLOBAL. The wrapper is
#
#   def __ink_outer__(__ink_tick__, __ink_iter__):
#       def __ink_main__():
#           global <every name the player binds at module level>
#           <instrumented player body>
#       return __ink_main__
#
# The driver calls __ink_outer__ with the real tick/iter (so they become the
# cells) and then calls the returned __ink_main__(); because every player
# top-level name is declared global, module semantics (globals(), `global x`,
# recursion, classes, imports) are preserved exactly, while __ink_tick__ /
# __ink_iter__ are free variables the player cannot reach through globals().
_OUTER = '__ink_outer__'
_MAIN = '__ink_main__'


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


def _nesting_guard(source):
    """Return an error message if the source nests brackets or blocks deeper
    than is safe to hand to the C parser on WebKit's small wasm stack, else None.
    A plain character scan (NO tokenizer, NO ast.parse -- those are exactly what
    overflows) so a compile bomb is a clean compile_error, never a Pyodide fatal
    + forced worker rebuild. String literals and comments are skipped so their
    contents never false-trip the counter (a bomb lives in code); a bomb hidden
    inside an f-string replacement field would still fall through to the parser,
    but that only costs a recoverable rebuild, not a hang."""
    depth = maxdepth = 0
    i, n = 0, len(source)
    line_indent = 0            # leading-whitespace chars on the current line
    at_line_start = True
    while i < n:
        c = source[i]
        if c == '\n':
            at_line_start = True
            line_indent = 0
            i += 1
            continue
        if at_line_start and c in ' \t':
            line_indent += 1
            if line_indent > _MAX_INDENT:
                return 'your code is indented too deeply for this game'
            i += 1
            continue
        at_line_start = False
        if c == '#':
            j = source.find('\n', i)
            if j < 0:
                break
            i = j
            continue
        if c == '"' or c == "'":
            # a string literal: skip its whole content (prefixes like r/b/f are
            # just identifier characters before it and are harmless to the count)
            raw = False
            k = i - 1
            while k >= 0 and (source[k].isalnum() or source[k] == '_'):
                if source[k] in 'rR':
                    raw = True
                k -= 1
            triple = source[i:i + 3] in ('"""', "'''")
            quote = source[i:i + 3] if triple else c
            i += len(quote)
            while i < n:
                if not raw and source[i] == '\\':
                    i += 2
                    continue
                if source[i:i + len(quote)] == quote:
                    i += len(quote)
                    break
                i += 1
            continue
        if c in '([{':
            depth += 1
            if depth > maxdepth:
                maxdepth = depth
                if maxdepth > _MAX_NESTING:
                    return 'your code nests brackets too deeply for this game'
        elif c in ')]}':
            if depth > 0:
                depth -= 1
        i += 1
    return None


def _check_reserved(tree):
    """Reject player code that could reach or rebind the deadline machinery:
    any name starting with RESERVED_PREFIX, assignment to a `__ink*` subscript or
    attribute, access to a closure/frame introspection attribute, and direct
    exec/eval/compile. Everything the deadline relies on then lives in closure
    cells or the JS interrupt buffer, out of the player's reach."""
    def fail(message, node):
        e = _ReservedName(message)
        e.lineno = getattr(node, 'lineno', None)
        e.offset = (getattr(node, 'col_offset', 0) or 0) + 1
        e.filename = FILENAME
        e.text = None
        raise e

    def bad_name(name, node):
        if isinstance(name, str) and name.startswith(RESERVED_PREFIX):
            fail('names starting with "%s" are reserved by the judge' % RESERVED_PREFIX, node)

    for node in ast.walk(tree):
        if isinstance(node, (ast.FunctionDef, ast.AsyncFunctionDef, ast.ClassDef)):
            bad_name(node.name, node)
        elif isinstance(node, ast.Name):
            bad_name(node.id, node)
        elif isinstance(node, (ast.Global, ast.Nonlocal)):
            for n in node.names:
                bad_name(n, node)
        elif isinstance(node, ast.arg):
            bad_name(node.arg, node)
        elif isinstance(node, (ast.Import, ast.ImportFrom)):
            for alias in node.names:
                bad_name(alias.asname or alias.name, node)
        elif isinstance(node, ast.keyword) and node.arg:
            bad_name(node.arg, node)
        elif isinstance(node, ast.Attribute):
            # x.__ink... = / del x.__ink...   (rebinding the machinery via attrs)
            if isinstance(node.ctx, (ast.Store, ast.Del)) and node.attr.startswith(RESERVED_PREFIX):
                fail('names starting with "%s" are reserved by the judge' % RESERVED_PREFIX, node)
            # reading or writing a closure / frame internal
            if node.attr in _INTROSPECT_ATTRS:
                fail('access to "%s" is not available in this game' % node.attr, node)
        elif isinstance(node, ast.Subscript) and isinstance(node.ctx, (ast.Store, ast.Del)):
            key = node.slice
            if isinstance(key, ast.Constant) and isinstance(key.value, str) and key.value.startswith(RESERVED_PREFIX):
                fail('names starting with "%s" are reserved by the judge' % RESERVED_PREFIX, node)
        elif isinstance(node, ast.Call):
            func = node.func
            if isinstance(func, ast.Name) and func.id in _BANNED_CALLS:
                fail('%s() is not available in this game' % func.id, func)
            # getattr/setattr/delattr with a constant dangerous attribute name
            if isinstance(func, ast.Name) and func.id in ('getattr', 'setattr', 'delattr') and len(node.args) >= 2:
                key = node.args[1]
                if isinstance(key, ast.Constant) and isinstance(key.value, str) and (key.value in _INTROSPECT_ATTRS or key.value.startswith(RESERVED_PREFIX)):
                    fail('access to "%s" is not available in this game' % key.value, node)


def _module_assigned_names(source):
    """The names the player binds at module (top) level, via symtable -- the
    authority on Python's scoping, so `global`, walrus in a comprehension, etc.
    are all correct. Declared `global` inside __ink_main__ so wrapping the player
    code in a function keeps exact module semantics."""
    try:
        table = __import__('symtable').symtable(source, FILENAME, 'exec')
    except Exception:
        return []
    names = []
    for sym in table.get_symbols():
        name = sym.get_name()
        if name.startswith(RESERVED_PREFIX):
            continue
        try:
            assigned = sym.is_assigned() or sym.is_imported()
        except Exception:
            assigned = sym.is_assigned()
        if assigned:
            names.append(name)
    return sorted(set(names))


def _wrap(player_body, global_names):
    """Build the Module that defines __ink_outer__ (see the block comment)."""
    inner = []
    if global_names:
        inner.append(ast.Global(names=list(global_names)))
    inner.extend(player_body)
    if not inner:
        inner.append(ast.Pass())
    empty_args = ast.arguments(posonlyargs=[], args=[], vararg=None, kwonlyargs=[], kw_defaults=[], kwarg=None, defaults=[])
    outer_args = ast.arguments(posonlyargs=[], args=[ast.arg(arg='__ink_tick__'), ast.arg(arg='__ink_iter__')], vararg=None, kwonlyargs=[], kw_defaults=[], kwarg=None, defaults=[])
    main = ast.FunctionDef(name=_MAIN, args=empty_args, body=inner, decorator_list=[], returns=None, type_comment=None, type_params=[])
    outer = ast.FunctionDef(name=_OUTER, args=outer_args,
                            body=[main, ast.Return(value=ast.Name(id=_MAIN, ctx=ast.Load()))],
                            decorator_list=[], returns=None, type_comment=None, type_params=[])
    module = ast.Module(body=[outer], type_ignores=[])
    # scaffolding lines map to line 1; player nodes keep their own locations
    for node in (module, outer, main, outer.body[-1], outer_args, empty_args):
        node.lineno = getattr(node, 'lineno', 1) or 1
        node.col_offset = getattr(node, 'col_offset', 0) or 0
    if global_names:
        inner[0].lineno = 1
        inner[0].col_offset = 0
    return module


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
_real_addaudithook = None
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


def _capped_bits(real, max_bits):
    """Reject an int argument whose bit length is beyond max_bits (a clean
    ValueError), for ops whose cost scales with the operand size, not its value."""
    if _is_wrapped(real):
        return real
    def wrapper(n, *rest):
        if isinstance(n, int) and n.bit_length() > max_bits:
            raise ValueError('argument too large for this game')
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


def _refuse_addaudithook(*args, **kw):
    # auditing is inert in this Pyodide build (hooks are added but never fire),
    # so refusing the CALL itself -- not relying on a 'sys.addaudithook' audit
    # event -- is the only way to actually keep a persistent hook out.
    raise RuntimeError('sys.addaudithook is not available in this game')


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
    exposed or make the fingerprint drift. __ink_tick__/__ink_iter__ are NOT put
    in builtins or the player namespace: they reach player code only as closure
    cells, so they cannot be shadowed through globals()/builtins."""
    b = builtins
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
    if _real_addaudithook is not None:
        sys.addaudithook = _refuse_addaudithook


def _arm_setup():
    """Import the bounded modules once, build every wrapper from the untouched
    original, and arm everything. Runs once at startup, before _BASE_FP."""
    global _math, _functools, _collections, _operator, _itertools
    global _real_set_int_max, _real_addaudithook, _os_close_guard, _ticking_deque
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
    if hasattr(_math, 'isqrt'):
        # isqrt of an astronomically large int is a real compute/alloc cost (and
        # drags in _pylong); cap by the argument's bit length so every ordinary
        # isqrt(1_000_000) etc. still works while a 400-Mbit bomb is a clean error
        math_attrs['isqrt'] = _capped_bits(_math.isqrt, 1 << 20)
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

    # a persistent audit hook cannot be removed and would survive every later
    # run, so refuse sys.addaudithook outright (the audit event is inert here)
    _real_addaudithook = sys.addaudithook

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

# Pre-load the private helpers CPython reaches for on big-integer <-> string work
# (_pylong imports re lazily). Loading them now -- before re is hidden from the
# player -- means the interpreter's own later use finds them cached and keeps its
# private re reference, so a huge-int operation reports its true error instead of
# a masked 'module re is not available'. The player's own `import re` still fails.
for _preload in ('_pylong',):
    try:
        __import__(_preload)
    except Exception:
        pass

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
    if _real_addaudithook is not None:
        sys.addaudithook = _refuse_addaudithook
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
    """Walk the traceback by frame metadata only -- NO linecache / source read,
    so it never triggers tokenize -> `import re` (which _hide_bridge refuses) and
    never runs a hostile __repr__. Returns (lineno, co_name) for player frames."""
    out = []
    while tb is not None:
        co = tb.tb_frame.f_code
        name = co.co_name or ''
        if co.co_filename == FILENAME and not name.startswith(RESERVED_PREFIX):
            out.append((tb.tb_lineno, name))
        tb = tb.tb_next
    return out


def _src_line(lineno):
    entry = linecache.cache.get(FILENAME)
    if entry and isinstance(lineno, int) and 1 <= lineno <= len(entry[2]):
        return entry[2][lineno - 1].rstrip('\n')
    return ''


def _safe_message(exc):
    """The exception's message WITHOUT running player code. str() is only called
    on genuine builtin exceptions (identity-checked, so a player subclass with a
    hostile __str__ cannot loop or crash us); for anything else we take a string
    first arg if there is one. This is why a looping __str__ is a clean
    runtime_error instead of a Pyodide-fatal 'crashed'."""
    etype = type(exc)
    message = ''
    if getattr(builtins, etype.__name__, None) is etype:
        try:
            message = str(exc)
        except BaseException:
            message = ''
    else:
        try:
            args = exc.args
            if args and isinstance(args[0], str):
                message = args[0]
        except BaseException:
            message = ''
    if len(message) > 2000:
        message = message[:2000] + '...'
    return message


def _describe(exc):
    """The exception as the player should see it, formatted from solution.py
    frames only, without TracebackException (no re import), without reading the
    driver's own source, and without invoking a hostile __str__/__repr__. Never
    raises, never hangs."""
    frames = _player_frames(exc.__traceback__)
    line = frames[-1][0] if frames else None
    etype = type(exc).__name__
    message = _safe_message(exc)
    lines = ['Traceback (most recent call last):']
    for (ln, name) in frames[-50:]:
        where = '<solution>' if (name == _MAIN or name.startswith(RESERVED_PREFIX)) else name
        lines.append('  File "%s", line %d, in %s' % (FILENAME, ln, where))
        src = _src_line(ln).strip()
        if src:
            lines.append('    ' + src)
    lines.append(('%s: %s' % (etype, message)) if message else etype)
    text = '\n'.join(lines) + '\n'
    if len(text) > 20000:
        text = text[:10000] + '\n... (traceback cut) ...\n' + text[-8000:]
    return {'type': etype, 'message': message, 'line': line, 'traceback': text}


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
    # defence in case this Pyodide build ever makes auditing live
    if event == 'sys.addaudithook':
        raise RuntimeError('sys.addaudithook is not available in this game')


# register through the real hook (sys.addaudithook is now the refusing wrapper)
(_real_addaudithook or sys.addaudithook)(_audit)

# fingerprint the callables/submodules of the modules the driver relies on; any
# change after a run marks the interpreter unhealthy so the page replaces it
_WATCH = ('io', '_io', 'os', 'json', 'traceback', 'linecache', 'gc', 'time', 'codecs', 'sys', 'ast', 'tokenize')


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
    # stop the interrupt buffer re-firing; retry so a re-fire at the handler's
    # own first bytecodes cannot prevent the disarm from landing
    while True:
        try:
            _JS_DISARM()
            return
        except _InkStop:
            continue
        except KeyboardInterrupt:
            continue
        except BaseException:
            return


def _ink_run(source, stdin_text):
    global __ink_tc, __ink_stopped
    _restore()
    __ink_tc = 0
    __ink_stopped = False
    started = time.perf_counter()
    linecache.cache[FILENAME] = (len(source), None, [line + '\n' for line in source.split('\n')], FILENAME)
    # ---- compile (only the player's code; the harness was compiled at startup)
    try:
        guard = _nesting_guard(source)
        if guard:
            e = SyntaxError(guard)
            e.lineno = 1
            e.offset = 1
            e.filename = FILENAME
            return _compile_error(e, started)
        tree = ast.parse(source, FILENAME, 'exec')
        _check_reserved(tree)
        tree = _Instrument().visit(tree)
        ast.fix_missing_locations(tree)
        global_names = _module_assigned_names(source)
        wrapped = _wrap(tree.body, global_names)
        ast.fix_missing_locations(wrapped)
        code = compile(wrapped, FILENAME, 'exec', dont_inherit=True)
    except SyntaxError as e:   # includes IndentationError, TabError, _ReservedName
        return _compile_error(e, started)
    except (ValueError, OverflowError, MemoryError, RecursionError) as e:   # e.g. NUL bytes, absurd nesting
        return json.dumps({'phase': 'compile', 'ok': False, 'limit': None,
                           'error': {'type': type(e).__name__, 'message': str(e)[:2000], 'line': None},
                           'pyMs': (time.perf_counter() - started) * 1000})
    # ---- run
    _JS_STARTED()            # the time limit starts now
    namespace = {'__name__': 'solution', '__file__': FILENAME, '__builtins__': builtins}
    streams = (sys.stdout, sys.stderr)
    hidden = _hide_bridge()
    progress = [0]
    limit, error = None, None
    try:
        try:
            exec(code, namespace)
            make_main = namespace.pop(_OUTER, None)
            if make_main is None:
                raise RuntimeError('solution.py could not be prepared')
            main = make_main(__ink_tick__, __ink_iter__)
            main()
            solution_class = namespace.get('Solution')
            if not isinstance(solution_class, type) or not callable(getattr(solution_class, 'solve', None)):
                raise NameError('solution.py must define a class Solution with a method solve(self, grid, ink)')
            _harness(solution_class, stdin_text, sys.stdout.write, progress, ANSWER_CHARS)
        finally:
            # leaving player/harness code: disarm the interrupt buffer FIRST, so
            # it cannot re-fire during the formatting / gc that follows (that
            # re-fire used to escape as a fatal that lost sys.stderr)
            _disarm()
    except _InkStop:
        limit = _JS_LIMITKIND() or 'time_limit'
    except MemoryError as e:
        limit = 'memory_limit'
        _mf = _player_frames(e.__traceback__)
        error = {'type': 'MemoryError', 'message': 'ran out of memory', 'line': (_mf[-1][0] if _mf else None)}
    except KeyboardInterrupt:
        # the interrupt buffer fired: a deadline reached through a C-driven loop
        limit = _JS_LIMITKIND() or 'time_limit'
    except SystemExit as e:
        kind = _JS_LIMITKIND()
        if kind:
            limit = kind
        else:
            frames = _player_frames(e.__traceback__)
            error = {'type': 'SystemExit', 'message': 'solve() must return; it called exit(%r)' % (e.code,),
                     'line': frames[-1][0] if frames else None, 'test': progress[0]}
    except BaseException as e:   # the player's own error
        kind = _JS_LIMITKIND()
        if kind:
            limit = kind
        else:
            try:
                error = _describe(e)
            except _InkStop:
                limit = _JS_LIMITKIND() or 'time_limit'
            except BaseException:
                error = {'type': type(e).__name__, 'message': 'your code raised an error', 'line': None, 'traceback': ''}
            if error is not None:
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
