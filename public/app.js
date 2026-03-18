const EMOJIS = ['🚀','🌐','⚡','🔥','🧪','🛠️','🎯','🦾','🔬','💡'];

function getToken() {
  return new URLSearchParams(location.search).get('token') || '';
}

function wsUrl() {
  const proto = location.protocol === 'https:' ? 'wss' : 'ws';
  const token = getToken();
  return `${proto}://${location.host}${token ? '?token=' + token : ''}`;
}

let sessions = {};
let statsData = {};

function connect() {
  const ws = new WebSocket(wsUrl());

  ws.onopen = () => {
    document.getElementById('conn-indicator').className = 'conn-dot connected';
    document.getElementById('conn-label').textContent = 'Connected';
  };

  ws.onmessage = (e) => {
    const msg = JSON.parse(e.data);
    if (msg.type === 'snapshot') {
      sessions = {};
      msg.sessions.forEach(s => sessions[s.sessionId] = s);
      statsData = msg.stats;
    } else if (msg.type === 'session_update') {
      sessions[msg.session.sessionId] = msg.session;
      statsData = msg.stats || statsData;
    }
    render();
  };

  ws.onclose = () => {
    document.getElementById('conn-indicator').className = 'conn-dot disconnected';
    document.getElementById('conn-label').textContent = 'Reconnecting…';
    setTimeout(connect, 3000);
  };
}

function render() {
  renderStats();
  renderSessions();
}

function renderStats() {
  const all = Object.values(sessions);
  const working = all.filter(s => s.state === 'working').length;
  const waiting = all.filter(s => s.state === 'waiting').length;
  document.getElementById('header-meta').textContent = `${all.length} session${all.length !== 1 ? 's' : ''}`;
  document.getElementById('stats-row').innerHTML = `
    <div class="stat-chip"><div class="stat-val">${working}</div><div class="stat-lbl">Working</div></div>
    <div class="stat-chip"><div class="stat-val green">${waiting}</div><div class="stat-lbl">Waiting</div></div>
    <div class="stat-chip"><div class="stat-val blue">${statsData.toolsRun || 0}</div><div class="stat-lbl">Tools run</div></div>
  `;
}

function renderSessions() {
  const sorted = Object.values(sessions).sort((a, b) => {
    const order = { waiting: 0, working: 1, bootstrapping: 2, unknown: 3, offline: 4 };
    return (order[a.state] ?? 5) - (order[b.state] ?? 5);
  });

  const list = document.getElementById('session-list');
  list.innerHTML = sorted.map(s => renderCard(s)).join('') + renderNewBtn();

  sorted.forEach(s => {
    if (s.state === 'waiting' && s.managed !== false) {
      const input = document.getElementById(`input-${s.sessionId}`);
      const btn = document.getElementById(`send-${s.sessionId}`);
      if (input && btn) {
        btn.onclick = () => sendInput(s.sessionId, input.value);
        input.onkeydown = (e) => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); sendInput(s.sessionId, input.value); } };
      }
    }
  });
}

function renderCard(s) {
  const emoji = EMOJIS[Math.abs(hashCode(s.sessionId)) % EMOJIS.length];
  const label = escapeHtml(s.label || s.cwd?.split('/').pop() || s.sessionId.slice(0, 8));
  const cwdDisplay = escapeHtml(s.cwd || '');
  const isManaged = s.managed !== false;
  const safeId = escapeHtml(s.sessionId);
  const safeState = escapeHtml(s.state);

  const badgeDot = ['working', 'bootstrapping'].includes(s.state) ? '<div class="dot pulse"></div>' : '<div class="dot"></div>';
  const activityRaw = s.lastToolName ? `doing: ${s.lastToolName}` : s.state === 'waiting' ? 'ready for input' : s.state;
  const activityText = escapeHtml(activityRaw);

  let footer = '';
  if (s.state === 'waiting' && isManaged) {
    footer = `<div class="input-row"><input id="input-${safeId}" class="quick-input" placeholder="Reply to Claude…"><button id="send-${safeId}" class="send-btn">↑</button></div>`;
  } else if (!isManaged) {
    footer = `<div class="viewonly-row"><span class="viewonly-label">Existing session · view only</span><button class="adopt-btn" onclick="adoptSession('${safeId}')">Adopt →</button></div>`;
  }

  const toolChips = s.toolHistory?.slice(-3).map(t => `<span class="tool-chip">${escapeHtml(t)}</span>`).join('') || '';

  return `
    <div class="card ${safeState}">
      <div class="card-top">
        <div class="card-label">
          <div class="emoji-badge">${emoji}</div>
          <div><div class="session-name">${label}</div><div class="session-path">${cwdDisplay}</div></div>
        </div>
        <div class="status-badge ${safeState}">${badgeDot} ${safeState}</div>
      </div>
      ${toolChips ? `<div class="tool-chips">${toolChips}</div>` : ''}
      <div class="card-activity"><span class="activity-text">${activityText}</span></div>
      ${footer}
    </div>`;
}

function renderNewBtn() {
  return `<button class="new-session-btn" onclick="showNewSessionModal()">＋ New session</button>`;
}

function showNewSessionModal() {
  document.getElementById('modal-overlay').classList.remove('hidden');
  document.getElementById('modal-label').focus();
  document.getElementById('modal-error').classList.add('hidden');
  document.getElementById('modal-error').textContent = '';
}

function hideNewSessionModal() {
  document.getElementById('modal-overlay').classList.add('hidden');
  document.getElementById('modal-label').value = '';
  document.getElementById('modal-cwd').value = '';
  document.getElementById('modal-error').classList.add('hidden');
}

function closeModal(e) {
  if (e.target === document.getElementById('modal-overlay')) hideNewSessionModal();
}

async function submitNewSession() {
  const label = document.getElementById('modal-label').value.trim();
  const cwd = document.getElementById('modal-cwd').value.trim();
  const errEl = document.getElementById('modal-error');
  const btn = document.getElementById('modal-submit');

  errEl.classList.add('hidden');
  if (!label) { errEl.textContent = 'Label is required'; errEl.classList.remove('hidden'); return; }
  if (!cwd) { errEl.textContent = 'Working directory is required'; errEl.classList.remove('hidden'); return; }

  btn.disabled = true;
  btn.textContent = 'Starting…';
  const token = getToken();
  const url = `/api/sessions/new${token ? '?token=' + token : ''}`;
  try {
    const res = await fetch(url, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ label, cwd }) });
    const data = await res.json();
    if (!res.ok) {
      errEl.textContent = data.error || 'Failed to start session';
      errEl.classList.remove('hidden');
    } else {
      hideNewSessionModal();
      // Show a temporary card while Claude is starting (disappears when real session arrives)
      const tempId = '_starting_' + Date.now();
      sessions[tempId] = { sessionId: tempId, label, cwd, state: 'bootstrapping', managed: true, _temp: true };
      render();
      setTimeout(() => { if (sessions[tempId]) { delete sessions[tempId]; render(); } }, 30000);
    }
  } catch (e) {
    errEl.textContent = 'Network error';
    errEl.classList.remove('hidden');
  }
  btn.disabled = false;
  btn.textContent = 'Start Session →';
}

async function sendInput(sessionId, text) {
  if (!text.trim()) return;
  const token = getToken();
  const url = `/api/sessions/${sessionId}/input${token ? '?token=' + token : ''}`;
  await fetch(url, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ text }) });
  const input = document.getElementById(`input-${sessionId}`);
  if (input) input.value = '';
}

function adoptSession(sessionId) {
  alert(`To adopt this session, run:\nccm adopt ${sessionId}`);
}

function hashCode(str) {
  let h = 0;
  for (let i = 0; i < str.length; i++) h = Math.imul(31, h) + str.charCodeAt(i) | 0;
  return h;
}

function escapeHtml(str) {
  return String(str)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

connect();
