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
      const sessionsDir = path.join(process.env.HOME || require('os').homedir(), '.ccm', 'sessions');

      try {
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
