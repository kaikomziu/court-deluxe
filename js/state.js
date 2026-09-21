export function getClientId() {
  let id = localStorage.getItem('court_client_id');
  if (!id) {
    id = crypto.randomUUID();
    localStorage.setItem('court_client_id', id);
  }
  return id;
}

export async function sha256Hex(text) {
  const buf = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(text));
  return Array.from(new Uint8Array(buf)).map((b) => b.toString(16).padStart(2, '0')).join('');
}

export function randomRoomCode() {
  const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  let code = '';
  for (let i = 0; i < 6; i++) code += chars[Math.floor(Math.random() * chars.length)];
  return code;
}

export function randomAudienceName() {
  return '傍聴人' + Math.floor(100 + Math.random() * 900);
}

export const appState = {
  room: null, // court_rooms row
  me: null, // court_participants row (self)
  participants: [],
  messages: [],
};
