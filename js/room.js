import { supabase } from './supabase-client.js';
import { sha256Hex, randomRoomCode, getClientId } from './state.js';

export async function createRoom({ topic, password, rolesConfig }) {
  const passwordHash = await sha256Hex(password);
  const clientId = getClientId();

  for (let attempt = 0; attempt < 5; attempt++) {
    const roomCode = randomRoomCode();
    const { data, error } = await supabase
      .from('court_rooms')
      .insert({
        room_code: roomCode,
        topic,
        password_hash: passwordHash,
        roles_config: rolesConfig,
        host_client_id: clientId,
      })
      .select()
      .single();

    if (!error) return data;
    if (error.code !== '23505') throw error; // unique_violation以外は即エラー
  }
  throw new Error('部屋コードの発行に失敗しました。もう一度お試しください。');
}

export async function findRoomByCode(roomCode) {
  const { data, error } = await supabase
    .from('court_rooms')
    .select('*')
    .eq('room_code', roomCode.trim().toUpperCase())
    .maybeSingle();
  if (error) throw error;
  return data;
}

export async function verifyRoomPassword(room, password) {
  const hash = await sha256Hex(password);
  return hash === room.password_hash;
}

export async function upsertParticipant({ roomId, nickname, roleKey, isHost }) {
  const clientId = getClientId();
  const { data, error } = await supabase
    .from('court_participants')
    .upsert(
      {
        room_id: roomId,
        client_id: clientId,
        nickname,
        role_key: roleKey,
        is_host: !!isHost,
        last_seen: new Date().toISOString(),
      },
      { onConflict: 'room_id,client_id' }
    )
    .select()
    .single();
  if (error) throw error;
  return data;
}

export async function fetchParticipants(roomId) {
  const { data, error } = await supabase
    .from('court_participants')
    .select('*')
    .eq('room_id', roomId)
    .order('joined_at', { ascending: true });
  if (error) throw error;
  return data;
}

export async function fetchMessages(roomId) {
  const { data, error } = await supabase
    .from('court_messages')
    .select('*')
    .eq('room_id', roomId)
    .order('created_at', { ascending: true });
  if (error) throw error;
  return data;
}

export async function heartbeat(roomId) {
  const clientId = getClientId();
  await supabase
    .from('court_participants')
    .update({ last_seen: new Date().toISOString() })
    .eq('room_id', roomId)
    .eq('client_id', clientId);
}

export async function postMessage({ roomId, roleKey, nickname, body, kind }) {
  const clientId = getClientId();
  const { data, error } = await supabase
    .from('court_messages')
    .insert({
      room_id: roomId,
      client_id: kind === 'chat' ? clientId : null,
      nickname: kind === 'chat' ? nickname : '裁判官',
      role_key: kind === 'chat' ? roleKey : kind === 'judge' ? 'judge' : 'system',
      body,
      kind: kind || 'chat',
    })
    .select()
    .single();
  if (error) throw error;
  return data;
}

export async function toggleStar(messageId) {
  const clientId = getClientId();
  const { data, error } = await supabase.rpc('court_toggle_star', {
    p_message_id: messageId,
    p_client_id: clientId,
  });
  if (error) throw error;
  return data && data[0];
}

export async function tryOpenRoom(roomId) {
  const { data, error } = await supabase.rpc('court_try_open', { p_room_id: roomId });
  if (error) throw error;
  return !!data;
}

export async function tryConcludeRoom(roomId) {
  const { data, error } = await supabase.rpc('court_try_conclude', { p_room_id: roomId });
  if (error) throw error;
  return !!data;
}

export async function advanceTurn(room) {
  const nextIndex = room.turn_index + 1;
  const { data, error } = await supabase
    .from('court_rooms')
    .update({ turn_index: nextIndex })
    .eq('id', room.id)
    .eq('turn_index', room.turn_index)
    .select();
  if (error) throw error;
  return data && data.length > 0 ? nextIndex : null;
}
