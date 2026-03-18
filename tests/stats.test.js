const { Stats } = require('../src/backend/stats.js');
const os = require('os');
const path = require('path');
const fs = require('fs');

describe('Stats', () => {
  let tmpDir, stats;

  beforeEach(() => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'ccm-stats-'));
    stats = new Stats({ statsDir: tmpDir });
  });

  test('increments toolsRun', () => {
    stats.recordToolUse();
    stats.recordToolUse();
    expect(stats.today().toolsRun).toBe(2);
  });

  test('increments inputsSent', () => {
    stats.recordInputSent();
    expect(stats.today().inputsSent).toBe(1);
  });

  test('tracks unique active sessions', () => {
    stats.recordSessionActive('a');
    stats.recordSessionActive('b');
    stats.recordSessionActive('a'); // duplicate
    expect(stats.today().sessionsActive).toBe(2);
  });

  test('persists to file on flush', () => {
    stats.recordToolUse();
    stats.flush();
    const files = fs.readdirSync(tmpDir).filter(f => f.startsWith('stats-'));
    expect(files.length).toBe(1);
    const data = JSON.parse(fs.readFileSync(path.join(tmpDir, files[0]), 'utf8'));
    expect(data.toolsRun).toBe(1);
  });

  test('loads from existing file on init', () => {
    const today = new Date().toISOString().split('T')[0];
    fs.writeFileSync(path.join(tmpDir, `stats-${today}.json`), JSON.stringify({ toolsRun: 5, inputsSent: 2, sessionsActive: 1 }));
    const s2 = new Stats({ statsDir: tmpDir });
    expect(s2.today().toolsRun).toBe(5);
  });
});
