const path = require('path');
const fs = require('fs');
const { spawn } = require('child_process');
const { createServer } = require('../backend/server.js');
const { registerHooks } = require('../hooks-config/index.js');
const { readConfig, readClaudeSettings, writeClaudeSettings, ensureToken, PID_FILE } = require('../config.js');
const { isTmuxAvailable } = require('../backend/tmux.js');

module.exports = (program) => {
  program.command('start')
    .description('Start ccm server in the background and register hooks')
    .option('-p, --port <port>', 'Port to listen on', '3000')
    .option('--foreground', 'Run in foreground instead of background')
    .action((opts) => {
      if (!isTmuxAvailable()) {
        console.error('tmux not found. Install with: brew install tmux');
        process.exit(1);
      }

      // Daemonize: re-spawn self with --foreground, detached, stdio to log file
      if (!opts.foreground) {
        const logFile = path.join(require('os').homedir(), '.ccm', 'server.log');
        fs.mkdirSync(path.dirname(logFile), { recursive: true });
        const out = fs.openSync(logFile, 'a');
        const child = spawn(process.execPath, [process.argv[1], 'start', '--foreground', '--port', opts.port], {
          detached: true,
          stdio: ['ignore', out, out],
        });
        child.unref();
        // Wait briefly for the server to write its PID, then confirm
        setTimeout(() => {
          try {
            const pid = fs.readFileSync(PID_FILE, 'utf8').trim();
            console.log(`✓ ccm server started (pid ${pid})`);
            console.log(`  Logs: ${logFile}`);
            console.log(`  Run 'ccm tunnel tailscale' for your phone URL`);
          } catch (_) {
            console.log(`✓ ccm server starting… (logs: ${logFile})`);
          }
          process.exit(0);
        }, 800);
        return;
      }

      // Foreground mode (used by the daemon process)
      const cfg = readConfig();
      const port = parseInt(opts.port) || cfg.port || 3000;
      const tunnelMode = cfg.tunnel || 'tailscale';
      const token = ensureToken(tunnelMode);

      const hookBin = path.resolve(__dirname, '../../bin/ccm-hook');
      const settings = readClaudeSettings();
      writeClaudeSettings(registerHooks(settings, hookBin));

      const { server } = createServer({ token });
      server.listen(port, '0.0.0.0', () => {
        fs.mkdirSync(path.dirname(PID_FILE), { recursive: true });
        fs.writeFileSync(PID_FILE, String(process.pid));
      });
    });
};
