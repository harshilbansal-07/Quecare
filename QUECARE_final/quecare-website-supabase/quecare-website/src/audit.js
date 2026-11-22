// audit.js - append-only record of staff and queue actions.
// Never put passwords, session data or patient personal details in here.
// Only token labels, action names and the actor's role/name go in.
import { insert, recentRows } from './db.js';

export async function logAction(actor, action, detail = {}) {
  return insert('audit_logs', { at: new Date().toISOString(), actor: String(actor), action, detail });
}

// Most recent entries first.
export async function recentAudit(limit = 30) {
  return recentRows('audit_logs', limit);
}
