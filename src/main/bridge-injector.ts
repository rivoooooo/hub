import { getRaw as getBridgeConfig } from './bridge-store'

/**
 * Set of webContents ids that already have a bridge did-finish-load listener attached.
 * Shared across BrowserManager and DockWindowManager.
 */
const bridgeListeners = new Set<number>()

/**
 * Register a did-finish-load listener for bridge injection if not already
 * registered, so that page navigations always re-inject the bridge.
 */
export function ensureBridgeListener(webContents: Electron.WebContents): void {
  const id = webContents.id
  if (bridgeListeners.has(id)) return
  bridgeListeners.add(id)

  webContents.on('did-finish-load', () => {
    injectBridge(webContents)
  })

  webContents.on('destroyed', () => {
    bridgeListeners.delete(id)
  })
}

/**
 * Inject the bridge object into a WebContents using executeJavaScript.
 *
 * Creates a Proxy-based recursive tree that mirrors the user-defined
 * BridgeNode tree config.  Leaf (function) nodes route calls to the
 * main process via `window.__bridgeCall`.  Object nodes return nested
 * Proxy sub‑trees for further access (e.g. `bridge.user.profile(id)`).
 */
export function injectBridge(webContents: Electron.WebContents): void {
  if (webContents.isDestroyed()) return

  const config = getBridgeConfig()
  if (!config.enabled || !config.globalName) return

  const treeJson = JSON.stringify(config.tree)
  const globalName = config.globalName

  const js = `
(function(){
  var tree = ${treeJson};

  function deepEqual(a, b) {
    if (a === b) return true;
    if (a == null || b == null) return false;
    if (typeof a !== typeof b) return false;
    if (typeof a === 'object') {
      var aKeys = Object.keys(a);
      var bKeys = Object.keys(b);
      if (aKeys.length !== bKeys.length) return false;
      for (var i = 0; i < aKeys.length; i++) {
        if (!deepEqual(a[aKeys[i]], b[aKeys[i]])) return false;
      }
      return true;
    }
    return a === b;
  }

  function buildProxy(path, node) {
    if (node.type === 'function') {
      var fc = node.functionConfig;
      if (fc && fc.responseMode === 'sync') {
        // declarative sync — inline matching logic, no IPC
        if (fc.mode === 'declarative') {
          var _params = fc.params || [];
          var _entries = fc.matchEntries || [];
          var _fallback = fc.fallbackReturnValue;
          // Pre-parse return values
          for (var _i = 0; _i < _entries.length; _i++) {
            var _entry = _entries[_i];
            if (_entry.returnValue) {
              try { _entry._parsed = JSON.parse(_entry.returnValue); } catch(e) { _entry._parsed = _entry.returnValue; }
            } else {
              _entry._parsed = null;
            }
          }
          var _parsedFallback;
          if (_fallback !== undefined) {
            try { _parsedFallback = JSON.parse(_fallback); } catch(e) { _parsedFallback = _fallback; }
          }
          return function() {
            var args = Array.prototype.slice.call(arguments);
            for (var i = 0; i < _entries.length; i++) {
              var entry = _entries[i];
              var allMatch = true;
              for (var j = 0; j < entry.conditions.length; j++) {
                var cond = entry.conditions[j];
                var paramIdx = -1;
                for (var k = 0; k < _params.length; k++) {
                  if (_params[k].name === cond.paramName) { paramIdx = k; break; }
                }
                if (paramIdx === -1) { allMatch = false; break; }
                var arg = args[paramIdx];
                if (arg === undefined) {
                  if (_params[paramIdx].optional) continue;
                  allMatch = false; break;
                }
                if (cond.matchValue) {
                  try {
                    var matchObj = JSON.parse(cond.matchValue);
                    if (!deepEqual(arg, matchObj)) { allMatch = false; break; }
                  } catch(e) {
                    if (String(arg) !== cond.matchValue) { allMatch = false; break; }
                  }
                }
              }
              if (allMatch) return entry._parsed;
            }
            if (_parsedFallback !== undefined) return _parsedFallback;
            return { error: 'declarative: no matching entry and no fallback' };
          };
        }
        // static sync — inline the parsed value directly
        var _val;
        try { _val = JSON.parse(fc.returnValue); } catch(e) { _val = fc.returnValue; }
        return function() { return _val; };
      }
      // Default async mode — route via IPC
      return function() {
        var args = Array.prototype.slice.call(arguments);
        var ch = window.__bridgeCall;
        if (!ch || !ch.call) return Promise.resolve({ error: 'bridge:call not available' });
        return ch.call(path, args);
      };
    }
    // object type — return a Proxy that lazily resolves children
    var handler = {
      get: function(target, prop) {
        if (prop === 'then') return undefined;
        if (prop === '__isBridgeProxy') return true;
        /* istanbul ignore next */
        if (!node.children) return undefined;
        var child = node.children.find(function(c) { return c.name === prop; });
        if (!child) return undefined;
        return buildProxy(path.concat([prop]), child);
      },
      apply: function(target, thisArg, args) {
        // called as a function — route to main process
        var ch = window.__bridgeCall;
        if (!ch || !ch.call) return Promise.resolve({ error: 'bridge:call not available' });
        return ch.call(path, Array.prototype.slice.call(args));
      }
    };
    return new Proxy(function(){}, handler);
  }

  var root = {};
  tree.forEach(function(node) {
    root[node.name] = buildProxy([node.name], node);
  });

  Object.defineProperty(window, '${globalName}', {
    value: root,
    writable: false,
    configurable: true
  });
})();
`

  webContents.executeJavaScript(js).catch(() => {
    // Inject may fail if page isn't ready — that's fine
  })
}
