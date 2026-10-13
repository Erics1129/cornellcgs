# Ink Maze level 26 (Python): the driver. Compiled once per worker by
# runtime.js. _ink_run(source, stdin_text) compiles the player's code as
# "solution.py" (so error lines are the player's own), rewrites it to honour
# the cooperative deadline, runs it in a fresh namespace, then runs the hidden
# harness against it, and returns a JSON string the runtime turns into a
# RuntimeOutcome. stdout/stderr bytes go to the JS capture the runtime installs.
#
# The worker is a WebAssembly thread; in WebKit worker.terminate() does not stop
# a running WebAssembly loop (contract.ts D1-D9), so the program must stop
# ITSELF at the deadline. Two cooperative mechanisms do that, both sticky:
#   1. an AST rewrite that calls __ink_tick__() at every loop body and function
#      entry; __ink_tick__ samples the clock and raises _InkStop once the
#      deadline (or an output/memory limit) has passed, and keeps raising, so a
#      bare `except` / `finally` loop cannot swallow it;
#   2. Pyodide's interrupt buffer, read as a getter in runtime.js, which makes
#      CPython's eval loop raise even inside a C-level loop the AST cannot see.
# The host's terminate() is only the backstop (a bug if it is ever needed).
#
# Names starting with "__ink" are reserved; player code that uses one is a
# compile error, so the player can neither shadow nor disable __ink_tick__.
import sys, io, os, gc, ast, json, time, builtins, traceback, linecache

FILENAME = 'solution.py'
RESERVED_PREFIX = '__ink'
_BLOCKED_ROOTS = ('js', 'pyodide', 'pyodide_js', '_pyodide', '_pyodide_core', 'micropip')
# poll the clock at most this many loop/function ticks apart (contract D2: <= ~50 ms of run between reads)
_TICK_SAMPLE = 2048

# ---- JS bridge (set as driver globals by runtime.js) -----------------------
#   _JS_STARTED()      compiling is done; the run deadline starts now
#   _JS_POLL()         truthy once the deadline passed or an output/memory limit was hit
#   _JS_LIMITKIND()    '' | 'time_limit' | 'memory_limit' | 'output_limit'
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


class _Instrument(ast.NodeTransformer):
    """Inserts __ink_tick__() at the top of every function body and loop body."""

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


class _ReservedName(SyntaxError):
    pass


def _check_reserved(tree):
    """Reject any player name starting with RESERVED_PREFIX, so __ink_tick__
    and the driver's own machinery cannot be shadowed or disabled."""
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
_harness_ns = {'__name__': '_ink_harness'}
exec(compile(HARNESS_SOURCE, '<harness>', 'exec'), _harness_ns)
_harness = _harness_ns['_ink_harness']


class _Blocker:
    """First finder on sys.meta_path: refuses the browser bridge modules while player code runs."""
    active = False

    def find_spec(self, name, path=None, target=None):
        if self.active and name.split('.')[0] in _BLOCKED_ROOTS:
            raise ModuleNotFoundError("module '%s' is not available in this game" % name, name=name)
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
        if name.split('.')[0] in _BLOCKED_ROOTS:
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
    namespace = {'__name__': 'solution', '__file__': FILENAME, '__builtins__': builtins, '__ink_tick__': __ink_tick__}
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
        limit = _JS_LIMITKIND() or 'time_limit'
    except MemoryError as e:
        limit = 'memory_limit'
        error = {'type': 'MemoryError', 'message': 'ran out of memory', 'line': (_player_frames(e.__traceback__)[-1].lineno if _player_frames(e.__traceback__) else None)}
    except KeyboardInterrupt:
        # Pyodide's interrupt buffer fired: a deadline we reach through a C-level loop
        limit = _JS_LIMITKIND() or 'time_limit'
    except SystemExit as e:
        kind = _JS_LIMITKIND()
        if kind:
            limit = kind
        else:
            frames = _player_frames(e.__traceback__)
            error = {'type': 'SystemExit', 'message': 'solve() must return; it called exit(%r)' % (e.code,),
                     'line': frames[-1].lineno if frames else None, 'test': progress[0]}
    except BaseException as e:   # the player's own error
        kind = _JS_LIMITKIND()
        if kind:
            limit = kind
        else:
            error = _describe(e)
            error['test'] = progress[0]
    finally:
        _show_bridge(hidden)
        _flush(streams)
    del namespace
    # run the garbage now, under this run's own deadline, so a looping __del__
    # (instrumented like any player function) stops at the deadline instead of
    # hanging the next run; the gc swallows a finalizer's _InkStop itself.
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
