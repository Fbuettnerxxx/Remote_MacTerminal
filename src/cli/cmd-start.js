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
      const hookBin = path.resolve(__dirname, '../../bin/ccm-hook');
      const settings = readClaudeSettings();
      writeClaudeSettings(registerHooks(settings, hookBin));
      console.log('✓ Claude Code hooks registered');

      const { server } = createServer({ token });
      server.listen(port, '0.0.0.0', () => {
        fs.mkdirSync(path.dirname(PID_FILE), { recursive: true });
        fs.writeFileSync(PID_FILE, String(process.pid));
        console.log(`✓ ccm server running on port ${port}`);
        console.log(`\n  ⚠️  Claude Code sessions already running won't appear until restarted.`);
        console.log(`  New sessions started after this point are tracked automatically.\n`);
        if (token) {
          console.log(`\n  Cloudflare mode — access token generated.`);
          console.log(`  Local URL: http://localhost:${port}?token=${token}`);
          console.log(`  Run 'ccm tunnel cloudflare' for a public URL\n`);
        } else {
          console.log(`  Tailscale mode — run 'ccm tunnel tailscale' for remote URL`);
        }
      });
    });
};
