const { execSync, execFileSync } = require('child_process');

const CCM_SESSION = 'ccm';

// These build functions are used in unit tests to verify argument construction.
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

function newWindow({ windowName, cwd, sessionName = CCM_SESSION }) {
  ensureSession(sessionName);
  // Use execFileSync to avoid shell interpretation of cwd and windowName
  execFileSync('tmux', ['new-window', '-t', sessionName, '-n', windowName, '-c', cwd]);
  execFileSync('tmux', ['send-keys', '-t', `${sessionName}:${windowName}`, 'claude', 'Enter']);
}

function sendInput({ windowName, text, sessionName = CCM_SESSION }) {
  // Use execFileSync to avoid shell interpretation of user-provided text
  execFileSync('tmux', ['send-keys', '-t', `${sessionName}:${windowName}`, text, 'Enter']);
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
