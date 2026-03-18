const { readConfig } = require('../config.js');
const { getTailscaleUrl, isTailscaleAvailable } = require('../tunnel/tailscale.js');

module.exports = (program) => {
  program.command('tunnel')
    .description('Print your Tailscale URL for phone access')
    .action(() => {
      if (!isTailscaleAvailable()) {
        console.error('Tailscale not found. Install from https://tailscale.com/download');
        process.exit(1);
      }
      const port = readConfig().port || 3000;
      const url = getTailscaleUrl(port);
      if (!url) {
        console.error('Could not get Tailscale IP. Is Tailscale running?');
        process.exit(1);
      }
      console.log(`\n  Open this on your phone:\n\n  ${url}\n`);
    });
};
