# ccm — Claude Code Manager

Manage all your Claude Code sessions from your phone.

## What it does

CCM is a small Node.js server + PWA dashboard that gives you a real-time view of every Claude Code session running on your machine — and lets you interact with them from your phone.

- Sessions are monitored via Claude Code hooks (`PreToolUse`, `PostToolUse`, `Stop`)
- The dashboard updates live over WebSocket
- Sessions started with `ccm new` are "managed": you can send input directly from the dashboard
- Pre-existing terminal sessions appear as view-only (state visible, no input)
- Access remotely via Tailscale (private) or Cloudflare Tunnel (public HTTPS URL)
- Daily stats: tools run, inputs sent, active sessions

## Screenshots / Demo

Screenshots coming soon.

## Features

- See all Claude Code sessions in real-time (`working` / `waiting` / `unknown`)
- Label sessions for easy identification
- Send input directly from your phone to managed sessions
- Gamified dashboard with daily session stats
- Access from anywhere via Tailscale (private) or Cloudflare Tunnel (public URL)
- Token-based auth when using Cloudflare Tunnel; no auth required on Tailscale

## Requirements

- Node.js 18+
- tmux — `brew install tmux`
- For Cloudflare Tunnel: `brew install cloudflared`
- For Tailscale: install from [tailscale.com](https://tailscale.com/download)

## Installation

```bash
git clone https://github.com/Fbuettnerxxx/claudecode_terminal_manager.git
cd claudecode_terminal_manager
npm install
npm link   # makes ccm and ccm-hook available globally
```

## Usage

### Start the server

```bash
ccm start              # port 3000, Tailscale mode
ccm start --port 3001  # custom port
```

On start, CCM registers its hooks into `~/.claude/settings.json` and writes a PID file to `~/.ccm/server.pid`.

### Open the dashboard

Navigate to `http://localhost:3000` (or your Tailscale URL) in any browser.

### Start a new managed Claude Code session

```bash
ccm new "my feature"              # new tmux window in current directory
ccm new "my feature" /path/to/dir # specify working directory
```

This opens a new tmux window and creates a session state file in `~/.ccm/sessions/`. You can send input to this session from the dashboard.

### List sessions

```bash
ccm list
```

Reads `~/.ccm/sessions/` and prints a table of all known sessions with their current state.

### Stop the server

```bash
ccm stop
```

Sends SIGTERM to the server process and deregisters CCM's hooks from `~/.claude/settings.json`.

### Remote access

#### Tailscale (recommended for personal use)

1. Install Tailscale on both your development machine and phone
2. Start the server: `ccm start`
3. Get the Tailscale URL: `ccm tunnel tailscale`
4. Open the printed URL on your phone

Both devices must be on the same Tailscale network. No auth token is required.

#### Cloudflare Tunnel (for external or shared access)

1. Install cloudflared: `brew install cloudflared`
2. Start the server: `ccm start`
3. Start the tunnel: `ccm tunnel cloudflare`
4. Open the printed public URL (includes `?token=<token>`) on your phone

The token is generated once and persisted in `~/.ccm/config.json`. All requests (HTTP and WebSocket) are verified against it.

## How it works

### Hook registration

`ccm start` injects three entries into `~/.claude/settings.json` under `hooks.PreToolUse`, `hooks.PostToolUse`, and `hooks.Stop`. Each entry runs the `ccm-hook` binary, passing the event type, session ID, and tool name as arguments. `ccm stop` removes these entries.

### State files

`ccm-hook` writes a small JSON file to `~/.ccm/sessions/<sessionId>.json` on every hook invocation. The file contains:

```json
{
  "sessionId": "...",
  "state": "working | waiting | unknown",
  "cwd": "/path/to/project",
  "lastToolName": "Write",
  "updatedAt": "2026-01-01T00:00:00.000Z"
}
```

The hook always exits 0 so it never blocks Claude Code.

### Session states

| State | Meaning |
|-------|---------|
| `working` | Claude is actively using a tool (`PreToolUse` or `PostToolUse` fired) |
| `waiting` | Claude finished responding, waiting for input (`Stop` fired) |
| `unknown` | No hook activity for 60 seconds while in `working` state |

Sessions in `unknown` state are removed from the in-memory store after 10 minutes.

### Real-time updates

The server uses chokidar to watch `~/.ccm/sessions/*.json`. When any file changes, the session store is updated and all connected WebSocket clients receive a `session_update` message. On first connect, the client receives a `snapshot` with all current sessions and today's stats.

### Managed vs view-only sessions

- Sessions started with `ccm new` are flagged `managed: true` in their state file. The dashboard shows an input box and `POST /api/sessions/:id/input` sends text via tmux.
- Sessions detected only through hooks (no matching state file with `managed: true`) are view-only. The input endpoint returns 403 for these.

### Stats

Daily stats (tools run, inputs sent, active session count) are tracked in memory and flushed to `~/.ccm/stats-YYYY-MM-DD.json` on SIGTERM/SIGINT. Stats roll over at midnight.

## Development

```bash
npm test               # run all tests
npm test -- --watch    # watch mode
```

Tests cover: hook state writing, hooks-config registration/deregistration, session store state machine, stats tracking, auth middleware, and tmux wrapper.

## License

MIT
