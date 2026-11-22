// sessions.js - in-memory conversation state per phone number.
// PLACEHOLDER for a Supabase `chat_sessions` table (phone, state, data, updated_at).
// Sessions are lost when the chatbot restarts; everyone simply starts in IDLE.

const sessions = new Map();

export function getSession(phone) {
  if (!sessions.has(phone)) sessions.set(phone, { state: 'IDLE', data: {} });
  return sessions.get(phone);
}

export function setSession(phone, state, data = {}) {
  sessions.set(phone, { state, data });
}

export function resetSession(phone) {
  sessions.set(phone, { state: 'IDLE', data: {} });
}

export function clearAllSessions() {
  sessions.clear();
}
