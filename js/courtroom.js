import { findRoleMeta } from './roles.js';
import { renderParticipantList } from './lobby.js';
import { getClientId } from './state.js';

let handlers = null;
const renderedIds = new Set();

export function initCourtroomHandlers(h) {
  handlers = h;
}

export function resetCourtroom() {
  renderedIds.clear();
  document.getElementById('chat-log').replaceChildren();
}

function escapeHtml(s) {
  return String(s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
}

export function renderCourtHeader(room, isHost) {
  document.getElementById('court-room-code').textContent = room.room_code;
  document.getElementById('court-topic').textContent = room.topic;
  const badge = document.getElementById('court-phase-badge');
  badge.className = 'phase-badge ' + room.phase;
  badge.textContent = { lobby: '開廷前', in_session: '審議中', concluded: '審議終了' }[room.phase] || room.phase;

  const nextBtn = document.getElementById('btn-next-turn');
  nextBtn.hidden = room.phase !== 'in_session' || !isHost;
  document.getElementById('btn-conclude').disabled = room.phase !== 'in_session';

  const chatDisabled = room.phase === 'concluded';
  document.getElementById('input-chat').disabled = chatDisabled;
  document.querySelector('#form-chat button[type="submit"]').disabled = chatDisabled;
}

export function renderCourtParticipants(participants, rolesConfig) {
  renderParticipantList(document.getElementById('court-participant-list'), participants, rolesConfig);
}

function buildMessageNode(msg, rolesConfig) {
  const role = findRoleMeta(rolesConfig, msg.role_key);
  const mine = msg.client_id && msg.client_id === getClientId();
  const div = document.createElement('div');
  div.className = 'msg' + (msg.kind === 'judge' ? ' judge' : msg.kind === 'system' ? ' system' : mine ? ' self' : '');
  div.dataset.id = msg.id;
  div.style.borderLeftColor = msg.kind === 'chat' ? role.color : '';

  const starBtn = msg.kind === 'chat'
    ? `<button type="button" class="msg-star" data-id="${msg.id}">⭐ ${msg.star_count || 0}</button>`
    : '';

  div.innerHTML = `
    <div class="msg-head">
      <span class="icon">${role.icon || ''}</span>
      <span class="name">${escapeHtml(msg.nickname || role.label)}</span>
      <span>${msg.kind === 'chat' ? role.label : ''}</span>
      ${starBtn}
    </div>
    <div class="msg-body">${escapeHtml(msg.body)}</div>
  `;
  return div;
}

export function renderAllMessages(messages, rolesConfig) {
  renderedIds.clear();
  const log = document.getElementById('chat-log');
  log.replaceChildren();
  for (const msg of messages) {
    log.appendChild(buildMessageNode(msg, rolesConfig));
    renderedIds.add(msg.id);
  }
  log.scrollTop = log.scrollHeight;
}

export function appendMessage(msg, rolesConfig) {
  if (renderedIds.has(msg.id)) return;
  renderedIds.add(msg.id);
  const log = document.getElementById('chat-log');
  const atBottom = log.scrollHeight - log.scrollTop - log.clientHeight < 80;
  log.appendChild(buildMessageNode(msg, rolesConfig));
  if (atBottom) log.scrollTop = log.scrollHeight;
}

export function updateMessageStar(msg) {
  const node = document.querySelector(`.msg[data-id="${msg.id}"] .msg-star`);
  if (node) node.textContent = `⭐ ${msg.star_count || 0}`;
}

export function wireCourtroomDom() {
  document.getElementById('form-chat').addEventListener('submit', (e) => {
    e.preventDefault();
    const input = document.getElementById('input-chat');
    const body = input.value.trim();
    if (!body) return;
    handlers.onSend(body);
    input.value = '';
  });

  document.getElementById('chat-log').addEventListener('click', (e) => {
    const btn = e.target.closest('.msg-star');
    if (btn) handlers.onToggleStar(btn.dataset.id);
  });

  document.getElementById('btn-next-turn').addEventListener('click', () => {
    handlers.onNextTurn();
    closeSidebar();
  });
  document.getElementById('btn-conclude').addEventListener('click', () => {
    handlers.onConclude();
    closeSidebar();
  });

  document.getElementById('btn-toggle-sidebar').addEventListener('click', openSidebar);
  document.getElementById('btn-close-sidebar').addEventListener('click', closeSidebar);
  document.getElementById('court-sidebar-backdrop').addEventListener('click', closeSidebar);
}

function openSidebar() {
  document.getElementById('court-sidebar').classList.add('open');
  document.getElementById('court-sidebar-backdrop').classList.add('show');
}

function closeSidebar() {
  document.getElementById('court-sidebar').classList.remove('open');
  document.getElementById('court-sidebar-backdrop').classList.remove('show');
}
