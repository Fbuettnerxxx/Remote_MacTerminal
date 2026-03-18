const fs = require('fs');
const path = require('path');

const CONFIG_PATH   = path.join(process.env.HOME || require('os').homedir(), '.ccm', 'config.json');
const SETTINGS_PATH = path.join(process.env.HOME || require('os').homedir(), '.claude', 'settings.json');
const PID_FILE      = path.join(process.env.HOME || require('os').homedir(), '.ccm', 'server.pid');

function readConfig() {
  try { return JSON.parse(fs.readFileSync(CONFIG_PATH, 'utf8')); } catch (_) { return {}; }
}

function writeConfig(data) {
  fs.mkdirSync(path.dirname(CONFIG_PATH), { recursive: true });
  fs.writeFileSync(CONFIG_PATH, JSON.stringify({ ...readConfig(), ...data }, null, 2));
}

function readClaudeSettings() {
  try { return JSON.parse(fs.readFileSync(SETTINGS_PATH, 'utf8')); } catch (_) { return {}; }
}

function writeClaudeSettings(data) {
  fs.mkdirSync(path.dirname(SETTINGS_PATH), { recursive: true });
  fs.writeFileSync(SETTINGS_PATH, JSON.stringify(data, null, 2));
}

module.exports = { readConfig, writeConfig, readClaudeSettings, writeClaudeSettings, CONFIG_PATH, SETTINGS_PATH, PID_FILE };
