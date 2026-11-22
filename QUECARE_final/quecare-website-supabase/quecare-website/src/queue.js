// queue.js - all token rules live here. It only talks to storage through db.js.
// Every function that reads or writes data is async: call it with `await`.
//
// Two-stage tokens:
//   Stage 1 (request_ref)  Q-000001       created when the patient asks for a token.
//   Stage 2 (queue_label)  CAR-001        created only after reception confirms it.
//                                         Numbered per doctor, per calendar month.
// queue_position is separate: it changes when the queue changes, the label never does.
import crypto from 'node:crypto';
import { insert, update, find, findOne, getById } from './db.js';
import { logAction, recentAudit } from './audit.js';

export const STATUS = {
  WAITING: 'WAITING_LIST',
  PENDING: 'PENDING_CONFIRMATION',
  CONFIRMED: 'CONFIRMED',
  CALLED: 'CALLED',
  MISSED: 'MISSED',
  TREATED: 'TREATED',
  CANCELLED: 'CANCELLED',
  REJECTED: 'REJECTED',
};
// Statuses that keep a phone number busy (one active token per patient).
export const ACTIVE = [STATUS.WAITING, STATUS.PENDING, STATUS.CONFIRMED, STATUS.CALLED, STATUS.MISSED];
// Statuses that occupy a place in a doctor's live queue.
const IN_QUEUE = [STATUS.CONFIRMED, STATUS.CALLED];

export const GRACE_MS = 2 * 60 * 1000; // a called patient has 2 minutes before reception reviews them
export const SNOOZE_MS = 10 * 60 * 1000; // shown to the patient as "snoozed until"
export const APPROACH_AHEAD = 2; // "approaching" means at most 2 patients ahead
export const DEFAULT_CAPACITY = 20;

// The clock can be replaced in tests. Production always uses the real clock.
let clock = () => Date.now();
export function setClock(fn) {
  clock = fn || (() => Date.now());
}
const nowMs = () => clock();
const nowIso = () => new Date(clock()).toISOString();

export class AppError extends Error {
  constructor(message, status = 400, code = null) {
    super(message);
    this.status = status;
    this.code = code;
  }
}

// Strip everything except digits. Used by the website and the chatbot.
export function normalizePhone(phone) {
  return String(phone ?? '').replace(/\D/g, '');
}

// Doctor-specific prefix for queue labels. Known specialties get fixed codes.
const PREFIXES = {
  cardiology: 'CAR',
  orthopedics: 'ORT',
  orthopaedics: 'ORT',
  'general medicine': 'GEN',
};
export function prefixFor(specialty) {
  const key = String(specialty ?? '').trim().toLowerCase();
  if (PREFIXES[key]) return PREFIXES[key];
  return key.replace(/[^a-z]/g, '').slice(0, 3).toUpperCase().padEnd(3, 'X');
}

const dayKey = (ms) => new Date(ms).toDateString();
const monthKey = (ms) => {
  const d = new Date(ms);
  return d.getFullYear() * 12 + d.getMonth();
};
const isToday = (iso) => !!iso && dayKey(Date.parse(iso)) === dayKey(nowMs());
const isThisMonth = (iso) => !!iso && monthKey(Date.parse(iso)) === monthKey(nowMs());

async function mustGetToken(id) {
  const token = await getById('tokens', Number(id));
  if (!token) throw new AppError('Token not found', 404);
  return token;
}

// Bundle a token with its patient and doctor for routes and notifications.
export async function describe(token) {
  return {
    token,
    patient: await getById('patients', token.patient_id),
    doctor: await getById('doctors', token.doctor_id),
  };
}

async function activeTokenOfPatient(patientId) {
  return findOne('tokens', (t) => t.patient_id === patientId && ACTIVE.includes(t.status));
}

async function activeTokenOfPhone(phone) {
  const patient = await findOne('patients', (p) => p.phone === normalizePhone(phone));
  return patient ? activeTokenOfPatient(patient.id) : null;
}

// A doctor's live queue, in position order.
async function queueOf(doctorId) {
  const rows = await find('tokens', (t) => t.doctor_id === doctorId && IN_QUEUE.includes(t.status));
  return rows.sort((a, b) => a.queue_position - b.queue_position);
}

// Keep queue positions contiguous (1, 2, 3...) for one doctor.
async function renumber(doctorId) {
  const queue = await queueOf(doctorId);
  for (let i = 0; i < queue.length; i++) {
    await update('tokens', queue[i].id, { queue_position: i + 1 });
  }
}

async function nextPosition(doctorId) {
  const queue = await queueOf(doctorId);
  return queue.length ? queue[queue.length - 1].queue_position + 1 : 1;
}

async function generateConfirmCode() {
  const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789';
  const active = await find('tokens', (t) => ACTIVE.includes(t.status));
  const used = new Set(active.map((t) => t.confirm_code));
  for (;;) {
    let code = '';
    for (let i = 0; i < 4; i++) code += chars[crypto.randomInt(chars.length)];
    if (!used.has(code)) return code;
  }
}

// ---------- Capacity ----------

const capacityOf = (doctor) => (Number.isInteger(doctor.daily_capacity) ? doctor.daily_capacity : DEFAULT_CAPACITY);

// Slots used today: confirmed today and not cancelled. A cancelled slot becomes free again.
async function slotsUsed(doctorId) {
  const rows = await find(
    'tokens',
    (t) => t.doctor_id === doctorId && isToday(t.confirmed_at) && t.status !== STATUS.CANCELLED
  );
  return rows.length;
}

// Slots promised so far: used slots plus requests still waiting for confirmation.
async function slotsReserved(doctorId) {
  const pending = await find('tokens', (t) => t.doctor_id === doctorId && t.status === STATUS.PENDING);
  return (await slotsUsed(doctorId)) + pending.length;
}

// Stage 2 label: prefix plus a per-doctor, per-month counter over all tokens confirmed this month.
// Cancelled tokens still count, so a label is never reused in the same month.
async function nextLabel(doctor) {
  const rows = await find(
    'tokens',
    (t) => t.doctor_id === doctor.id && !!t.queue_label && isThisMonth(t.confirmed_at)
  );
  return `${prefixFor(doctor.specialty)}-${String(rows.length + 1).padStart(3, '0')}`;
}

// ---------- Stage 1: request ----------

export async function createRequest({ name, phone, doctorId, source }) {
  const cleanName = String(name ?? '').trim();
  const cleanPhone = normalizePhone(phone);
  if (cleanName.length < 2) throw new AppError('Please enter your full name');
  if (cleanPhone.length < 7 || cleanPhone.length > 15) throw new AppError('Please enter a valid phone number');
  const doctor = await getById('doctors', Number(doctorId));
  if (!doctor || !doctor.active) throw new AppError('Please choose a valid doctor');

  let patient = await findOne('patients', (p) => p.phone === cleanPhone);
  if (patient) {
    if (await activeTokenOfPatient(patient.id)) throw new AppError('You already have an active token');
    await update('patients', patient.id, { name: cleanName });
  } else {
    patient = await insert('patients', { phone: cleanPhone, name: cleanName, created_at: nowIso() });
  }

  // When today's capacity is already promised, the request goes to the waiting list instead.
  const full = (await slotsReserved(doctor.id)) >= capacityOf(doctor);
  const created = await insert('tokens', {
    hospital_id: doctor.hospital_id,
    doctor_id: doctor.id,
    patient_id: patient.id,
    request_ref: null,
    status: full ? STATUS.WAITING : STATUS.PENDING,
    queue_label: null,
    queue_position: null,
    confirm_code: null,
    source: source === 'whatsapp' ? 'whatsapp' : 'website',
    emergency: false,
    emergency_at: null,
    snooze_count: 0,
    snoozed_until: null,
    here_at: null,
    present_at: null,
    grace_until: null,
    extra_time_count: 0,
    missed_at: null,
    rejoin_count: 0,
    created_at: nowIso(),
    confirmed_at: null,
    called_at: null,
    closed_at: null,
  });
  const token = await update('tokens', created.id, {
    request_ref: `Q-${String(created.id).padStart(6, '0')}`,
  });
  return describe(token);
}

// Stage 2: reception confirms a request and the queue token is created.
export async function confirmToken(id, { doctorAvailable, patientInside, capacityException = false, actor = 'Reception' } = {}) {
  if (doctorAvailable !== true || patientInside !== true) {
    throw new AppError('Confirm that the doctor is available and the patient is inside the hospital');
  }
  const token = await mustGetToken(id);
  if (token.status !== STATUS.PENDING) throw new AppError('Only pending requests can be confirmed', 409);
  const doctor = await getById('doctors', token.doctor_id);

  const overCapacity = (await slotsUsed(doctor.id)) >= capacityOf(doctor);
  if (overCapacity && capacityException !== true) {
    throw new AppError(
      `${doctor.name} has reached today's capacity of ${capacityOf(doctor)}. Confirm it as a capacity exception to continue.`,
      409,
      'CAPACITY_FULL'
    );
  }

  const label = await nextLabel(doctor);
  const position = await nextPosition(doctor.id);
  const updated = await update('tokens', token.id, {
    status: STATUS.CONFIRMED,
    queue_label: label,
    queue_position: position,
    confirm_code: await generateConfirmCode(),
    confirmed_at: nowIso(),
  });
  if (overCapacity) await logAction(actor, 'capacity_exception', { token: label });
  await logAction(actor, 'confirmed', { token: label });
  return describe(updated);
}

export async function rejectToken(id, { actor = 'Reception' } = {}) {
  const token = await mustGetToken(id);
  if (token.status !== STATUS.PENDING && token.status !== STATUS.WAITING) {
    throw new AppError('Only pending or waiting requests can be rejected', 409);
  }
  const updated = await update('tokens', token.id, { status: STATUS.REJECTED, closed_at: nowIso() });
  await logAction(actor, 'rejected', { request: token.request_ref });
  return describe(updated);
}

// Waiting list -> pending, so reception can confirm it like any other request.
export async function promoteWaiting(id, { actor = 'Reception' } = {}) {
  const token = await mustGetToken(id);
  if (token.status !== STATUS.WAITING) throw new AppError('Only waiting-list requests can be moved forward', 409);
  const updated = await update('tokens', token.id, { status: STATUS.PENDING });
  await logAction(actor, 'waitlist_moved_forward', { request: token.request_ref });
  return describe(updated);
}

// Shared shape for the reception lists.
async function requestRows(status, withSource) {
  const rows = (await find('tokens', (t) => t.status === status)).sort(
    (a, b) => a.created_at.localeCompare(b.created_at) || a.id - b.id
  );
  return Promise.all(
    rows.map(async (t) => {
      const { patient, doctor } = await describe(t);
      const row = {
        id: t.id,
        request_ref: t.request_ref,
        patient_name: patient.name,
        phone: patient.phone,
        doctor_name: doctor.name,
        specialty: doctor.specialty,
        created_at: t.created_at,
      };
      if (withSource) row.source = t.source;
      return row;
    })
  );
}

export async function listPending() {
  return requestRows(STATUS.PENDING, true);
}

export async function listWaitingList() {
  return requestRows(STATUS.WAITING, false);
}

// ---------- Live queue: call, treat, missed turns ----------

// Flagged = called, not yet marked present, and the grace period has passed.
// Flags never remove anyone: only reception decides what happens next.
export function isFlagged(t) {
  return t.status === STATUS.CALLED && !t.present_at && !!t.grace_until && nowMs() > Date.parse(t.grace_until);
}

export async function callToken(doctorId, id, actor = 'Doctor') {
  const token = await mustGetToken(id);
  if (token.doctor_id !== doctorId) throw new AppError('This token does not belong to you', 403);
  if (token.status !== STATUS.CONFIRMED) throw new AppError('Only a confirmed token can be called', 409);
  const confirmed = await find('tokens', (t) => t.doctor_id === doctorId && t.status === STATUS.CONFIRMED);
  const lowest = Math.min(...confirmed.map((t) => t.queue_position));
  if (token.queue_position !== lowest) throw new AppError('Only the next patient in the queue can be called', 409);
  const updated = await update('tokens', token.id, {
    status: STATUS.CALLED,
    called_at: nowIso(),
    grace_until: new Date(nowMs() + GRACE_MS).toISOString(),
  });
  await logAction(actor, 'called', { token: token.queue_label });
  return describe(updated);
}

export async function treatToken(doctorId, id, actor = 'Doctor') {
  const token = await mustGetToken(id);
  if (token.doctor_id !== doctorId) throw new AppError('This token does not belong to you', 403);
  if (token.status !== STATUS.CALLED) throw new AppError('Only a called token can be marked as treated', 409);
  const updated = await update('tokens', token.id, { status: STATUS.TREATED, closed_at: nowIso() });
  await renumber(doctorId);
  await logAction(actor, 'completed', { token: token.queue_label });
  return describe(updated);
}

// Reception decisions for a called patient.
export async function markPresent(id, { actor = 'Reception' } = {}) {
  const token = await mustGetToken(id);
  if (token.status !== STATUS.CALLED) throw new AppError('Only a called patient can be marked present', 409);
  const updated = await update('tokens', token.id, { present_at: nowIso(), grace_until: null });
  await logAction(actor, 'marked_present', { token: token.queue_label });
  return describe(updated);
}

export async function extraTime(id, { actor = 'Reception' } = {}) {
  const token = await mustGetToken(id);
  if (token.status !== STATUS.CALLED || token.present_at) {
    throw new AppError('Extra time can only be given to a called patient who has not arrived', 409);
  }
  const updated = await update('tokens', token.id, {
    grace_until: new Date(nowMs() + GRACE_MS).toISOString(),
    extra_time_count: (token.extra_time_count || 0) + 1,
  });
  await logAction(actor, 'extra_time', { token: token.queue_label });
  return describe(updated);
}

// Only after the grace period has passed. The token leaves the queue but keeps its label.
export async function markAbsent(id, { actor = 'Reception' } = {}) {
  const token = await mustGetToken(id);
  if (token.status !== STATUS.CALLED || token.present_at) {
    throw new AppError('Only a called patient who has not arrived can be marked absent', 409);
  }
  if (!isFlagged(token)) throw new AppError('Wait until the 2 minute grace period has passed', 409);
  const updated = await update('tokens', token.id, { status: STATUS.MISSED, missed_at: nowIso(), grace_until: null });
  await renumber(token.doctor_id);
  await logAction(actor, 'marked_absent', { token: token.queue_label });
  return describe(updated);
}

// A missed patient rejoins at the end of the queue. A completed visit can never rejoin.
export async function rejoin(id, { actor = 'Reception' } = {}) {
  const token = await mustGetToken(id);
  if (token.status === STATUS.TREATED) throw new AppError('A completed visit cannot rejoin the queue', 409);
  if (token.status !== STATUS.MISSED) throw new AppError('Only a missed patient can rejoin the queue', 409);
  const updated = await update('tokens', token.id, {
    status: STATUS.CONFIRMED,
    queue_position: await nextPosition(token.doctor_id),
    called_at: null,
    grace_until: null,
    present_at: null,
    missed_at: null,
    rejoin_count: (token.rejoin_count || 0) + 1,
  });
  await logAction(actor, 'rejoined_queue', { token: token.queue_label });
  return describe(updated);
}

// Emergency priority: staff only. The token moves in front of every non-emergency patient
// still waiting (behind a patient who is already called). Token label stays the same.
export async function setEmergencyPriority(id, { actor = 'Reception' } = {}) {
  const token = await mustGetToken(id);
  if (token.status !== STATUS.CONFIRMED) throw new AppError('Only a confirmed patient can be given emergency priority', 409);
  if (token.emergency) throw new AppError('This token already has emergency priority', 409);

  const others = (await queueOf(token.doctor_id)).filter((t) => t.id !== token.id);
  let index = others.findIndex((t) => t.status === STATUS.CONFIRMED && !t.emergency);
  if (index === -1) index = others.length;
  others.splice(index, 0, token);
  for (let i = 0; i < others.length; i++) {
    await update('tokens', others[i].id, { queue_position: i + 1 });
  }
  await update('tokens', token.id, { emergency: true, emergency_at: nowIso() });

  await logAction(actor, 'emergency_priority', { token: token.queue_label });
  return describe(await getById('tokens', token.id));
}

// ---------- Snooze & Swap ----------

// Returns the reason a snooze is not allowed, or null when it is allowed.
async function snoozeProblem(token) {
  if (token.status !== STATUS.CONFIRMED) return 'Snooze is only possible before the doctor calls you';
  if (token.emergency) return 'Emergency cases cannot be snoozed';
  if ((token.snooze_count || 0) >= 1) return 'You have already used your snooze for this visit';
  // Snooze is offered only when one or two patients are ahead. Someone who is next gains nothing from it.
  const ahead = await patientsAhead(token);
  if (ahead < 1 || ahead > APPROACH_AHEAD) return 'Snooze becomes available when one or two patients are ahead of you';
  const partner = await partnerBehind(token);
  if (!partner) return 'There is no one behind you to swap with';
  if (partner.emergency) return 'You cannot swap with an emergency case';
  return null;
}

async function patientsAhead(token) {
  const queue = await queueOf(token.doctor_id);
  return queue.filter((t) => t.queue_position < token.queue_position).length;
}

// Only the next patient in the same doctor's queue can be swapped with.
async function partnerBehind(token) {
  const queue = await queueOf(token.doctor_id);
  return queue.find((t) => t.queue_position === token.queue_position + 1 && t.status === STATUS.CONFIRMED) || null;
}

// The patient moves back one place and the patient behind moves forward one place.
// Token labels never change. The snooze can be used once per visit.
export async function snoozeByPhone(phone) {
  const token = await activeTokenOfPhone(phone);
  if (!token) throw new AppError('You have no active token', 404);
  const problem = await snoozeProblem(token);
  if (problem) throw new AppError(problem, 409);

  const partner = await partnerBehind(token);
  const myPosition = token.queue_position;
  const movedPartner = await update('tokens', partner.id, { queue_position: myPosition });
  const updated = await update('tokens', token.id, {
    queue_position: myPosition + 1,
    snooze_count: (token.snooze_count || 0) + 1,
    snoozed_until: new Date(nowMs() + SNOOZE_MS).toISOString(),
  });
  await logAction('Patient', 'snooze_swap', { token: token.queue_label, swapped_with: partner.queue_label });
  return { token: updated, partner: await describe(movedPartner) };
}

// "I'm here": tells reception the patient has arrived. It does not clear a flag by itself.
export async function hereByPhone(phone) {
  const token = await activeTokenOfPhone(phone);
  if (!token) throw new AppError('You have no active token', 404);
  if (!IN_QUEUE.includes(token.status)) throw new AppError('You can only confirm you are here when you are in the queue', 409);
  if (!token.here_at) {
    await update('tokens', token.id, { here_at: nowIso() });
    await logAction('Patient', 'patient_here', { token: token.queue_label });
  }
  return getStatus(phone);
}

// ---------- Patient-facing and cancel ----------

export async function cancelByPhone(phone) {
  const token = await activeTokenOfPhone(phone);
  if (!token) throw new AppError('You have no active token to cancel');
  if (token.status === STATUS.CALLED) {
    throw new AppError('Your token has already been called, so it can no longer be cancelled', 409);
  }
  const updated = await update('tokens', token.id, { status: STATUS.CANCELLED, closed_at: nowIso() });
  await renumber(token.doctor_id);
  await logAction('Patient', 'cancelled', { token: token.queue_label || token.request_ref });
  return describe(updated);
}

// Public status lookup by phone number. Never returns names, phone numbers or the confirmatory code.
export async function getStatus(phone) {
  const token = await activeTokenOfPhone(phone);
  if (!token) return { active: false };
  const doctor = await getById('doctors', token.doctor_id);
  const inQueue = IN_QUEUE.includes(token.status);
  const ahead = inQueue ? await patientsAhead(token) : null;
  let waitingIndex = -1;
  if (token.status === STATUS.WAITING) {
    const waiting = await listWaitingList();
    waitingIndex = waiting.findIndex((t) => t.id === token.id);
  }
  const canSnooze = (await snoozeProblem(token)) === null;
  const canHere =
    token.status === STATUS.CALLED || (token.status === STATUS.CONFIRMED && ahead <= APPROACH_AHEAD);
  return {
    active: true,
    request_ref: token.request_ref,
    status: token.status,
    queue_label: token.queue_label,
    queue_position: inQueue ? token.queue_position : null,
    doctor_name: doctor.name,
    patients_ahead: ahead,
    waiting_position: waitingIndex >= 0 ? waitingIndex + 1 : null,
    here: !!token.here_at,
    can_here: canHere && !token.here_at,
    can_snooze: canSnooze,
    snoozed: (token.snooze_count || 0) > 0,
    emergency: !!token.emergency,
  };
}

// ---------- Staff views ----------

// One queue row. Phone numbers are added only for reception, which needs them to contact patients.
async function queueRow(t, nextId, withPhone) {
  const patient = await getById('patients', t.patient_id);
  const row = {
    id: t.id,
    request_ref: t.request_ref,
    status: t.status,
    queue_label: t.queue_label,
    queue_position: t.queue_position,
    patient_name: patient.name,
    emergency: !!t.emergency,
    here: !!t.here_at,
    present: !!t.present_at,
    flagged: isFlagged(t),
    grace_until: t.grace_until,
    can_call: t.id === nextId,
    can_treat: t.status === STATUS.CALLED,
  };
  if (withPhone) row.phone = patient.phone;
  return row;
}

// Doctors see only what they need to run the queue: no phone numbers.
export async function doctorQueue(doctorId) {
  const rows = await queueOf(doctorId);
  const nextId = rows.find((t) => t.status === STATUS.CONFIRMED)?.id ?? null;
  return Promise.all(rows.map((t) => queueRow(t, nextId, false)));
}

export async function doctorCapacity(doctorId) {
  const doctor = await getById('doctors', doctorId);
  return { limit: capacityOf(doctor), used: await slotsUsed(doctorId) };
}

// Everything reception needs in one call.
export async function receptionBoard() {
  const activeDoctors = await find('doctors', (d) => d.active);
  const doctors = [];
  for (const d of activeDoctors) {
    const rows = await queueOf(d.id);
    const nextId = rows.find((t) => t.status === STATUS.CONFIRMED)?.id ?? null;
    doctors.push({
      id: d.id,
      name: d.name,
      specialty: d.specialty,
      capacity: capacityOf(d),
      used: await slotsUsed(d.id),
      queue: await Promise.all(rows.map((t) => queueRow(t, nextId, true))),
    });
  }
  const missedTokens = (await find('tokens', (t) => t.status === STATUS.MISSED)).sort((a, b) =>
    (a.missed_at || '').localeCompare(b.missed_at || '')
  );
  return {
    pending: await listPending(),
    waiting: await listWaitingList(),
    doctors,
    missed: await Promise.all(missedTokens.map((t) => queueRow(t, null, true))),
    audit: await recentAudit(30),
  };
}
