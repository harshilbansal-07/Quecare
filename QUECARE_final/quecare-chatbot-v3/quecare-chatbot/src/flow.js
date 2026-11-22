// flow.js - the conversation state machine.
// handleMessage(phone, text) returns the reply text. It does not send anything,
// so it can be tested without WhatsApp.
//
// States: IDLE, BOOK_ASK_NAME, BOOK_ASK_DOCTOR, CANCEL_CONFIRM
import { parseIntent } from './keywords.js';
import { getSession, setSession, resetSession } from './sessions.js';
import * as core from './core.js';

export const MENU_TEXT =
  'Welcome to QueCare. Reply:\n1 - Book a token\n2 - Check my token status\n3 - Cancel my token\nhelp - Show this menu';
const UNKNOWN_TEXT = 'I did not understand. Type menu to see options.';

const STATUS_LABELS = {
  PENDING_CONFIRMATION: 'Waiting for reception confirmation',
  CONFIRMED: 'Confirmed',
  CALLED: 'Your turn is ready',
  WAITING_LIST: 'On the waiting list (today is full)',
  MISSED: 'Missed - please go to the reception',
  TREATED: 'Visit completed',
  CANCELLED: 'Cancelled',
  REJECTED: 'Request not confirmed',
};

function statusReply(s) {
  const lines = [`Token status: ${STATUS_LABELS[s.status] || s.status}`, `Doctor: ${s.doctor_name}`];
  if (s.queue_label) lines.push(`Queue token: ${s.queue_label}`);
  if (s.queue_position != null) lines.push(`Queue position: ${s.queue_position}`);
  if (s.patients_ahead != null) lines.push(`Patients ahead: ${s.patients_ahead}`);
  if (s.status === 'CONFIRMED' && s.confirm_code) lines.push(`Confirmatory code: ${s.confirm_code}`);
  return lines.join('\n');
}

async function handleIdle(phone, intent) {
  switch (intent) {
    case 'MENU':
    case 'HELP':
      return MENU_TEXT;
    case 'BOOK':
      setSession(phone, 'BOOK_ASK_NAME');
      return 'Please send your full name.';
    case 'STATUS': {
      const res = await core.getStatus(phone);
      if (!res.ok) return res.error;
      if (!res.data.active) return 'You have no active token. Type 1 to book one.';
      return statusReply(res.data);
    }
    case 'CANCEL': {
      const res = await core.getStatus(phone);
      if (!res.ok) return res.error;
      if (!res.data.active) return 'You have no active token, so there is nothing to cancel.';
      const label = res.data.queue_label || 'request (not confirmed yet)';
      setSession(phone, 'CANCEL_CONFIRM');
      return `Are you sure you want to cancel token ${label}? Reply YES or NO.`;
    }
    default:
      return UNKNOWN_TEXT;
  }
}

async function handleAskName(phone, text) {
  const name = text.trim();
  if (name.length < 2) return 'That name is too short. Please send your full name.';
  const res = await core.getDoctors();
  if (!res.ok) {
    resetSession(phone);
    return res.error;
  }
  const doctors = res.data.map((d) => ({ id: d.id, label: `${d.name} (${d.specialty})` }));
  if (doctors.length === 0) {
    resetSession(phone);
    return 'No doctors are available right now. Please contact the reception.';
  }
  setSession(phone, 'BOOK_ASK_DOCTOR', { name: name.slice(0, 60), doctors });
  const list = doctors.map((d, i) => `${i + 1} - ${d.label}`).join('\n');
  return `Which doctor would you like to see?\n${list}`;
}

async function handleAskDoctor(phone, text, session) {
  const { name, doctors } = session.data;
  const trimmed = text.trim();
  const choice = /^\d+$/.test(trimmed) ? Number(trimmed) : 0;
  if (choice < 1 || choice > doctors.length) {
    return `Please reply with a number from 1 to ${doctors.length}, or type menu to start over.`;
  }
  const res = await core.createRequest({ name, phone, doctorId: doctors[choice - 1].id, source: 'whatsapp' });
  resetSession(phone);
  if (!res.ok) return res.error;
  return `Thanks ${name}. Your request has been sent to the reception for confirmation. You will receive your token on WhatsApp once it is confirmed.`;
}

async function handleCancelConfirm(phone, text) {
  const answer = text.trim().toLowerCase();
  if (answer === 'yes') {
    const res = await core.cancelRequest(phone);
    resetSession(phone);
    return res.ok ? res.data.message || 'Your token has been cancelled.' : res.error;
  }
  if (answer === 'no') {
    resetSession(phone);
    return 'Cancel aborted.';
  }
  return 'Please reply YES or NO.';
}

export async function handleMessage(phone, text) {
  const session = getSession(phone);
  const intent = parseIntent(text);

  // Escape hatch: a MENU keyword works in every state.
  if (intent === 'MENU') {
    resetSession(phone);
    return MENU_TEXT;
  }

  switch (session.state) {
    case 'BOOK_ASK_NAME':
      return handleAskName(phone, text);
    case 'BOOK_ASK_DOCTOR':
      return handleAskDoctor(phone, text, session);
    case 'CANCEL_CONFIRM':
      return handleCancelConfirm(phone, text);
    default:
      return handleIdle(phone, intent);
  }
}
