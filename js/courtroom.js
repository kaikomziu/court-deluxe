import { findRoleMeta } from './roles.js';
import { renderParticipantList } from './lobby.js';
import { getClientId } from './state.js';

let handlers = null;
const renderedIds = new Set();
const messageById = new Map();
let replyingToId = null;

export function initCourtroomHandlers(h) {
  handlers = h;
}

export function resetCourtroom() {
  renderedIds.clear();
  messageById.clear();
  cancelReply();
  document.getElementById('chat-log').replaceChildren();
}

function escapeHtml(s) {
  return String(s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
}

function truncate(text, max) {
  return text.length > max ? text.slice(0, max) + '…' : text;
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

function buildQuotedRef(msg, rolesConfig) {
  if (!msg.reply_to_id) return '';
  const original = messageById.get(msg.reply_to_id);
  if (!original) return '';
  const originalRole = findRoleMeta(rolesConfig, original.role_key);
  return `<div class="quoted-ref" data-scroll-to="${original.id}">
    <span class="quoted-name">${originalRole.icon || ''} ${escapeHtml(original.nickname || originalRole.label)}</span>:
    ${escapeHtml(truncate(original.body, 40))}
  </div>`;
}

function buildMessageNode(msg, rolesConfig) {
  const role = findRoleMeta(rolesConfig, msg.role_key);
  const mine = msg.client_id && msg.client_id === getClientId();
  const div = document.createElement('div');
  div.className = 'msg' + (msg.kind === 'judge' ? ' judge' : msg.kind === 'system' ? ' system' : mine ? ' self' : '');
  div.dataset.id = msg.id;
  div.style.borderLeftColor = msg.kind === 'chat' ? role.color : '';

  const replyBtn = msg.kind === 'chat'
    ? `<button type="button" class="msg-reply" data-id="${msg.id}">↩ 返信</button>`
    : '';
  const starBtn = msg.kind === 'chat'
    ? `<button type="button" class="msg-star" data-id="${msg.id}">⭐ ${msg.star_count || 0}</button>`
    : '';

  div.innerHTML = `
    <div class="msg-head">
      <span class="icon">${role.icon || ''}</span>
      <span class="name">${escapeHtml(msg.nickname || role.label)}</span>
      <span>${msg.kind === 'chat' ? role.label : ''}</span>
      ${replyBtn}
      ${starBtn}
    </div>
    ${buildQuotedRef(msg, rolesConfig)}
    <div class="msg-body">${escapeHtml(msg.body)}</div>
  `;
  return div;
}

export function renderAllMessages(messages, rolesConfig) {
  renderedIds.clear();
  messageById.clear();
  for (const msg of messages) messageById.set(msg.id, msg);
  const log = document.getElementById('chat-log');
  log.replaceChildren();
  for (const msg of messages) {
    log.appendChild(buildMessageNode(msg, rolesConfig));
    renderedIds.add(msg.id);
  }
  log.scrollTop = log.scrollHeight;
}

export function appendMessage(msg, rolesConfig) {
  messageById.set(msg.id, msg);
  if (renderedIds.has(msg.id)) return;
  renderedIds.add(msg.id);
  const log = document.getElementById('chat-log');
  const atBottom = log.scrollHeight - log.scrollTop - log.clientHeight < 80;
  log.appendChild(buildMessageNode(msg, rolesConfig));
  if (atBottom) log.scrollTop = log.scrollHeight;
}

function scrollToMessage(messageId) {
  const node = document.querySelector(`.msg[data-id="${messageId}"]`);
  if (!node) return;
  node.scrollIntoView({ behavior: 'smooth', block: 'center' });
  node.classList.remove('flash-highlight');
  void node.offsetWidth;
  node.classList.add('flash-highlight');
}

function startReply(messageId) {
  const original = messageById.get(messageId);
  if (!original) return;
  replyingToId = messageId;
  const preview = document.getElementById('reply-preview');
  document.getElementById('reply-preview-text').textContent = `${original.nickname}: ${truncate(original.body, 50)}`;
  preview.hidden = false;
  document.getElementById('input-chat').focus();
}

function cancelReply() {
  replyingToId = null;
  const preview = document.getElementById('reply-preview');
  if (preview) preview.hidden = true;
}

export function updateMessageStar(msg) {
  const node = document.querySelector(`.msg[data-id="${msg.id}"] .msg-star`);
  if (node) node.textContent = `⭐ ${msg.star_count || 0}`;
}

export function setTypingIndicator(nicknames) {
  const el = document.getElementById('typing-indicator');
  if (!nicknames || nicknames.length === 0) {
    el.hidden = true;
    el.textContent = '';
    return;
  }
  const label = `${nicknames.join('・')}が入力中`;
  el.innerHTML = `${escapeHtml(label)}<span class="typing-dots"><span></span><span></span><span></span></span>`;
  el.hidden = false;
}

export function wireCourtroomDom() {
  document.getElementById('form-chat').addEventListener('submit', (e) => {
    e.preventDefault();
    const input = document.getElementById('input-chat');
    const body = input.value.trim();
    if (!body) return;
    handlers.onSend(body, replyingToId);
    input.value = '';
    cancelReply();
    handlers.onStopTyping();
  });

  document.getElementById('btn-cancel-reply').addEventListener('click', cancelReply);

  document.getElementById('input-chat').addEventListener('input', (e) => {
    if (e.target.value.trim()) {
      handlers.onTyping();
    } else {
      handlers.onStopTyping();
    }
  });

  document.getElementById('chat-log').addEventListener('click', (e) => {
    const starBtn = e.target.closest('.msg-star');
    if (starBtn) return handlers.onToggleStar(starBtn.dataset.id);
    const replyBtn = e.target.closest('.msg-reply');
    if (replyBtn) return startReply(replyBtn.dataset.id);
    const quoted = e.target.closest('.quoted-ref');
    if (quoted) return scrollToMessage(quoted.dataset.scrollTo);
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
