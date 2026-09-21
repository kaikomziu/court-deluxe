import { ONLINE_TIMEOUT_MS } from './config.js';

let handlers = null;

export function initLobbyHandlers(h) {
  handlers = h;
}

function isOnline(p) {
  return Date.now() - new Date(p.last_seen).getTime() < ONLINE_TIMEOUT_MS;
}

function roleCapacityInfo(role, participants) {
  const count = participants.filter((p) => p.role_key === role.key).length;
  const unlimited = role.capacity < 0;
  return { count, cap: role.capacity, unlimited, full: !unlimited && count >= role.capacity };
}

export function renderLobby({ room, participants, me }) {
  document.getElementById('lobby-room-code').textContent = room.room_code;
  document.getElementById('lobby-topic').textContent = room.topic;

  const roles = room.roles_config;
  const grid = document.getElementById('lobby-role-grid');
  grid.replaceChildren();

  for (const role of roles.filter(Boolean)) {
    const info = roleCapacityInfo(role, participants);
    const mine = me && me.role_key === role.key;
    const div = document.createElement('div');
    div.className = 'role-slot' + (mine ? ' selected' : '') + (info.full && !mine ? ' full' : '');
    div.innerHTML = `
      <span class="icon">${role.icon || '🏷️'}</span>
      <span class="label">${role.label}</span>
      <span class="cap">${info.unlimited ? `${info.count}人 (無制限)` : `${info.count}/${info.cap}`}</span>
    `;
    if (!info.full || mine) {
      div.addEventListener('click', () => handlers.onSelectRole(role.key));
    }
    grid.appendChild(div);
  }

  renderParticipantList(document.getElementById('lobby-participant-list'), participants, room.roles_config);

  const statusEl = document.getElementById('lobby-status');
  const startBtn = document.getElementById('btn-start-session');
  const isHost = !!(me && me.is_host);
  const ready = !!(me && me.nickname && me.role_key);

  startBtn.hidden = true;
  statusEl.textContent = '';

  if (room.phase === 'lobby') {
    if (!ready) {
      statusEl.textContent = 'ニックネームと役職を選んでください。';
    } else if (isHost) {
      startBtn.hidden = false;
      statusEl.textContent = '準備ができたら開廷してください(足りない役職があっても開廷できます)。';
    } else {
      statusEl.textContent = 'ホストが開廷するのをお待ちください…';
    }
  } else if (!ready) {
    statusEl.textContent = '審議はすでに始まっています。ニックネームと役職を選ぶとすぐに入廷します。';
  }
}

export function renderParticipantList(container, participants, rolesConfig) {
  container.replaceChildren();
  const roleMap = new Map(rolesConfig.map((r) => [r.key, r]));
  for (const p of participants) {
    if (!p.nickname) continue;
    const role = roleMap.get(p.role_key);
    const row = document.createElement('div');
    row.className = 'participant-row';
    row.innerHTML = `
      <span class="dot ${isOnline(p) ? 'online' : ''}"></span>
      <span>${p.is_host ? '<span class="host-star">★</span> ' : ''}${escapeHtml(p.nickname)}</span>
      ${role ? `<span class="role-tag" style="background:${role.color}">${role.label}</span>` : ''}
    `;
    container.appendChild(row);
  }
}

function escapeHtml(s) {
  return String(s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
}
