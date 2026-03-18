const fs = require('fs');
const os = require('os');
const path = require('path');
const { pruneOldSessionFiles } = require('./server');

describe('pruneOldSessionFiles', () => {
  let tmpDir;

  beforeEach(() => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'ccm-prune-'));
  });

  afterEach(() => {
    fs.rmSync(tmpDir, { recursive: true, force: true });
  });

  it('deletes files older than 30 days', () => {
    const filePath = path.join(tmpDir, 'old.json');
    fs.writeFileSync(filePath, '{}');
    // Backdate mtime to 31 days ago
    const old = new Date(Date.now() - 31 * 24 * 60 * 60 * 1000);
    fs.utimesSync(filePath, old, old);

    const pruned = pruneOldSessionFiles(tmpDir);
    expect(pruned).toBe(1);
    expect(fs.existsSync(filePath)).toBe(false);
  });

  it('keeps files newer than 30 days', () => {
    const filePath = path.join(tmpDir, 'new.json');
    fs.writeFileSync(filePath, '{}');

    const pruned = pruneOldSessionFiles(tmpDir);
    expect(pruned).toBe(0);
    expect(fs.existsSync(filePath)).toBe(true);
  });

  it('ignores non-json files', () => {
    const filePath = path.join(tmpDir, 'not-json.txt');
    fs.writeFileSync(filePath, 'hello');
    const old = new Date(Date.now() - 31 * 24 * 60 * 60 * 1000);
    fs.utimesSync(filePath, old, old);

    const pruned = pruneOldSessionFiles(tmpDir);
    expect(pruned).toBe(0);
    expect(fs.existsSync(filePath)).toBe(true);
  });

  it('returns 0 if directory does not exist', () => {
    const pruned = pruneOldSessionFiles('/tmp/does-not-exist-ccm-xyz');
    expect(pruned).toBe(0);
  });
});
