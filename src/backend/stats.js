const fs = require('fs');
const path = require('path');

class Stats {
  constructor({ statsDir } = {}) {
    this._statsDir = statsDir || path.join(process.env.HOME || require('os').homedir(), '.ccm');
    this._date = this._today();
    this._data = { toolsRun: 0, inputsSent: 0, _sessionsActive: new Set() };
    this._load();
  }

  _today() { return new Date().toISOString().split('T')[0]; }

  _filePath(date) { return path.join(this._statsDir, `stats-${date}.json`); }

  _load() {
    try {
      const raw = JSON.parse(fs.readFileSync(this._filePath(this._date), 'utf8'));
      this._data.toolsRun = raw.toolsRun || 0;
      this._data.inputsSent = raw.inputsSent || 0;
      // sessionsActive count is not restored (it's a live set)
    } catch (_) {}
  }

  _checkRollover() {
    const today = this._today();
    if (today !== this._date) {
      this.flush();
      this._date = today;
      this._data = { toolsRun: 0, inputsSent: 0, _sessionsActive: new Set() };
    }
  }

  recordToolUse() { this._checkRollover(); this._data.toolsRun++; }
  recordInputSent() { this._checkRollover(); this._data.inputsSent++; }
  recordSessionActive(id) { this._checkRollover(); this._data._sessionsActive.add(id); }

  today() {
    return {
      toolsRun: this._data.toolsRun,
      inputsSent: this._data.inputsSent,
      sessionsActive: this._data._sessionsActive.size,
    };
  }

  flush() {
    fs.mkdirSync(this._statsDir, { recursive: true });
    const { _sessionsActive, ...serializable } = this._data;
    fs.writeFileSync(this._filePath(this._date), JSON.stringify({
      ...serializable,
      sessionsActive: _sessionsActive.size,
    }, null, 2));
  }
}

module.exports = { Stats };
