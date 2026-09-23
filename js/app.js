import { supabase } from './supabase-client.js';
import { ROLE_CATALOG, AUDIENCE_ROLE, customColor, slugifyCustomKey } from './roles.js';
import * as judge from './judge.js';
import * as roomApi from './room.js';
import { appState, getClientId, randomAudienceName } from './state.js';
import { HEARTBEAT_MS, TYPING_TIMEOUT_MS, TYPING_BROADCAST_INTERVAL_MS } from './config.js';
import { initLobbyHandlers, renderLobby } from './lobby.js';
import {
  initCourtroomHandlers,
  renderCourtHeader,
  renderCourtParticipants,
  renderAllMessages,
  appendMessage,
  updateMessageStar,
  setTypingIndicator,
  wireCourtroomDom,
  resetCourtroom,
} from './courtroom.js';

let customRoles = [];
let heartbeatTimer = null;
let tickTimer = null;
let typingSweepTimer = null;
let enteredCourtroom = false;
let channel = null;
let typingChannel = null;
const typingUsers = new Map();
let lastTypingBroadcastAt = 0;

function showView(name) {
  for (const id of ['view-landing', 'view-lobby', 'view-courtroom']) {
    document.getElementById(id).hidden = id !== name;
  }
}

function showLandingError(msg) {
  const el = document.getElementById('landing-error');
  el.textContent = msg || '';
  el.hidden = !msg;
}

// ---------- 部屋作成フォーム: 役職設定 ----------
function wireStepper(container, { min = 0, max = 9, initial = 0 } = {}) {
  const valueEl = container.querySelector('.stepper-value');
  valueEl.textContent = String(initial);
  container.addEventListener('click', (e) => {
    const btn = e.target.closest('.stepper-btn');
    if (!btn) return;
    const current = parseInt(valueEl.textContent, 10) || 0;
    const next = btn.dataset.action === 'inc' ? Math.min(max, current + 1) : Math.max(min, current - 1);
    valueEl.textContent = String(next);
  });
}

function buildRoleCatalogRows() {
  const container = document.getElementById('role-catalog-rows');
  container.replaceChildren();
  for (const role of ROLE_CATALOG) {
    const row = document.createElement('div');
    row.className = 'role-catalog-row';
    row.innerHTML = `
      <span class="role-label">${role.icon} ${role.label}</span>
      <div class="stepper" data-role-key="${role.key}">
        <button type="button" class="stepper-btn" data-action="dec">−</button>
        <span class="stepper-value">${role.defaultCap}</span>
        <button type="button" class="stepper-btn" data-action="inc">＋</button>
      </div>
    `;
    wireStepper(row.querySelector('.stepper'), { initial: role.defaultCap });
    container.appendChild(row);
  }
}

function renderCustomRoleList() {
  const ul = document.getElementById('custom-role-list');
  ul.replaceChildren();
  customRoles.forEach((r, idx) => {
    const li = document.createElement('li');
    const span = document.createElement('span');
    span.textContent = `${r.label} × ${r.capacity}`;
    const btn = document.createElement('button');
    btn.type = 'button';
    btn.textContent = '削除';
    btn.addEventListener('click', () => {
      customRoles.splice(idx, 1);
      renderCustomRoleList();
    });
    li.append(span, btn);
    ul.appendChild(li);
  });
}

function collectRolesConfig() {
  const roles = [];
  document.querySelectorAll('#role-catalog-rows .stepper').forEach((stepper) => {
    const cap = parseInt(stepper.querySelector('.stepper-value').textContent, 10) || 0;
    if (cap <= 0) return;
    const catalog = ROLE_CATALOG.find((r) => r.key === stepper.dataset.roleKey);
    roles.push({ key: catalog.key, label: catalog.label, color: catalog.color, icon: catalog.icon, capacity: cap });
  });
  customRoles.forEach((r) => roles.push({ ...r }));
  if (document.getElementById('input-allow-audience').checked) {
    roles.push({ ...AUDIENCE_ROLE, capacity: -1 });
  }
  return roles;
}

wireStepper(document.getElementById('custom-cap-stepper'), { min: 1, initial: 1 });

document.getElementById('btn-add-custom-role').addEventListener('click', () => {
  const labelInput = document.getElementById('input-custom-label');
  const capValueEl = document.getElementById('custom-cap-value');
  const label = labelInput.value.trim();
  const cap = parseInt(capValueEl.textContent, 10) || 1;
  if (!label) return;
  const existingKeys = [...ROLE_CATALOG.map((r) => r.key), 'audience', ...customRoles.map((r) => r.key)];
  const key = slugifyCustomKey(label, existingKeys);
  customRoles.push({ key, label, color: customColor(customRoles.length), icon: '🏷️', capacity: cap });
  labelInput.value = '';
  capValueEl.textContent = '1';
  renderCustomRoleList();
});

document.querySelectorAll('.tab-btn').forEach((btn) => {
  btn.addEventListener('click', () => {
    document.querySelectorAll('.tab-btn').forEach((b) => b.classList.remove('active'));
    document.querySelectorAll('.tab-panel').forEach((p) => p.classList.remove('active'));
    btn.classList.add('active');
    document.getElementById('tab-' + btn.dataset.tab).classList.add('active');
  });
});

// ---------- 部屋の作成・入室 ----------
async function enterRoomFlow(room, isCreator) {
  appState.room = room;
  enteredCourtroom = false;
  resetCourtroom();

  const clientId = getClientId();
  const participants = await roomApi.fetchParticipants(room.id);
  const existingMe = participants.find((p) => p.client_id === clientId);

  if (isCreator && !existingMe) {
    appState.me = await roomApi.upsertParticipant({ roomId: room.id, nickname: null, roleKey: null, isHost: true });
    appState.participants = await roomApi.fetchParticipants(room.id);
  } else {
    appState.me = existingMe || null;
    appState.participants = participants;
  }

  document.getElementById('input-nickname').value = appState.me?.nickname || '';
  appState.messages = await roomApi.fetchMessages(room.id);

  subscribeRoom(room.id);
  startHeartbeat(room.id);
  startTicker();
  startTypingSweep();
  showLandingError('');
  updateView();
}

function updateView() {
  const room = appState.room;
  if (!room) return;
  const me = appState.me;
  const ready = !!(me && me.nickname && me.role_key);

  if (!enteredCourtroom && ready && room.phase !== 'lobby') {
    enteredCourtroom = true;
  }

  if (enteredCourtroom) {
    showView('view-courtroom');
    renderCourtHeader(room, !!me?.is_host);
    renderCourtParticipants(appState.participants, room.roles_config);
    renderAllMessages(appState.messages, room.roles_config);
  } else {
    showView('view-lobby');
    renderLobby({ room, participants: appState.participants, me });
  }
}

function subscribeRoom(roomId) {
  if (channel) supabase.removeChannel(channel);
  channel = supabase
    .channel('court-room-' + roomId)
    .on(
      'postgres_changes',
      { event: 'UPDATE', schema: 'public', table: 'court_rooms', filter: `id=eq.${roomId}` },
      (payload) => {
        appState.room = payload.new;
        updateView();
      }
    )
    .on(
      'postgres_changes',
      { event: '*', schema: 'public', table: 'court_participants', filter: `room_id=eq.${roomId}` },
      async () => {
        appState.participants = await roomApi.fetchParticipants(roomId);
        const clientId = getClientId();
        appState.me = appState.participants.find((p) => p.client_id === clientId) || appState.me;
        updateView();
      }
    )
    .on(
      'postgres_changes',
      { event: 'INSERT', schema: 'public', table: 'court_messages', filter: `room_id=eq.${roomId}` },
      (payload) => {
        if (appState.messages.some((m) => m.id === payload.new.id)) return;
        appState.messages.push(payload.new);
        if (enteredCourtroom) appendMessage(payload.new, appState.room.roles_config);
        if (payload.new.client_id && typingUsers.delete(payload.new.client_id)) renderTypingIndicator();
      }
    )
    .on(
      'postgres_changes',
      { event: 'UPDATE', schema: 'public', table: 'court_messages', filter: `room_id=eq.${roomId}` },
      (payload) => {
        const idx = appState.messages.findIndex((m) => m.id === payload.new.id);
        if (idx >= 0) appState.messages[idx] = payload.new;
        updateMessageStar(payload.new);
      }
    )
    .subscribe();

  if (typingChannel) supabase.removeChannel(typingChannel);
  typingChannel = supabase
    .channel('court-typing-' + roomId, { config: { broadcast: { self: false } } })
    .on('broadcast', { event: 'typing' }, ({ payload }) => handleTypingBroadcast(payload))
    .subscribe();
}

function handleTypingBroadcast(payload) {
  if (!payload || payload.clientId === getClientId()) return;
  if (payload.stopped) {
    typingUsers.delete(payload.clientId);
  } else {
    typingUsers.set(payload.clientId, { nickname: payload.nickname, expiresAt: Date.now() + TYPING_TIMEOUT_MS });
  }
  renderTypingIndicator();
}

function renderTypingIndicator() {
  const now = Date.now();
  for (const [clientId, info] of typingUsers) {
    if (info.expiresAt <= now) typingUsers.delete(clientId);
  }
  setTypingIndicator([...typingUsers.values()].map((v) => v.nickname));
}

function broadcastTyping(stopped) {
  if (!typingChannel || !appState.me) return;
  const now = Date.now();
  if (!stopped) {
    if (now - lastTypingBroadcastAt < TYPING_BROADCAST_INTERVAL_MS) return;
    lastTypingBroadcastAt = now;
  } else {
    lastTypingBroadcastAt = 0;
  }
  typingChannel.send({
    type: 'broadcast',
    event: 'typing',
    payload: { clientId: getClientId(), nickname: appState.me.nickname, stopped },
  });
}

function startHeartbeat(roomId) {
  clearInterval(heartbeatTimer);
  heartbeatTimer = setInterval(() => roomApi.heartbeat(roomId).catch(() => {}), HEARTBEAT_MS);
}

function startTicker() {
  clearInterval(tickTimer);
  tickTimer = setInterval(() => {
    if (!appState.room) return;
    if (enteredCourtroom) renderCourtParticipants(appState.participants, appState.room.roles_config);
    else renderLobby({ room: appState.room, participants: appState.participants, me: appState.me });
  }, 5000);
}

function startTypingSweep() {
  clearInterval(typingSweepTimer);
  typingSweepTimer = setInterval(renderTypingIndicator, 1000);
}

function teardownRoom() {
  clearInterval(heartbeatTimer);
  clearInterval(tickTimer);
  clearInterval(typingSweepTimer);
  typingUsers.clear();
  setTypingIndicator([]);
  if (channel) supabase.removeChannel(channel);
  channel = null;
  if (typingChannel) supabase.removeChannel(typingChannel);
  typingChannel = null;
  appState.room = null;
  appState.me = null;
  appState.participants = [];
  appState.messages = [];
  enteredCourtroom = false;
}

document.getElementById('form-create').addEventListener('submit', async (e) => {
  e.preventDefault();
  showLandingError('');
  const topic = document.getElementById('input-topic').value.trim();
  const password = document.getElementById('input-create-password').value;
  if (!topic || !password) return;
  const rolesConfig = collectRolesConfig();
  try {
    const room = await roomApi.createRoom({ topic, password, rolesConfig });
    await enterRoomFlow(room, true);
  } catch (err) {
    console.error(err);
    showLandingError('部屋の作成に失敗しました: ' + err.message);
  }
});

document.getElementById('form-join').addEventListener('submit', async (e) => {
  e.preventDefault();
  showLandingError('');
  const code = document.getElementById('input-join-code').value.trim().toUpperCase();
  const password = document.getElementById('input-join-password').value;
  try {
    const room = await roomApi.findRoomByCode(code);
    if (!room) return showLandingError('その部屋コードは見つかりません。');
    const ok = await roomApi.verifyRoomPassword(room, password);
    if (!ok) return showLandingError('パスワードが違います。');
    await enterRoomFlow(room, false);
  } catch (err) {
    console.error(err);
    showLandingError('入室に失敗しました: ' + err.message);
  }
});

document.getElementById('btn-leave-lobby').addEventListener('click', () => {
  teardownRoom();
  showView('view-landing');
});

document.getElementById('btn-copy-link').addEventListener('click', async () => {
  const url = new URL(location.href);
  url.search = '';
  url.searchParams.set('r', appState.room.room_code);
  try {
    await navigator.clipboard.writeText(url.toString());
    alert('招待リンクをコピーしました');
  } catch {
    prompt('このリンクをコピーしてください', url.toString());
  }
});

// ---------- ロビー操作 ----------
initLobbyHandlers({
  onSelectRole: async (roleKey) => {
    const room = appState.room;
    const nickname =
      document.getElementById('input-nickname').value.trim() ||
      (roleKey === 'audience' ? randomAudienceName() : 'ゲスト');
    try {
      appState.me = await roomApi.upsertParticipant({
        roomId: room.id,
        nickname,
        roleKey,
        isHost: appState.me ? appState.me.is_host : false,
      });
      document.getElementById('input-nickname').value = nickname;
      updateView();
    } catch (err) {
      alert('役職の選択に失敗しました: ' + err.message);
    }
  },
});

document.getElementById('input-nickname').addEventListener('change', async (e) => {
  const me = appState.me;
  if (!me || !me.role_key) return;
  const nickname = e.target.value.trim();
  if (!nickname) return;
  try {
    appState.me = await roomApi.upsertParticipant({
      roomId: appState.room.id,
      nickname,
      roleKey: me.role_key,
      isHost: me.is_host,
    });
    updateView();
  } catch (err) {
    console.error(err);
  }
});

document.getElementById('btn-start-session').addEventListener('click', async () => {
  const room = appState.room;
  try {
    const won = await roomApi.tryOpenRoom(room.id);
    if (!won) return;
    const participants = await roomApi.fetchParticipants(room.id);
    await roomApi.postMessage({ roomId: room.id, kind: 'judge', body: judge.openingMessage(room.topic) });
    await roomApi.postMessage({
      roomId: room.id,
      kind: 'judge',
      body: judge.introduceParticipants(room.roles_config, participants),
    });
    await roomApi.postMessage({ roomId: room.id, kind: 'judge', body: judge.explainProcedure() });
    const turnRoles = room.roles_config.filter((r) => r.key !== 'audience');
    if (turnRoles.length > 0) {
      await roomApi.postMessage({
        roomId: room.id,
        kind: 'judge',
        body: judge.callOnRole(turnRoles[0], participants),
      });
    } else {
      await roomApi.postMessage({ roomId: room.id, kind: 'judge', body: judge.noOneToCall() });
    }
  } catch (err) {
    alert('開廷に失敗しました: ' + err.message);
  }
});

// ---------- 法廷(チャット)操作 ----------
initCourtroomHandlers({
  onSend: async (body) => {
    const me = appState.me;
    if (!me) return;
    try {
      await roomApi.postMessage({ roomId: appState.room.id, roleKey: me.role_key, nickname: me.nickname, body, kind: 'chat' });
    } catch (err) {
      alert('送信に失敗しました: ' + err.message);
    }
  },
  onToggleStar: async (messageId) => {
    try {
      await roomApi.toggleStar(messageId);
    } catch (err) {
      console.error(err);
    }
  },
  onTyping: () => broadcastTyping(false),
  onStopTyping: () => broadcastTyping(true),
  onNextTurn: async () => {
    const room = appState.room;
    const turnRoles = room.roles_config.filter((r) => r.key !== 'audience');
    try {
      const nextIndex = await roomApi.advanceTurn(room);
      if (nextIndex === null) return;
      if (nextIndex < turnRoles.length) {
        await roomApi.postMessage({
          roomId: room.id,
          kind: 'judge',
          body: judge.callOnRole(turnRoles[nextIndex], appState.participants),
        });
      } else {
        await roomApi.postMessage({ roomId: room.id, kind: 'judge', body: judge.callOnFreeDiscussion() });
      }
    } catch (err) {
      console.error(err);
    }
  },
  onConclude: async () => {
    const room = appState.room;
    try {
      const won = await roomApi.tryConcludeRoom(room.id);
      if (!won) return;
      const messages = await roomApi.fetchMessages(room.id);
      await roomApi.postMessage({ roomId: room.id, kind: 'judge', body: judge.buildSummary(room.roles_config, messages) });
    } catch (err) {
      console.error(err);
    }
  },
});

wireCourtroomDom();
buildRoleCatalogRows();
renderCustomRoleList();

// ?r=ROOMCODE で参加タブを開いてコードを自動入力
const params = new URLSearchParams(location.search);
const prefillCode = params.get('r');
if (prefillCode) {
  document.querySelector('.tab-btn[data-tab="join"]').click();
  document.getElementById('input-join-code').value = prefillCode.toUpperCase();
}
