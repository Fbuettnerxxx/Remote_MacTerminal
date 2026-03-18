const path = require('path');
const { newWindow } = require('../backend/tmux.js');

module.exports = (program) => {
  program.command('new')
    .description('Start a new managed Claude session')
    .argument('<label>', 'Session label')
    .argument('[path]', 'Working directory', process.cwd())
    .action((label, cwdArg) => {
      const cwd = path.resolve(cwdArg);
      const windowName = label.replace(/[^a-zA-Z0-9_-]/g, '-').toLowerCase();

      try {
        // newWindow sets CCM_WINDOW_NAME + CCM_LABEL in the tmux window env;
        // the hook picks these up and marks the real Claude session as managed
        newWindow({ windowName, cwd, label });
        console.log(`✓ Session "${label}" started in tmux window "${windowName}"`);
        console.log(`  Working dir: ${cwd}`);
        console.log(`  Session will appear on the dashboard once Claude is ready`);
      } catch (err) {
        console.error(`Error: ${err.message}`);
        process.exit(1);
      }
    });
};
