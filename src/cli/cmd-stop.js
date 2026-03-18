const fs = require('fs');
const { deregisterHooks } = require('../hooks-config/index.js');
const { readClaudeSettings, writeClaudeSettings, PID_FILE } = require('../config.js');

module.exports = (program) => {
  program.command('stop')
    .description('Stop ccm server and deregister hooks')
    .action(() => {
      try {
        const pid = parseInt(fs.readFileSync(PID_FILE, 'utf8'));
        process.kill(pid, 'SIGTERM');
        fs.unlinkSync(PID_FILE);
        console.log('✓ ccm server stopped');
      } catch (_) {
        console.log('No running server found');
      }
      const settings = readClaudeSettings();
      writeClaudeSettings(deregisterHooks(settings));
      console.log('✓ Claude Code hooks deregistered');
    });
};
