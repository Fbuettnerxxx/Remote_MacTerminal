const fs = require('fs');
const path = require('path');

module.exports = (program) => {
  program.command('list')
    .description('List all known sessions')
    .action(() => {
      const sessionsDir = path.join(process.env.HOME || require('os').homedir(), '.ccm', 'sessions');
      try {
        const files = fs.readdirSync(sessionsDir).filter(f => f.endsWith('.json'));
        if (!files.length) { console.log('No sessions found.'); return; }

        const rows = files.map(f => {
          try { return JSON.parse(fs.readFileSync(path.join(sessionsDir, f), 'utf8')); } catch (_) { return null; }
        }).filter(Boolean);

        console.log('\nID               LABEL            STATE         CWD');
        console.log('─'.repeat(80));
        for (const s of rows) {
          const id = (s.sessionId || '').slice(0, 16).padEnd(16);
          const label = (s.label || s.cwd?.split('/').pop() || '?').slice(0, 16).padEnd(16);
          const state = (s.state || '?').padEnd(13);
          const cwd = s.cwd || '';
          const managed = s.managed === false ? '  [view-only]' : '';
          console.log(`${id} ${label} ${state} ${cwd}${managed}`);
        }
        console.log('');
      } catch (_) {
        console.log('No sessions directory found. Run ccm start first.');
      }
    });
};
