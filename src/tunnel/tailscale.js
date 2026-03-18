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
