# CCM — Claude Code Manager: Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build `ccm`, an open-source CLI + web dashboard that lets you monitor and control multiple Claude Code terminal sessions from your phone, from anywhere.

**Architecture:** A Node.js backend manages tmux sessions and watches `~/.ccm/sessions/` (via chokidar) for hook events written by a companion `ccm-hook` binary that is registered globally in `~/.claude/settings.json`. A vanilla JS PWA dashboard is served by the backend over HTTP + WebSocket and is accessible remotely via Tailscale or Cloudflare Tunnel.

**Tech Stack:** Node.js 18+, Express, ws, chokidar, commander, tmux (system), cloudflared (system, optional), Jest for tests.

**Spec:** `docs/superpowers/specs/2026-03-18-ccm-design.md`

**GitHub:** `https://github.com/Fbuettnerxxx/claudecode_terminal_manager`

---

## File Structure

```
claudecode_terminal_manager/
├── package.json                  # Dependencies + npm scripts + bin entries
├── .gitignore
├── README.md
├── bin/
│   ├── ccm                       # Main CLI entry (#!/usr/bin/env node)
│   └── ccm-hook                  # Hook runner entry (#!/usr/bin/env node)
├── src/
│   ├── cli/
│   │   ├── index.js              # Commander setup, registers all subcommands
│   │   ├── cmd-start.js          # `ccm start` — boot server + register hooks
│   │   ├── cmd-stop.js           # `ccm stop` — stop server + deregister hooks
│   │   ├── cmd-new.js            # `ccm new <label> [path]` — create tmux session
│   │   ├── cmd-list.js           # `ccm list` — print session table
│   │   └── cmd-tunnel.js         # `ccm tunnel tailscale|cloudflare`
│   ├── hook/
│   │   └── index.js              # ccm-hook logic: write event to ~/.ccm/sessions/<id>.json
│   ├── backend/
│   │   ├── server.js             # Express + WebSocket server (port from config)
│   │   ├── watcher.js            # chokidar watches ~/.ccm/sessions/ → broadcasts WS events
│   │   ├── sessions.js           # In-memory session store + state machine
│   │   ├── tmux.js               # tmux wrapper: new-window, send-keys, list-windows
│   │   ├── stats.js              # Daily stats: toolsRun, sessionsActive, inputsSent
│   │   └── auth.js               # Token auth middleware (Cloudflare mode only)
│   ├── hooks-config/
│   │   └── index.js              # Read/write ~/.claude/settings.json hooks section
│   └── tunnel/
│       ├── tailscale.js          # Print Tailscale IP-based URL
│       └── cloudflare.js         # Spawn cloudflared, capture public URL
├── public/
│   ├── index.html                # PWA shell (loads app.js + styles.css)
│   ├── app.js                    # Dashboard: WebSocket client, session card rendering
│   ├── styles.css                # Mobile-first styles, animations, gamification
│   └── manifest.json             # PWA manifest (name, icons, theme)
└── tests/
    ├── hook.test.js              # ccm-hook: state file writes, exit-0 on error
    ├── sessions.test.js          # State machine transitions
    ├── stats.test.js             # Daily stats accumulation + midnight rollover
    ├── auth.test.js              # Token middleware: valid/invalid/missing token
    ├── hooks-config.test.js      # Merge hooks in, remove hooks cleanly
    └── tmux.test.js              # tmux wrapper: commands constructed correctly
```

---

## Task 1: Project scaffold

**Files:**
- Create: `package.json`
- Create: `.gitignore`
- Create: `bin/ccm`
- Create: `bin/ccm-hook`
- Create: `src/cli/index.js`

- [ ] **Step 1: Initialize npm project**

```bash
cd /Users/friedrichbuttner/API_agent
npm init -y
```

- [ ] **Step 2: Install dependencies**

```bash
npm install express ws chokidar commander
npm install --save-dev jest
```

- [ ] **Step 3: Update package.json**

Replace the generated `package.json` with:

```json
{
  "name": "ccm",
  "version": "0.1.0",
  "description": "Monitor and control Claude Code sessions from your phone",
  "license": "MIT",
  "bin": {
    "ccm": "./bin/ccm",
    "ccm-hook": "./bin/ccm-hook"
  },
  "scripts": {
    "start": "node bin/ccm start",
    "test": "jest --testEnvironment node"
  },
  "dependencies": {
    "chokidar": "^3.6.0",
    "commander": "^12.0.0",
    "express": "^4.18.0",
    "ws": "^8.16.0"
  },
  "devDependencies": {
    "jest": "^29.0.0"
  }
}
```

- [ ] **Step 4: Create bin/ccm**

```js
#!/usr/bin/env node
require('../src/cli/index.js');
```

Make it executable: `chmod +x bin/ccm`

- [ ] **Step 5: Create bin/ccm-hook**

```js
#!/usr/bin/env node
require('../src/hook/index.js');
```

Make it executable: `chmod +x bin/ccm-hook`

- [ ] **Step 6: Create stub src/cli/index.js**

```js
const { program } = require('commander');
const { version } = require('../package.json');

program
  .name('ccm')
  .description('Claude Code Manager')
  .version(version);

// Subcommands registered in later tasks
require('./cmd-start')(program);
require('./cmd-stop')(program);
require('./cmd-new')(program);
require('./cmd-list')(program);
require('./cmd-tunnel')(program);

program.parse();
```

- [ ] **Step 7: Create stub files for commands (just enough to not crash)**

`src/cli/cmd-start.js`:
```js
module.exports = (program) => {
  program.command('start').description('Start ccm server').action(() => {
    console.log('start: not yet implemented');
  });
};
```

Repeat the same stub pattern for `cmd-stop.js`, `cmd-new.js`, `cmd-list.js`, `cmd-tunnel.js`.

- [ ] **Step 8: Create .gitignore**

```
node_modules/
.superpowers/
```

- [ ] **Step 9: Verify CLI entry works**

```bash
node bin/ccm --help
```

Expected output includes: `Usage: ccm [options] [command]` and lists `start`, `stop`, `new`, `list`, `tunnel`.

- [ ] **Step 10: Commit**

```bash
git add package.json package-lock.json .gitignore bin/ src/cli/
git commit -m "feat: project scaffold — CLI entry, bin stubs, dependencies"
```

---

## Task 2: ccm-hook binary

The hook binary is called by Claude Code on every tool event. It must always exit 0, write a state file, and fail silently if anything goes wrong.

**Files:**
- Create: `src/hook/index.js`
- Create: `tests/hook.test.js`

- [ ] **Step 1: Write failing tests**

`tests/hook.test.js`:
```js
const fs = require('fs');
const path = require('path');
const os = require('os');

// We test the core writeEvent function in isolation
const { writeEvent } = require('../src/hook/index.js');

describe('ccm-hook writeEvent', () => {
  let tmpDir;

  beforeEach(() => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'ccm-test-'));
  });

  afterEach(() => {
    fs.rmSync(tmpDir, { recursive: true });
  });

  test('writes state file with correct fields', () => {
    writeEvent({ sessionId: 'abc123', event: 'pre-tool', toolName: 'Edit', sessionsDir: tmpDir });
    const data = JSON.parse(fs.readFileSync(path.join(tmpDir, 'abc123.json'), 'utf8'));
    expect(data.sessionId).toBe('abc123');
    expect(data.state).toBe('working');
    expect(data.lastToolName).toBe('Edit');
    expect(data.cwd).toBeTruthy(); // cwd is written
    expect(data.updatedAt).toBeTruthy();
  });

  test('stop event sets state to waiting', () => {
    writeEvent({ sessionId: 'abc123', event: 'stop', sessionsDir: tmpDir });
    const data = JSON.parse(fs.readFileSync(path.join(tmpDir, 'abc123.json'), 'utf8'));
    expect(data.state).toBe('waiting');
  });

  test('post-tool event updates lastToolName but keeps working state', () => {
    writeEvent({ sessionId: 'abc123', event: 'pre-tool', toolName: 'Read', sessionsDir: tmpDir });
    writeEvent({ sessionId: 'abc123', event: 'post-tool', toolName: 'Read', sessionsDir: tmpDir });
    const data = JSON.parse(fs.readFileSync(path.join(tmpDir, 'abc123.json'), 'utf8'));
    expect(data.state).toBe('working');
    expect(data.lastToolName).toBe('Read');
  });

  test('creates sessions dir if missing', () => {
    const nestedDir = path.join(tmpDir, 'sessions');
    writeEvent({ sessionId: 'abc123', event: 'stop', sessionsDir: nestedDir });
    expect(fs.existsSync(path.join(nestedDir, 'abc123.json'))).toBe(true);
  });

  test('falls back to synthetic ID when sessionId is empty', () => {
    writeEvent({ sessionId: '', event: 'stop', sessionsDir: tmpDir });
    const files = fs.readdirSync(tmpDir);
    expect(files.length).toBe(1);
    expect(files[0]).toMatch(/\.json$/);
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

```bash
npx jest tests/hook.test.js --no-coverage
```

Expected: FAIL — `Cannot find module '../src/hook/index.js'`

- [ ] **Step 3: Implement src/hook/index.js**

```js
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

const DEFAULT_SESSIONS_DIR = path.join(process.env.HOME, '.ccm', 'sessions');
const ERROR_LOG = path.join(process.env.HOME, '.ccm', 'hook-errors.log');

function deriveSyntheticId() {
  const base = `${process.env.CLAUDE_PROJECT_ID || 'unknown'}-${process.ppid || process.pid}`;
  return crypto.createHash('sha1').update(base).digest('hex').slice(0, 12);
}

function writeEvent({ sessionId, event, toolName, sessionsDir = DEFAULT_SESSIONS_DIR }) {
  const id = sessionId || deriveSyntheticId();
  fs.mkdirSync(sessionsDir, { recursive: true });

  const filePath = path.join(sessionsDir, `${id}.json`);

  let existing = {};
  try { existing = JSON.parse(fs.readFileSync(filePath, 'utf8')); } catch (_) {}

  const stateMap = { 'pre-tool': 'working', 'post-tool': 'working', 'stop': 'waiting' };
  const state = stateMap[event] || 'unknown';

  const updated = {
    ...existing,
    sessionId: id,
    state,
    cwd: process.env.PWD || process.cwd(),
    updatedAt: new Date().toISOString(),
    ...(toolName ? { lastToolName: toolName } : {}),
  };

  fs.writeFileSync(filePath, JSON.stringify(updated, null, 2));
}

function logError(msg) {
  try {
    fs.mkdirSync(path.dirname(ERROR_LOG), { recursive: true });
    fs.appendFileSync(ERROR_LOG, `[${new Date().toISOString()}] ${msg}\n`);
  } catch (_) {}
}

// CLI entry point
if (require.main === module) {
  try {
    const [, , event, sessionId, toolName] = process.argv;
    const envSessionId = process.env.CLAUDE_SESSION_ID || sessionId || '';
    if (!envSessionId) {
      logError(`WARN: CLAUDE_SESSION_ID not set, using synthetic ID`);
    }
    writeEvent({ sessionId: envSessionId, event, toolName });
  } catch (err) {
    logError(err.message);
  }
  process.exit(0); // Always exit 0 so Claude Code is never blocked
}

module.exports = { writeEvent };
```

- [ ] **Step 4: Run tests to verify they pass**

```bash
npx jest tests/hook.test.js --no-coverage
```

Expected: PASS (5 tests)

- [ ] **Step 5: Commit**

```bash
git add src/hook/index.js tests/hook.test.js
git commit -m "feat: ccm-hook binary — writes session state files, always exits 0"
```

---

## Task 3: hooks-config (register/deregister global Claude Code hooks)

**Files:**
- Create: `src/hooks-config/index.js`
- Create: `tests/hooks-config.test.js`

- [ ] **Step 1: Write failing tests**

`tests/hooks-config.test.js`:
```js
const { registerHooks, deregisterHooks, CCM_HOOK_MARKER } = require('../src/hooks-config/index.js');

describe('hooks-config', () => {
  test('registerHooks adds three hook entries with marker', () => {
    const settings = {};
    const result = registerHooks(settings, '/usr/local/bin/ccm-hook');
    expect(result.hooks.PreToolUse).toHaveLength(1);
    expect(result.hooks.PostToolUse).toHaveLength(1);
    expect(result.hooks.Stop).toHaveLength(1);
    expect(result.hooks.PreToolUse[0].hooks[0].command).toContain('ccm-hook');
    expect(result.hooks.PreToolUse[0][CCM_HOOK_MARKER]).toBe(true);
  });

  test('registerHooks preserves existing hooks', () => {
    const settings = {
      hooks: {
        PreToolUse: [{ hooks: [{ type: 'command', command: 'other-hook' }] }],
      },
    };
    const result = registerHooks(settings, '/usr/local/bin/ccm-hook');
    expect(result.hooks.PreToolUse).toHaveLength(2);
    expect(result.hooks.PreToolUse[0].hooks[0].command).toBe('other-hook');
  });

  test('registerHooks is idempotent — does not duplicate', () => {
    const settings = {};
    const once = registerHooks(settings, '/usr/local/bin/ccm-hook');
    const twice = registerHooks(once, '/usr/local/bin/ccm-hook');
    expect(twice.hooks.PreToolUse).toHaveLength(1);
  });

  test('deregisterHooks removes only ccm-injected hooks', () => {
    const settings = {
      hooks: {
        PreToolUse: [
          { [CCM_HOOK_MARKER]: true, hooks: [{ type: 'command', command: 'ccm-hook pre-tool' }] },
          { hooks: [{ type: 'command', command: 'other-hook' }] },
        ],
      },
    };
    const result = deregisterHooks(settings);
    expect(result.hooks.PreToolUse).toHaveLength(1);
    expect(result.hooks.PreToolUse[0].hooks[0].command).toBe('other-hook');
  });

  test('deregisterHooks handles settings with no hooks gracefully', () => {
    const result = deregisterHooks({});
    expect(result.hooks).toBeUndefined();
  });
});
```

- [ ] **Step 2: Run to verify failure**

```bash
npx jest tests/hooks-config.test.js --no-coverage
```

Expected: FAIL

- [ ] **Step 3: Implement src/hooks-config/index.js**

```js
const CCM_HOOK_MARKER = '_ccm';

function buildHookEntry(hookBin, event) {
  const eventArg = event.toLowerCase().replace('use', '');
  return {
    [CCM_HOOK_MARKER]: true,
    matcher: '*',
    hooks: [{
      type: 'command',
      command: `${hookBin} ${eventArg} "$CLAUDE_SESSION_ID" "$CLAUDE_TOOL_NAME"`,
    }],
  };
}

function registerHooks(settings, hookBin) {
  const result = JSON.parse(JSON.stringify(settings)); // deep clone
  result.hooks = result.hooks || {};

  for (const event of ['PreToolUse', 'PostToolUse', 'Stop']) {
    result.hooks[event] = result.hooks[event] || [];
    const alreadyRegistered = result.hooks[event].some(e => e[CCM_HOOK_MARKER]);
    if (!alreadyRegistered) {
      result.hooks[event].push(buildHookEntry(hookBin, event));
    }
  }
  return result;
}

function deregisterHooks(settings) {
  const result = JSON.parse(JSON.stringify(settings));
  if (!result.hooks) return result;

  for (const event of Object.keys(result.hooks)) {
    result.hooks[event] = result.hooks[event].filter(e => !e[CCM_HOOK_MARKER]);
    if (result.hooks[event].length === 0) delete result.hooks[event];
  }
  if (Object.keys(result.hooks).length === 0) delete result.hooks;
  return result;
}

module.exports = { registerHooks, deregisterHooks, CCM_HOOK_MARKER };
```

- [ ] **Step 4: Run tests to verify they pass**

```bash
npx jest tests/hooks-config.test.js --no-coverage
```

Expected: PASS (5 tests)

- [ ] **Step 5: Commit**

```bash
git add src/hooks-config/index.js tests/hooks-config.test.js
git commit -m "feat: hooks-config — register/deregister ccm hooks in ~/.claude/settings.json"
```

---

## Task 4: Session state machine

**Files:**
- Create: `src/backend/sessions.js`
- Create: `tests/sessions.test.js`

- [ ] **Step 1: Write failing tests**

`tests/sessions.test.js`:
```js
const { SessionStore } = require('../src/backend/sessions.js');

describe('SessionStore', () => {
  let store;

  beforeEach(() => {
    store = new SessionStore({ staleTimeoutMs: 100 }); // short timeout for tests
  });

  afterEach(() => store.destroy());

  test('applyEvent pre-tool sets state to working', () => {
    store.applyEvent({ sessionId: 'abc', state: 'working', lastToolName: 'Edit', cwd: '/tmp', updatedAt: new Date().toISOString() });
    expect(store.get('abc').state).toBe('working');
    expect(store.get('abc').lastToolName).toBe('Edit');
  });

  test('applyEvent stop sets state to waiting', () => {
    store.applyEvent({ sessionId: 'abc', state: 'waiting', cwd: '/tmp', updatedAt: new Date().toISOString() });
    expect(store.get('abc').state).toBe('waiting');
  });

  test('bootstrap creates session in bootstrapping state', () => {
    store.bootstrap({ sessionId: 'xyz', label: 'My Project', cwd: '/tmp/proj' });
    expect(store.get('xyz').state).toBe('bootstrapping');
    expect(store.get('xyz').label).toBe('My Project');
  });

  test('getAll returns all sessions as array', () => {
    store.bootstrap({ sessionId: 'a', label: 'A', cwd: '/a' });
    store.applyEvent({ sessionId: 'b', state: 'working', cwd: '/b', updatedAt: new Date().toISOString() });
    expect(store.getAll()).toHaveLength(2);
  });

  test('session becomes unknown after stale timeout', (done) => {
    store.applyEvent({ sessionId: 'abc', state: 'working', cwd: '/tmp', updatedAt: new Date().toISOString() });
    setTimeout(() => {
      expect(store.get('abc').state).toBe('unknown');
      done();
    }, 150);
  });

  test('stale timer resets when new working event arrives', (done) => {
    store.applyEvent({ sessionId: 'abc', state: 'working', cwd: '/tmp', updatedAt: new Date().toISOString() });
    setTimeout(() => {
      store.applyEvent({ sessionId: 'abc', state: 'working', cwd: '/tmp', updatedAt: new Date().toISOString() });
      setTimeout(() => {
        expect(store.get('abc').state).toBe('unknown');
        done();
      }, 150);
    }, 50);
  });

  test('emits change event when session updates', (done) => {
    store.on('change', (session) => {
      expect(session.sessionId).toBe('abc');
      done();
    });
    store.applyEvent({ sessionId: 'abc', state: 'waiting', cwd: '/tmp', updatedAt: new Date().toISOString() });
  });
});
```

- [ ] **Step 2: Run to verify failure**

```bash
npx jest tests/sessions.test.js --no-coverage
```

Expected: FAIL

- [ ] **Step 3: Implement src/backend/sessions.js**

```js
const EventEmitter = require('events');

const STALE_TIMEOUT_MS = 60_000;
const REMOVE_TIMEOUT_MS = 10 * 60_000;

class SessionStore extends EventEmitter {
  constructor({ staleTimeoutMs = STALE_TIMEOUT_MS } = {}) {
    super();
    this._sessions = new Map();
    this._staleTimers = new Map();
    this._staleTimeoutMs = staleTimeoutMs;
  }

  bootstrap({ sessionId, label, cwd }) {
    const session = { sessionId, label, cwd, state: 'bootstrapping', createdAt: new Date().toISOString() };
    this._sessions.set(sessionId, session);
    this.emit('change', session);
    return session;
  }

  applyEvent(event) {
    const { sessionId, state } = event;
    const existing = this._sessions.get(sessionId) || {};
    const session = { ...existing, ...event };
    this._sessions.set(sessionId, session);

    if (state === 'working') {
      this._resetStaleTimer(sessionId);
    } else {
      this._clearStaleTimer(sessionId);
    }

    this.emit('change', session);
    return session;
  }

  _resetStaleTimer(sessionId) {
    this._clearStaleTimer(sessionId);
    const t = setTimeout(() => {
      const s = this._sessions.get(sessionId);
      if (s && s.state === 'working') {
        const updated = { ...s, state: 'unknown' };
        this._sessions.set(sessionId, updated);
        this.emit('change', updated);
        // Remove from display after REMOVE_TIMEOUT_MS
        setTimeout(() => this._sessions.delete(sessionId), REMOVE_TIMEOUT_MS);
      }
    }, this._staleTimeoutMs);
    this._staleTimers.set(sessionId, t);
  }

  _clearStaleTimer(sessionId) {
    const t = this._staleTimers.get(sessionId);
    if (t) { clearTimeout(t); this._staleTimers.delete(sessionId); }
  }

  get(sessionId) { return this._sessions.get(sessionId); }

  getAll() { return Array.from(this._sessions.values()); }

  destroy() {
    for (const t of this._staleTimers.values()) clearTimeout(t);
    this._staleTimers.clear();
  }
}

module.exports = { SessionStore };
```

- [ ] **Step 4: Run tests to verify they pass**

```bash
npx jest tests/sessions.test.js --no-coverage
```

Expected: PASS (7 tests)

- [ ] **Step 5: Commit**

```bash
git add src/backend/sessions.js tests/sessions.test.js
git commit -m "feat: session state machine — bootstrapping/working/waiting/unknown with stale timeout"
```

---

## Task 5: Stats tracking

**Files:**
- Create: `src/backend/stats.js`
- Create: `tests/stats.test.js`

- [ ] **Step 1: Write failing tests**

`tests/stats.test.js`:
```js
const { Stats } = require('../src/backend/stats.js');
const os = require('os');
const path = require('path');
const fs = require('fs');

describe('Stats', () => {
  let tmpDir, stats;

  beforeEach(() => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'ccm-stats-'));
    stats = new Stats({ statsDir: tmpDir });
  });

  test('increments toolsRun', () => {
    stats.recordToolUse();
    stats.recordToolUse();
    expect(stats.today().toolsRun).toBe(2);
  });

  test('increments inputsSent', () => {
    stats.recordInputSent();
    expect(stats.today().inputsSent).toBe(1);
  });

  test('tracks unique active sessions', () => {
    stats.recordSessionActive('a');
    stats.recordSessionActive('b');
    stats.recordSessionActive('a'); // duplicate
    expect(stats.today().sessionsActive).toBe(2);
  });

  test('persists to file on flush', () => {
    stats.recordToolUse();
    stats.flush();
    const files = fs.readdirSync(tmpDir).filter(f => f.startsWith('stats-'));
    expect(files.length).toBe(1);
    const data = JSON.parse(fs.readFileSync(path.join(tmpDir, files[0]), 'utf8'));
    expect(data.toolsRun).toBe(1);
  });

  test('loads from existing file on init', () => {
    const today = new Date().toISOString().split('T')[0];
    fs.writeFileSync(path.join(tmpDir, `stats-${today}.json`), JSON.stringify({ toolsRun: 5, inputsSent: 2, sessionsActive: 1 }));
    const s2 = new Stats({ statsDir: tmpDir });
    expect(s2.today().toolsRun).toBe(5);
  });
});
```

- [ ] **Step 2: Run to verify failure**

```bash
npx jest tests/stats.test.js --no-coverage
```

Expected: FAIL

- [ ] **Step 3: Implement src/backend/stats.js**

```js
const fs = require('fs');
const path = require('path');

class Stats {
  constructor({ statsDir } = {}) {
    this._statsDir = statsDir || path.join(process.env.HOME, '.ccm');
    this._date = this._today();
    this._data = { toolsRun: 0, inputsSent: 0, _sessionsActive: new Set() };
    this._load();
  }

  _today() { return new Date().toISOString().split('T')[0]; }

  _filePath(date) { return path.join(this._statsDir, `stats-${date}.json`); }

  _load() {
    try {
      const raw = JSON.parse(fs.readFileSync(this._filePath(this._date), 'utf8'));
      this._data.toolsRun = raw.toolsRun || 0;
      this._data.inputsSent = raw.inputsSent || 0;
      // sessionsActive count is not restored (it's a live set)
    } catch (_) {}
  }

  _checkRollover() {
    const today = this._today();
    if (today !== this._date) {
      this.flush();
      this._date = today;
      this._data = { toolsRun: 0, inputsSent: 0, _sessionsActive: new Set() };
    }
  }

  recordToolUse() { this._checkRollover(); this._data.toolsRun++; }
  recordInputSent() { this._checkRollover(); this._data.inputsSent++; }
  recordSessionActive(id) { this._checkRollover(); this._data._sessionsActive.add(id); }

  today() {
    return {
      toolsRun: this._data.toolsRun,
      inputsSent: this._data.inputsSent,
      sessionsActive: this._data._sessionsActive.size,
    };
  }

  flush() {
    fs.mkdirSync(this._statsDir, { recursive: true });
    const { _sessionsActive, ...serializable } = this._data;
    fs.writeFileSync(this._filePath(this._date), JSON.stringify({
      ...serializable,
      sessionsActive: _sessionsActive.size,
    }, null, 2));
  }
}

module.exports = { Stats };
```

- [ ] **Step 4: Run tests to verify they pass**

```bash
npx jest tests/stats.test.js --no-coverage
```

Expected: PASS (5 tests)

- [ ] **Step 5: Commit**

```bash
git add src/backend/stats.js tests/stats.test.js
git commit -m "feat: daily stats — toolsRun, inputsSent, sessionsActive with midnight rollover"
```

---

## Task 6: Auth middleware

**Files:**
- Create: `src/backend/auth.js`
- Create: `tests/auth.test.js`

- [ ] **Step 1: Write failing tests**

`tests/auth.test.js`:
```js
const { createTokenMiddleware } = require('../src/backend/auth.js');

function mockReq(token) {
  const url = token ? `/?token=${token}` : '/';
  return { url, query: token ? { token } : {} };
}
const mockRes = () => {
  const res = {};
  res.status = jest.fn(() => res);
  res.send = jest.fn(() => res);
  return res;
};
const next = jest.fn();

describe('token middleware', () => {
  beforeEach(() => next.mockClear());

  test('passes when token matches', () => {
    const mw = createTokenMiddleware('secret123');
    const res = mockRes();
    mw(mockReq('secret123'), res, next);
    expect(next).toHaveBeenCalled();
    expect(res.status).not.toHaveBeenCalled();
  });

  test('blocks when token is wrong', () => {
    const mw = createTokenMiddleware('secret123');
    const res = mockRes();
    mw(mockReq('wrong'), res, next);
    expect(res.status).toHaveBeenCalledWith(401);
    expect(next).not.toHaveBeenCalled();
  });

  test('blocks when token is missing', () => {
    const mw = createTokenMiddleware('secret123');
    const res = mockRes();
    mw(mockReq(null), res, next);
    expect(res.status).toHaveBeenCalledWith(401);
  });

  test('no-op when token is null (Tailscale mode — no auth required)', () => {
    const mw = createTokenMiddleware(null);
    const res = mockRes();
    mw(mockReq(null), res, next);
    expect(next).toHaveBeenCalled();
  });
});
```

- [ ] **Step 2: Run to verify failure**

```bash
npx jest tests/auth.test.js --no-coverage
```

Expected: FAIL

- [ ] **Step 3: Implement src/backend/auth.js**

```js
const crypto = require('crypto');

function generateToken() {
  return crypto.randomBytes(24).toString('hex');
}

function createTokenMiddleware(requiredToken) {
  return (req, res, next) => {
    if (!requiredToken) return next(); // Tailscale mode: no auth needed
    const provided = req.query?.token || new URL(req.url, 'http://localhost').searchParams.get('token');
    if (provided === requiredToken) return next();
    res.status(401).send('Unauthorized: invalid or missing token');
  };
}

function verifyWsToken(requiredToken, url) {
  if (!requiredToken) return true;
  const params = new URL(url, 'http://localhost').searchParams;
  return params.get('token') === requiredToken;
}

module.exports = { createTokenMiddleware, verifyWsToken, generateToken };
```

- [ ] **Step 4: Run tests to verify they pass**

```bash
npx jest tests/auth.test.js --no-coverage
```

Expected: PASS (4 tests)

- [ ] **Step 5: Commit**

```bash
git add src/backend/auth.js tests/auth.test.js
git commit -m "feat: auth middleware — token check for HTTP + WebSocket in Cloudflare mode"
```

---

## Task 7: tmux wrapper

**Files:**
- Create: `src/backend/tmux.js`
- Create: `tests/tmux.test.js`

- [ ] **Step 1: Write failing tests**

`tests/tmux.test.js`:
```js
const { buildNewWindowCmd, buildSendKeysCmd, buildListWindowsCmd } = require('../src/backend/tmux.js');

describe('tmux command builders', () => {
  test('buildNewWindowCmd returns correct tmux command', () => {
    const cmd = buildNewWindowCmd({ sessionName: 'ccm', windowName: 'api-agent', cwd: '/tmp/proj' });
    expect(cmd).toContain('tmux new-window');
    expect(cmd).toContain('-n api-agent');
    expect(cmd).toContain('-c /tmp/proj');
  });

  test('buildSendKeysCmd returns correct tmux command', () => {
    const cmd = buildSendKeysCmd({ sessionName: 'ccm', windowName: 'api-agent', text: 'hello world' });
    expect(cmd).toContain('tmux send-keys');
    expect(cmd).toContain('ccm:api-agent');
    expect(cmd).toContain('"hello world"');
    expect(cmd).toContain('Enter');
  });

  test('buildListWindowsCmd returns list-windows command', () => {
    const cmd = buildListWindowsCmd('ccm');
    expect(cmd).toContain('tmux list-windows');
    expect(cmd).toContain('-t ccm');
  });
});
```

- [ ] **Step 2: Run to verify failure**

```bash
npx jest tests/tmux.test.js --no-coverage
```

Expected: FAIL

- [ ] **Step 3: Implement src/backend/tmux.js**

```js
const { execSync, exec } = require('child_process');

const CCM_SESSION = 'ccm';

function buildNewWindowCmd({ sessionName = CCM_SESSION, windowName, cwd }) {
  return `tmux new-window -t ${sessionName} -n "${windowName}" -c "${cwd}"`;
}

function buildSendKeysCmd({ sessionName = CCM_SESSION, windowName, text }) {
  const escaped = text.replace(/"/g, '\\"');
  return `tmux send-keys -t ${sessionName}:${windowName} "${escaped}" Enter`;
}

function buildListWindowsCmd(sessionName = CCM_SESSION) {
  return `tmux list-windows -t ${sessionName} -F "#{window_name}"`;
}

function ensureSession(sessionName = CCM_SESSION) {
  try {
    execSync(`tmux has-session -t ${sessionName} 2>/dev/null`);
  } catch (_) {
    execSync(`tmux new-session -d -s ${sessionName}`);
  }
}

function newWindow({ windowName, cwd }) {
  ensureSession();
  execSync(buildNewWindowCmd({ windowName, cwd }));
  // Start claude in the new window
  execSync(buildSendKeysCmd({ windowName, text: 'claude' }));
}

function sendInput({ windowName, text }) {
  execSync(buildSendKeysCmd({ windowName, text }));
}

function listWindows() {
  try {
    const out = execSync(buildListWindowsCmd()).toString().trim();
    return out ? out.split('\n') : [];
  } catch (_) { return []; }
}

function isTmuxAvailable() {
  try { execSync('which tmux'); return true; } catch (_) { return false; }
}

module.exports = { buildNewWindowCmd, buildSendKeysCmd, buildListWindowsCmd, newWindow, sendInput, listWindows, isTmuxAvailable };
```

- [ ] **Step 4: Run tests to verify they pass**

```bash
npx jest tests/tmux.test.js --no-coverage
```

Expected: PASS (3 tests)

- [ ] **Step 5: Commit**

```bash
git add src/backend/tmux.js tests/tmux.test.js
git commit -m "feat: tmux wrapper — new-window, send-keys, list-windows command builders"
```

---

## Task 8: Backend server (Express + WebSocket + chokidar watcher)

**Files:**
- Create: `src/backend/watcher.js`
- Create: `src/backend/server.js`

No unit tests for the server itself (integration tested via the full flow). The watcher is thin enough that it's covered by the integration test in Task 11.

- [ ] **Step 1: Create src/backend/watcher.js**

```js
const chokidar = require('chokidar');
const fs = require('fs');
const path = require('path');

function createWatcher(sessionsDir, sessionStore) {
  fs.mkdirSync(sessionsDir, { recursive: true });

  const watcher = chokidar.watch(`${sessionsDir}/*.json`, {
    ignoreInitial: false,
    awaitWriteFinish: { stabilityThreshold: 100, pollInterval: 50 },
  });

  watcher.on('add', filePath => _applyFile(filePath, sessionStore));
  watcher.on('change', filePath => _applyFile(filePath, sessionStore));

  return watcher;
}

function _applyFile(filePath, sessionStore) {
  try {
    const data = JSON.parse(fs.readFileSync(filePath, 'utf8'));
    if (data.sessionId) sessionStore.applyEvent(data);
  } catch (_) {}
}

module.exports = { createWatcher };
```

- [ ] **Step 2: Create src/backend/server.js**

```js
const express = require('express');
const http = require('http');
const WebSocket = require('ws');
const path = require('path');
const { SessionStore } = require('./sessions.js');
const { Stats } = require('./stats.js');
const { createWatcher } = require('./watcher.js');
const { createTokenMiddleware, verifyWsToken } = require('./auth.js');

const SESSIONS_DIR = path.join(process.env.HOME, '.ccm', 'sessions');

function createServer({ port = 3000, token = null } = {}) {
  const app = express();
  const sessionStore = new SessionStore();
  const stats = new Stats();

  // Auth middleware (no-op in Tailscale mode)
  app.use(createTokenMiddleware(token));

  // Serve PWA
  app.use(express.static(path.join(__dirname, '../../public')));
  app.use(express.json());

  // REST: list sessions
  app.get('/api/sessions', (req, res) => res.json(sessionStore.getAll()));
  app.get('/api/stats', (req, res) => res.json(stats.today()));

  // Send input to a managed session
  app.post('/api/sessions/:id/input', (req, res) => {
    const { text } = req.body;
    const session = sessionStore.get(req.params.id);
    if (!session || session.managed === false) {
      return res.status(403).json({ error: 'Session is view-only' });
    }
    const { sendInput } = require('./tmux.js');
    try {
      sendInput({ windowName: session.windowName, text });
      stats.recordInputSent();
      res.json({ ok: true });
    } catch (err) {
      res.status(500).json({ error: err.message });
    }
  });

  const server = http.createServer(app);
  const wss = new WebSocket.Server({ server });

  wss.on('connection', (ws, req) => {
    // Verify token on WebSocket upgrade
    if (!verifyWsToken(token, req.url)) {
      ws.close(1008, 'Unauthorized');
      return;
    }
    // Send current state immediately on connect
    ws.send(JSON.stringify({ type: 'snapshot', sessions: sessionStore.getAll(), stats: stats.today() }));

    // Forward session changes
    const onChange = (session) => {
      stats.recordSessionActive(session.sessionId);
      if (ws.readyState === WebSocket.OPEN) {
        ws.send(JSON.stringify({ type: 'session_update', session }));
      }
    };
    sessionStore.on('change', onChange);
    ws.on('close', () => sessionStore.off('change', onChange));
  });

  // Watch sessions dir
  createWatcher(SESSIONS_DIR, sessionStore);

  // Record tool use only on PreToolUse (state: working, lastToolName present and changed)
  // PostToolUse also sets state=working — avoid double-counting by checking for new tool name
  let _lastToolKey = {};
  sessionStore.on('change', s => {
    if (s.state === 'working' && s.lastToolName) {
      const key = `${s.sessionId}:${s.lastToolName}:${s.updatedAt}`;
      if (_lastToolKey[s.sessionId] !== key) {
        _lastToolKey[s.sessionId] = key;
        stats.recordToolUse();
        stats.recordSessionActive(s.sessionId);
      }
    }
  });

  // Flush stats on shutdown
  process.on('SIGTERM', () => { stats.flush(); server.close(); });
  process.on('SIGINT', () => { stats.flush(); server.close(); });

  return { server, sessionStore, stats };
}

module.exports = { createServer };
```

- [ ] **Step 3: Verify no syntax errors**

```bash
node -e "require('./src/backend/server.js'); console.log('OK')"
```

Expected: `OK`

- [ ] **Step 4: Commit**

```bash
git add src/backend/watcher.js src/backend/server.js
git commit -m "feat: backend server — Express + WebSocket + chokidar watcher"
```

---

## Task 9: PWA Dashboard

**Files:**
- Create: `public/index.html`
- Create: `public/app.js`
- Create: `public/styles.css`
- Create: `public/manifest.json`

- [ ] **Step 1: Create public/manifest.json**

```json
{
  "name": "CCM — Claude Code Manager",
  "short_name": "CCM",
  "start_url": "/",
  "display": "standalone",
  "background_color": "#0a0a0f",
  "theme_color": "#7c3aed",
  "icons": [
    { "src": "data:image/svg+xml,<svg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 100 100'><text y='.9em' font-size='90'>⚡</text></svg>", "sizes": "any", "type": "image/svg+xml" }
  ]
}
```

- [ ] **Step 2: Create public/index.html**

```html
<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <meta name="apple-mobile-web-app-capable" content="yes">
  <title>CCM</title>
  <link rel="manifest" href="/manifest.json">
  <link rel="stylesheet" href="/styles.css">
</head>
<body>
  <div id="status-bar">
    <span id="conn-indicator" class="conn-dot disconnected"></span>
    <span id="conn-label">Connecting…</span>
  </div>
  <header>
    <h1>ccm</h1>
    <div id="header-meta"></div>
  </header>
  <div id="stats-row"></div>
  <main id="session-list"></main>
  <script src="/app.js"></script>
</body>
</html>
```

- [ ] **Step 3: Create public/styles.css**

```css
*, *::before, *::after { box-sizing: border-box; margin: 0; padding: 0; }

:root {
  --bg: #0a0a0f;
  --surface: #13131f;
  --border: #1e1e3f;
  --text: #e2e8f0;
  --muted: #475569;
  --purple: #7c3aed;
  --blue: #2563eb;
  --green: #22c55e;
  --amber: #f59e0b;
  --red: #ef4444;
}

body { background: var(--bg); color: var(--text); font-family: -apple-system, BlinkMacSystemFont, 'SF Pro Display', sans-serif; max-width: 480px; margin: 0 auto; padding-bottom: 32px; }

#status-bar { display: flex; align-items: center; gap: 8px; padding: 12px 20px 4px; font-size: 12px; color: var(--muted); }
.conn-dot { width: 8px; height: 8px; border-radius: 50%; background: var(--muted); }
.conn-dot.connected { background: var(--green); }
.conn-dot.disconnected { background: var(--red); }

header { padding: 4px 20px 16px; display: flex; justify-content: space-between; align-items: center; }
header h1 { font-size: 24px; font-weight: 700; background: linear-gradient(135deg, #a78bfa, #60a5fa); -webkit-background-clip: text; -webkit-text-fill-color: transparent; }
#header-meta { font-size: 12px; color: var(--muted); }

#stats-row { display: flex; gap: 10px; padding: 0 16px 16px; }
.stat-chip { flex: 1; background: var(--surface); border: 1px solid var(--border); border-radius: 12px; padding: 10px; text-align: center; }
.stat-val { font-size: 20px; font-weight: 700; color: var(--purple); }
.stat-val.green { color: var(--green); }
.stat-val.blue { color: #60a5fa; }
.stat-lbl { font-size: 10px; color: var(--muted); margin-top: 2px; text-transform: uppercase; letter-spacing: 0.5px; }

#session-list { display: flex; flex-direction: column; gap: 12px; padding: 0 16px; }

.card { background: var(--surface); border-radius: 18px; border: 1px solid var(--border); padding: 16px; position: relative; overflow: hidden; }
.card::before { content: ''; position: absolute; top: 0; left: 0; right: 0; height: 3px; border-radius: 18px 18px 0 0; }
.card.waiting::before { background: linear-gradient(90deg, var(--green), #10b981); }
.card.working::before { background: linear-gradient(90deg, var(--amber), var(--red), var(--amber)); background-size: 200%; animation: shimmer 1.5s linear infinite; }
.card.bootstrapping::before { background: var(--purple); animation: shimmer 1.5s linear infinite; }
.card.unknown::before, .card.offline::before { background: var(--muted); }

@keyframes shimmer { 0% { background-position: 200%; } 100% { background-position: -200%; } }

.card-top { display: flex; justify-content: space-between; align-items: center; margin-bottom: 10px; }
.card-label { display: flex; align-items: center; gap: 10px; }
.emoji-badge { font-size: 20px; width: 36px; height: 36px; background: var(--border); border-radius: 10px; display: flex; align-items: center; justify-content: center; }
.session-name { font-size: 15px; font-weight: 600; }
.session-path { font-size: 11px; color: var(--muted); margin-top: 2px; }

.status-badge { display: flex; align-items: center; gap: 5px; font-size: 11px; font-weight: 600; padding: 4px 10px; border-radius: 999px; text-transform: uppercase; letter-spacing: 0.5px; }
.status-badge.waiting { background: rgba(34,197,94,.15); color: var(--green); }
.status-badge.working { background: rgba(245,158,11,.15); color: var(--amber); }
.status-badge.bootstrapping { background: rgba(124,58,237,.15); color: #a78bfa; }
.status-badge.unknown, .status-badge.offline { background: rgba(100,116,139,.15); color: var(--muted); }

.dot { width: 6px; height: 6px; border-radius: 50%; background: currentColor; }
@keyframes pulse { 0%,100%{opacity:1;transform:scale(1)} 50%{opacity:.4;transform:scale(.8)} }
.dot.pulse { animation: pulse 1s ease-in-out infinite; }

.card-activity { font-size: 12px; color: var(--muted); margin-bottom: 10px; padding: 7px 10px; background: var(--bg); border-radius: 8px; font-family: 'SF Mono', monospace; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
.activity-label { color: var(--muted); margin-right: 6px; }
.activity-text { color: #94a3b8; }

.tool-chips { display: flex; gap: 5px; flex-wrap: wrap; margin-bottom: 8px; }
.tool-chip { font-size: 10px; background: rgba(245,158,11,.1); color: var(--amber); border: 1px solid rgba(245,158,11,.2); padding: 3px 8px; border-radius: 999px; font-family: 'SF Mono', monospace; }

.input-row { display: flex; gap: 8px; }
.quick-input { flex: 1; background: #1a1a2e; border: 1px solid #2d2d4e; border-radius: 10px; padding: 9px 12px; color: var(--text); font-size: 14px; outline: none; }
.quick-input:focus { border-color: var(--purple); }
.send-btn { background: linear-gradient(135deg, var(--purple), var(--blue)); border: none; border-radius: 10px; width: 38px; height: 38px; display: flex; align-items: center; justify-content: center; color: white; font-size: 16px; cursor: pointer; flex-shrink: 0; }
.send-btn:disabled { opacity: .4; cursor: not-allowed; }

.viewonly-row { display: flex; align-items: center; justify-content: space-between; }
.viewonly-label { font-size: 11px; color: var(--muted); }
.adopt-btn { font-size: 11px; color: var(--purple); background: rgba(124,58,237,.1); border: 1px solid rgba(124,58,237,.2); border-radius: 8px; padding: 5px 10px; cursor: pointer; }

.new-session-btn { background: transparent; border: 1px dashed rgba(124,58,237,.4); border-radius: 18px; padding: 14px; text-align: center; font-size: 13px; color: var(--purple); cursor: pointer; width: 100%; }
```

- [ ] **Step 4: Create public/app.js**

```js
const EMOJIS = ['🚀','🌐','⚡','🔥','🧪','🛠️','🎯','🦾','🔬','💡'];

function getToken() {
  return new URLSearchParams(location.search).get('token') || '';
}

function wsUrl() {
  const proto = location.protocol === 'https:' ? 'wss' : 'ws';
  const token = getToken();
  return `${proto}://${location.host}${token ? '?token=' + token : ''}`;
}

let sessions = {};
let statsData = {};

function connect() {
  const ws = new WebSocket(wsUrl());

  ws.onopen = () => {
    document.getElementById('conn-indicator').className = 'conn-dot connected';
    document.getElementById('conn-label').textContent = 'Connected';
  };

  ws.onmessage = (e) => {
    const msg = JSON.parse(e.data);
    if (msg.type === 'snapshot') {
      sessions = {};
      msg.sessions.forEach(s => sessions[s.sessionId] = s);
      statsData = msg.stats;
    } else if (msg.type === 'session_update') {
      sessions[msg.session.sessionId] = msg.session;
      statsData = msg.stats || statsData;
    }
    render();
  };

  ws.onclose = () => {
    document.getElementById('conn-indicator').className = 'conn-dot disconnected';
    document.getElementById('conn-label').textContent = 'Reconnecting…';
    setTimeout(connect, 3000);
  };
}

function render() {
  renderStats();
  renderSessions();
}

function renderStats() {
  const all = Object.values(sessions);
  const working = all.filter(s => s.state === 'working').length;
  const waiting = all.filter(s => s.state === 'waiting').length;
  document.getElementById('header-meta').textContent = `${all.length} session${all.length !== 1 ? 's' : ''}`;
  document.getElementById('stats-row').innerHTML = `
    <div class="stat-chip"><div class="stat-val">${working}</div><div class="stat-lbl">Working</div></div>
    <div class="stat-chip"><div class="stat-val green">${waiting}</div><div class="stat-lbl">Waiting</div></div>
    <div class="stat-chip"><div class="stat-val blue">${statsData.toolsRun || 0}</div><div class="stat-lbl">Tools run</div></div>
  `;
}

function renderSessions() {
  const sorted = Object.values(sessions).sort((a, b) => {
    const order = { waiting: 0, working: 1, bootstrapping: 2, unknown: 3, offline: 4 };
    return (order[a.state] ?? 5) - (order[b.state] ?? 5);
  });

  const list = document.getElementById('session-list');
  list.innerHTML = sorted.map(s => renderCard(s)).join('') + renderNewBtn();

  sorted.forEach(s => {
    if (s.state === 'waiting' && s.managed !== false) {
      const input = document.getElementById(`input-${s.sessionId}`);
      const btn = document.getElementById(`send-${s.sessionId}`);
      if (input && btn) {
        btn.onclick = () => sendInput(s.sessionId, input.value);
        input.onkeydown = (e) => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); sendInput(s.sessionId, input.value); } };
      }
    }
  });
}

function renderCard(s) {
  const emoji = EMOJIS[Math.abs(hashCode(s.sessionId)) % EMOJIS.length];
  const label = s.label || s.cwd?.split('/').pop() || s.sessionId.slice(0, 8);
  const isManaged = s.managed !== false;

  const badgeDot = ['working', 'bootstrapping'].includes(s.state) ? '<div class="dot pulse"></div>' : '<div class="dot"></div>';
  const activityText = s.lastToolName ? `doing: ${s.lastToolName}` : s.state === 'waiting' ? `last: ${s.lastActivity || 'ready'}` : s.state;

  let footer = '';
  if (s.state === 'waiting' && isManaged) {
    footer = `<div class="input-row"><input id="input-${s.sessionId}" class="quick-input" placeholder="Reply to Claude…"><button id="send-${s.sessionId}" class="send-btn">↑</button></div>`;
  } else if (!isManaged) {
    footer = `<div class="viewonly-row"><span class="viewonly-label">Existing session · view only</span><button class="adopt-btn" onclick="adoptSession('${s.sessionId}')">Adopt →</button></div>`;
  }

  const toolChips = s.toolHistory?.slice(-3).map(t => `<span class="tool-chip">${t}</span>`).join('') || '';

  return `
    <div class="card ${s.state}">
      <div class="card-top">
        <div class="card-label">
          <div class="emoji-badge">${emoji}</div>
          <div><div class="session-name">${label}</div><div class="session-path">${s.cwd || ''}</div></div>
        </div>
        <div class="status-badge ${s.state}">${badgeDot} ${s.state}</div>
      </div>
      ${toolChips ? `<div class="tool-chips">${toolChips}</div>` : ''}
      <div class="card-activity"><span class="activity-label"></span><span class="activity-text">${activityText}</span></div>
      ${footer}
    </div>`;
}

function renderNewBtn() {
  return `<button class="new-session-btn" onclick="alert('Use: ccm new \\'label\\' /path/to/project')">＋ New session</button>`;
}

async function sendInput(sessionId, text) {
  if (!text.trim()) return;
  const token = getToken();
  const url = `/api/sessions/${sessionId}/input${token ? '?token=' + token : ''}`;
  await fetch(url, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ text }) });
  const input = document.getElementById(`input-${sessionId}`);
  if (input) input.value = '';
}

function adoptSession(sessionId) {
  alert(`To adopt this session, run:\nccm adopt ${sessionId}`);
}

function hashCode(str) {
  let h = 0;
  for (let i = 0; i < str.length; i++) h = Math.imul(31, h) + str.charCodeAt(i) | 0;
  return h;
}

connect();
```

- [ ] **Step 5: Verify no syntax errors in public files**

```bash
node -e "const fs=require('fs'); fs.readFileSync('public/index.html'); fs.readFileSync('public/app.js'); fs.readFileSync('public/styles.css'); console.log('OK')"
```

Expected: `OK`

- [ ] **Step 6: Commit**

```bash
git add public/
git commit -m "feat: PWA dashboard — session cards, real-time WebSocket, gamified UI"
```

---

## Task 10: Tunnel integration

**Files:**
- Create: `src/tunnel/tailscale.js`
- Create: `src/tunnel/cloudflare.js`

- [ ] **Step 1: Create src/tunnel/tailscale.js**

```js
const { execSync } = require('child_process');

function getTailscaleUrl(port) {
  try {
    const ip = execSync('tailscale ip -4 2>/dev/null').toString().trim();
    if (!ip) throw new Error('no IP');
    return `http://${ip}:${port}`;
  } catch (_) {
    return null;
  }
}

function isTailscaleAvailable() {
  try { execSync('which tailscale 2>/dev/null'); return true; } catch (_) { return false; }
}

module.exports = { getTailscaleUrl, isTailscaleAvailable };
```

- [ ] **Step 2: Create src/tunnel/cloudflare.js**

```js
const { spawn } = require('child_process');

function startCloudflareTunnel(port, onUrl) {
  const proc = spawn('cloudflared', ['tunnel', '--url', `http://localhost:${port}`], {
    stdio: ['ignore', 'pipe', 'pipe'],
  });

  const capture = (data) => {
    const match = data.toString().match(/https:\/\/[a-z0-9-]+\.trycloudflare\.com/);
    if (match) onUrl(match[0]);
  };

  proc.stdout.on('data', capture);
  proc.stderr.on('data', capture);

  proc.on('error', (err) => {
    if (err.code === 'ENOENT') {
      console.error('cloudflared not found. Install with: brew install cloudflared');
    }
  });

  return proc;
}

function isCloudflareavailable() {
  const { execSync } = require('child_process');
  try { execSync('which cloudflared 2>/dev/null'); return true; } catch (_) { return false; }
}

module.exports = { startCloudflareTunnel, isCloudflareavailable };
```

- [ ] **Step 3: Commit**

```bash
git add src/tunnel/
git commit -m "feat: tunnel integration — Tailscale URL helper + cloudflared tunnel spawner"
```

---

## Task 11: CLI commands wired up

**Files:**
- Modify: `src/cli/cmd-start.js`
- Modify: `src/cli/cmd-stop.js`
- Modify: `src/cli/cmd-new.js`
- Modify: `src/cli/cmd-list.js`
- Modify: `src/cli/cmd-tunnel.js`

Also needs a config helper: Create `src/config.js`

- [ ] **Step 1: Create src/config.js**

```js
const fs = require('fs');
const path = require('path');
const { generateToken } = require('./backend/auth.js');

const CONFIG_PATH = path.join(process.env.HOME, '.ccm', 'config.json');
const SETTINGS_PATH = path.join(process.env.HOME, '.claude', 'settings.json');
const PID_FILE = path.join(process.env.HOME, '.ccm', 'server.pid');

function readConfig() {
  try { return JSON.parse(fs.readFileSync(CONFIG_PATH, 'utf8')); } catch (_) { return {}; }
}

function writeConfig(data) {
  fs.mkdirSync(path.dirname(CONFIG_PATH), { recursive: true });
  fs.writeFileSync(CONFIG_PATH, JSON.stringify({ ...readConfig(), ...data }, null, 2));
}

function readClaudeSettings() {
  try { return JSON.parse(fs.readFileSync(SETTINGS_PATH, 'utf8')); } catch (_) { return {}; }
}

function writeClaudeSettings(data) {
  fs.mkdirSync(path.dirname(SETTINGS_PATH), { recursive: true });
  fs.writeFileSync(SETTINGS_PATH, JSON.stringify(data, null, 2));
}

function ensureToken(tunnelMode) {
  if (tunnelMode !== 'cloudflare') return null;
  const cfg = readConfig();
  if (cfg.token) return cfg.token;
  const token = generateToken();
  writeConfig({ token });
  return token;
}

module.exports = { readConfig, writeConfig, readClaudeSettings, writeClaudeSettings, ensureToken, CONFIG_PATH, SETTINGS_PATH, PID_FILE };
```

- [ ] **Step 2: Implement src/cli/cmd-start.js**

```js
const path = require('path');
const fs = require('fs');
const { createServer } = require('../backend/server.js');
const { registerHooks } = require('../hooks-config/index.js');
const { readConfig, readClaudeSettings, writeClaudeSettings, ensureToken, PID_FILE } = require('../config.js');
const { isTmuxAvailable } = require('../backend/tmux.js');

module.exports = (program) => {
  program.command('start')
    .description('Start ccm server and register hooks')
    .option('-p, --port <port>', 'Port to listen on', '3000')
    .action((opts) => {
      if (!isTmuxAvailable()) {
        console.error('tmux not found. Install with: brew install tmux');
        process.exit(1);
      }

      const cfg = readConfig();
      const port = parseInt(opts.port) || cfg.port || 3000;
      const tunnelMode = cfg.tunnel || 'tailscale';
      const token = ensureToken(tunnelMode);

      // Register hooks
      const hookBin = path.join(__dirname, '../../bin/ccm-hook');
      const settings = readClaudeSettings();
      writeClaudeSettings(registerHooks(settings, hookBin));
      console.log('✓ Claude Code hooks registered');

      const { server } = createServer({ port, token });
      server.listen(port, '0.0.0.0', () => {
        fs.mkdirSync(path.dirname(PID_FILE), { recursive: true });
        fs.writeFileSync(PID_FILE, String(process.pid));
        console.log(`✓ ccm server running on port ${port}`);
        if (token) {
          console.log(`\n  Cloudflare mode — token generated.`);
          console.log(`  Access URL: http://localhost:${port}?token=${token}`);
          console.log(`  (Run 'ccm tunnel cloudflare' to get a public URL)\n`);
        } else {
          console.log(`  Tailscale mode — run 'ccm tunnel tailscale' for remote URL`);
        }
      });
    });
};
```

- [ ] **Step 3: Implement src/cli/cmd-stop.js**

```js
const fs = require('fs');
const { deregisterHooks } = require('../hooks-config/index.js');
const { readClaudeSettings, writeClaudeSettings, PID_FILE } = require('../config.js');

module.exports = (program) => {
  program.command('stop')
    .description('Stop ccm server and deregister hooks')
    .action(() => {
      // Stop server process
      try {
        const pid = parseInt(fs.readFileSync(PID_FILE, 'utf8'));
        process.kill(pid, 'SIGTERM');
        fs.unlinkSync(PID_FILE);
        console.log('✓ ccm server stopped');
      } catch (_) {
        console.log('No running server found');
      }
      // Deregister hooks
      const settings = readClaudeSettings();
      writeClaudeSettings(deregisterHooks(settings));
      console.log('✓ Claude Code hooks deregistered');
    });
};
```

- [ ] **Step 4: Implement src/cli/cmd-new.js**

```js
const path = require('path');
const fs = require('fs');
const crypto = require('crypto');
const { newWindow } = require('../backend/tmux.js');

module.exports = (program) => {
  program.command('new')
    .description('Start a new managed Claude session')
    .argument('<label>', 'Session label')
    .argument('[path]', 'Working directory', process.cwd())
    .action((label, cwdArg) => {
      const cwd = path.resolve(cwdArg);
      const windowName = label.replace(/[^a-zA-Z0-9_-]/g, '-').toLowerCase();
      const sessionId = crypto.randomBytes(6).toString('hex');
      const sessionsDir = path.join(process.env.HOME, '.ccm', 'sessions');

      try {
        // Write bootstrap file immediately so dashboard shows "Starting…" card
        fs.mkdirSync(sessionsDir, { recursive: true });
        fs.writeFileSync(path.join(sessionsDir, `${sessionId}.json`), JSON.stringify({
          sessionId,
          label,
          cwd,
          state: 'bootstrapping',
          managed: true,
          windowName,
          createdAt: new Date().toISOString(),
          updatedAt: new Date().toISOString(),
        }, null, 2));

        newWindow({ windowName, cwd });
        console.log(`✓ Session "${label}" started in tmux window "${windowName}"`);
        console.log(`  Working dir: ${cwd}`);
        console.log(`  Session ID: ${sessionId}`);
      } catch (err) {
        console.error(`Error: ${err.message}`);
        process.exit(1);
      }
    });
};
```

- [ ] **Step 5: Implement src/cli/cmd-list.js**

```js
const fs = require('fs');
const path = require('path');

module.exports = (program) => {
  program.command('list')
    .description('List all known sessions')
    .action(() => {
      const sessionsDir = path.join(process.env.HOME, '.ccm', 'sessions');
      try {
        const files = fs.readdirSync(sessionsDir).filter(f => f.endsWith('.json'));
        if (!files.length) { console.log('No sessions found.'); return; }

        const rows = files.map(f => {
          try { return JSON.parse(fs.readFileSync(path.join(sessionsDir, f), 'utf8')); } catch (_) { return null; }
        }).filter(Boolean);

        console.log('\nID               LABEL            STATE         CWD');
        console.log('─'.repeat(80));
        for (const s of rows) {
          const id = (s.sessionId || '').slice(0, 16).padEnd(16);
          const label = (s.label || s.cwd?.split('/').pop() || '?').slice(0, 16).padEnd(16);
          const state = (s.state || '?').padEnd(13);
          const cwd = s.cwd || '';
          const managed = s.managed === false ? '  [view-only]' : '';
          console.log(`${id} ${label} ${state} ${cwd}${managed}`);
        }
        console.log('');
      } catch (_) {
        console.log('No sessions directory found. Run ccm start first.');
      }
    });
};
```

- [ ] **Step 6: Implement src/cli/cmd-tunnel.js**

```js
const { readConfig, writeConfig } = require('../config.js');
const { getTailscaleUrl, isTailscaleAvailable } = require('../tunnel/tailscale.js');
const { startCloudflareTunnel, isCloudflareavailable } = require('../tunnel/cloudflare.js');

module.exports = (program) => {
  program.command('tunnel')
    .description('Configure and start remote access tunnel')
    .argument('<mode>', 'tailscale or cloudflare')
    .action((mode) => {
      const cfg = readConfig();
      const port = cfg.port || 3000;

      if (mode === 'tailscale') {
        if (!isTailscaleAvailable()) {
          console.error('Tailscale not found. Install from https://tailscale.com/download');
          process.exit(1);
        }
        const url = getTailscaleUrl(port);
        if (!url) { console.error('Could not get Tailscale IP. Is Tailscale running?'); process.exit(1); }
        writeConfig({ tunnel: 'tailscale' });
        console.log(`\n  Tailscale URL: ${url}\n`);
        console.log('  Open this on your phone (both devices must be on Tailscale)\n');

      } else if (mode === 'cloudflare') {
        if (!isCloudflareavailable()) {
          console.error('cloudflared not found. Install with: brew install cloudflared');
          process.exit(1);
        }
        writeConfig({ tunnel: 'cloudflare' });
        const token = cfg.token;
        console.log('Starting Cloudflare Tunnel… (Ctrl+C to stop)\n');
        startCloudflareTunnel(port, (url) => {
          const fullUrl = token ? `${url}?token=${token}` : url;
          console.log(`  Public URL: ${fullUrl}\n`);
          console.log('  Open this link on your phone.\n');
        });
      } else {
        console.error('Unknown mode. Use: ccm tunnel tailscale  or  ccm tunnel cloudflare');
        process.exit(1);
      }
    });
};
```

- [ ] **Step 7: Verify CLI works end-to-end**

```bash
node bin/ccm --help
node bin/ccm new --help
node bin/ccm list
```

Expected: Help text displayed, `list` prints "No sessions directory found"

- [ ] **Step 8: Commit**

```bash
git add src/cli/ src/config.js
git commit -m "feat: CLI commands — start, stop, new, list, tunnel fully wired"
```

---

## Task 12: README and open source polish

**Files:**
- Create: `README.md`

- [ ] **Step 1: Create README.md**

```markdown
# CCM — Claude Code Manager

Monitor and control all your Claude Code sessions from a gamified mobile dashboard. See which sessions are working, which are waiting for input, and reply directly from your phone.

## Features

- Real-time status for all Claude Code sessions (working / waiting / view-only)
- Send input to sessions from your phone
- Access from anywhere via Tailscale (private) or Cloudflare Tunnel (public URL)
- Gamified dashboard with animated session cards
- Open source, runs entirely on your Mac

## Requirements

- Node.js 18+
- tmux (`brew install tmux`)
- For Tailscale mode: [Tailscale](https://tailscale.com/download) on Mac + iPhone
- For Cloudflare Tunnel mode: `brew install cloudflared`

## Setup

```bash
git clone https://github.com/Fbuettnerxxx/claudecode_terminal_manager
cd claudecode_terminal_manager
npm install
npm link   # makes ccm + ccm-hook available globally
```

## Usage

```bash
ccm start                          # Start server, register hooks
ccm new "API Agent" ~/my-project   # Start a managed session
ccm tunnel tailscale               # Get remote URL (Tailscale)
ccm tunnel cloudflare              # Get public URL (Cloudflare Tunnel)
ccm list                           # List all sessions
ccm stop                           # Stop server, deregister hooks
```

## Remote Access

### Tailscale (recommended — private, encrypted)
1. Install Tailscale on your Mac: `brew install tailscale && tailscale up`
2. Install Tailscale on your iPhone (free)
3. Run `ccm tunnel tailscale` — open the printed URL on your phone

### Cloudflare Tunnel (quick public URL)
1. `brew install cloudflared`
2. Run `ccm start` then `ccm tunnel cloudflare`
3. Open the printed URL on your phone (includes a secret token for security)

## How it works

`ccm` registers global hooks in `~/.claude/settings.json` that fire for every Claude Code session — including ones you started before running `ccm`. These hooks write events to `~/.ccm/sessions/`, which the backend watches in real time and broadcasts to connected dashboards via WebSocket.

Sessions started via `ccm new` run inside tmux and support bidirectional input. Sessions started outside `ccm` are shown as view-only and can be "adopted" to gain full control.

## License

MIT
```

- [ ] **Step 2: Run full test suite**

```bash
npx jest --no-coverage
```

Expected: All tests pass.

- [ ] **Step 3: Final commit and push**

```bash
git add README.md
git commit -m "docs: README with setup, usage, remote access instructions"
git push origin main
```

---

## Task 13: Prune old state files on startup (spec requirement)

**Files:**
- Modify: `src/backend/server.js`

- [ ] **Step 1: Add pruning logic to server startup**

In `src/backend/server.js`, add this function and call it at the top of `createServer`:

```js
function pruneOldSessionFiles(sessionsDir) {
  const THIRTY_DAYS_MS = 30 * 24 * 60 * 60 * 1000;
  try {
    const files = fs.readdirSync(sessionsDir).filter(f => f.endsWith('.json'));
    const cutoff = Date.now() - THIRTY_DAYS_MS;
    for (const f of files) {
      const filePath = path.join(sessionsDir, f);
      const { mtimeMs } = fs.statSync(filePath);
      if (mtimeMs < cutoff) fs.unlinkSync(filePath);
    }
  } catch (_) {}
}
```

Add `const fs = require('fs');` at the top of `server.js` if not already present, and call `pruneOldSessionFiles(SESSIONS_DIR);` at the start of `createServer`.

- [ ] **Step 2: Verify no syntax errors**

```bash
node -e "require('./src/backend/server.js'); console.log('OK')"
```

Expected: `OK`

- [ ] **Step 3: Run full test suite to confirm nothing broke**

```bash
npx jest --no-coverage
```

Expected: All tests pass.

- [ ] **Step 4: Final push**

```bash
git add src/backend/server.js
git commit -m "feat: prune session files older than 30 days on server startup"
git push origin main
```
