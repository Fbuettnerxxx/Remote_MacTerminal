const { readConfig, writeConfig } = require('../config.js');
const { getTailscaleUrl, isTailscaleAvailable } = require('../tunnel/tailscale.js');
const { startCloudflareTunnel, isCloudflareAvailable } = require('../tunnel/cloudflare.js');

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
        if (!isCloudflareAvailable()) {
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
