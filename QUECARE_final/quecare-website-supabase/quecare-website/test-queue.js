// Tests the queue rules directly (no HTTP server, no database needed).
// Uses the in-memory store (QUECARE_FORCE_MEMORY), so it never touches Supabase.
// Time is controlled by a fake clock, so the 2 minute grace and monthly reset can be tested instantly.
// Run with: npm test
process.env.QUECARE_FORCE_MEMORY = '1';

import assert from 'node:assert/strict';
import { insert, update, getById, find, resetAll } from './src/db.js';
import {
  setClock, createRequest, confirmToken, rejectToken, promoteWaiting, callToken, treatToken,
  markPresent, extraTime, markAbsent, rejoin, setEmergencyPriority, cancelByPhone,
  snoozeByPhone, hereByPhone, getStatus, doctorQueue, doctorCapacity, receptionBoard,
  listWaitingList, normalizePhone, prefixFor, AppError,
} from './src/queue.js';
import { recentAudit } from './src/audit.js';

const MIN = 60 * 1000;
let now = 0;
const advance = (ms) => { now += ms; };
const baseTime = () => new Date(2026, 10, 22, 10, 0, 0).getTime(); // 22 Nov 2026, 10:00 local
setClock(() => now);

// Fresh hospital and doctors for every test, starting at the same fake time.
async function setup() {
  resetAll();
  now = baseTime();
  const hospital = await insert('hospitals', { name: 'Test Hospital' });
  const make = (name, specialty, cap) =>
    insert('doctors', { hospital_id: hospital.id, name, specialty, active: true, daily_capacity: cap });
  return {
    rao: await make('Dr. Asha Rao', 'Cardiology', 20),
    mehta: await make('Dr. Vikram Mehta', 'General Medicine', 20),
    iyer: await make('Dr. Neha Iyer', 'Orthopedics', 20),
  };
}

const phone = (n) => `9190000${String(n).padStart(5, '0')}`; // 12 digits
const BOTH = { doctorAvailable: true, patientInside: true };
let passed = 0;
async function test(name, fn) {
  await fn();
  passed++;
  console.log(`ok - ${name}`);
}
async function throwsApp(fn, text, code) {
  await assert.rejects(fn, (e) => e instanceof AppError && e.message.includes(text) && (code === undefined || e.code === code));
}
async function book(n, name, doc) {
  return (await createRequest({ name, phone: phone(n), doctorId: doc.id, source: 'website' })).token;
}
async function confirm(token, opts = BOTH) {
  return (await confirmToken(token.id, opts)).token;
}
async function bookConfirm(n, name, doc) {
  return confirm(await book(n, name, doc));
}

// ---------- Basics ----------

await test('phone normalization keeps digits only', async () => {
  await setup();
  assert.equal(normalizePhone('+91 (98765) 43-210'), '919876543210');
});

await test('specialty prefixes match the spec examples', async () => {
  assert.equal(prefixFor('Cardiology'), 'CAR');
  assert.equal(prefixFor('Orthopedics'), 'ORT');
  assert.equal(prefixFor('General Medicine'), 'GEN');
  assert.equal(prefixFor('Neurology'), 'NEU');
});

await test('stage 1: a request gets a Q reference and stays pending', async () => {
  await setup();
  const { token } = await createRequest({ name: 'Anita', phone: phone(1), doctorId: 1, source: 'website' });
  assert.equal(token.status, 'PENDING_CONFIRMATION');
  assert.equal(token.request_ref, 'Q-000001');
  assert.equal(token.queue_label, null); // no queue token before approval
  assert.equal(token.snooze_count, 0);
});

await test('stage 2: confirmation creates a doctor token and keeps the request reference', async () => {
  const { rao } = await setup();
  const token = await book(1, 'Anita', rao);
  const confirmed = await confirm(token);
  assert.equal(confirmed.status, 'CONFIRMED');
  assert.equal(confirmed.queue_label, 'CAR-001');
  assert.equal(confirmed.queue_position, 1);
  assert.equal(confirmed.request_ref, 'Q-000001');
  assert.match(confirmed.confirm_code, /^[A-Z0-9]{4}$/);
  await throwsApp(() => confirmToken(token.id, BOTH), 'Only pending');
});

await test('same phone cannot have a second active token', async () => {
  const { rao, mehta } = await setup();
  await book(1, 'Anita', rao);
  await throwsApp(
    () => createRequest({ name: 'Anita', phone: phone(1), doctorId: mehta.id }),
    'already have an active token'
  );
});

await test('confirm needs both checks to be true', async () => {
  const { rao } = await setup();
  const token = await book(1, 'Anita', rao);
  await throwsApp(() => confirmToken(token.id, { doctorAvailable: true, patientInside: false }), 'Confirm that');
  await throwsApp(() => confirmToken(token.id, {}), 'Confirm that');
});

await test('labels and positions are per doctor', async () => {
  const { rao, mehta, iyer } = await setup();
  const a = await bookConfirm(1, 'Ann', rao);
  const b = await bookConfirm(2, 'Bala', rao);
  const g = await bookConfirm(3, 'Gita', mehta);
  const o = await bookConfirm(4, 'Om', iyer);
  assert.equal(a.queue_label, 'CAR-001');
  assert.equal(b.queue_label, 'CAR-002');
  assert.equal(b.queue_position, 2);
  assert.equal(g.queue_label, 'GEN-001');
  assert.equal(g.queue_position, 1);
  assert.equal(o.queue_label, 'ORT-001');
});

await test('confirmation codes are unique among active tokens', async () => {
  const { rao } = await setup();
  const codes = [];
  for (const n of [1, 2, 3, 4]) codes.push((await bookConfirm(n, `P${n}`, rao)).confirm_code);
  assert.equal(new Set(codes).size, codes.length);
});

await test('doctor queue is scoped to that doctor, ordered and has no phone numbers', async () => {
  const { rao, mehta } = await setup();
  await bookConfirm(1, 'Ann', rao);
  await bookConfirm(2, 'Bala', rao);
  await bookConfirm(3, 'Gita', mehta);
  const q = await doctorQueue(rao.id);
  assert.deepEqual(q.map((t) => t.queue_label), ['CAR-001', 'CAR-002']);
  assert.equal(q.filter((t) => t.can_call).length, 1);
  assert.equal(q[0].can_call, true);
  assert.equal((await doctorQueue(mehta.id)).length, 1);
  assert.ok(q.every((row) => !('phone' in row)));
});

await test('call only works on the lowest position and only for the owning doctor', async () => {
  const { rao, mehta } = await setup();
  const a = await bookConfirm(1, 'Ann', rao);
  const b = await bookConfirm(2, 'Bala', rao);
  const g = await bookConfirm(3, 'Gita', mehta);
  await throwsApp(() => callToken(rao.id, b.id), 'next patient');
  await throwsApp(() => callToken(rao.id, g.id), 'does not belong');
  const { token } = await callToken(rao.id, a.id);
  assert.equal(token.status, 'CALLED');
  assert.ok(token.called_at);
  assert.ok(token.grace_until);
});

await test('public status shows position and patients ahead, but no name, phone or code', async () => {
  const { rao } = await setup();
  await bookConfirm(1, 'Ann', rao);
  await bookConfirm(2, 'Bala', rao);
  const c = await bookConfirm(3, 'Chitra', rao);
  const s = await getStatus(phone(3));
  assert.equal(s.status, 'CONFIRMED');
  assert.equal(s.queue_label, c.queue_label);
  assert.equal(s.queue_position, 3);
  assert.equal(s.patients_ahead, 2);
  assert.equal(s.request_ref, 'Q-000003');
  for (const forbidden of ['confirm_code', 'patient_name', 'phone', 'name']) assert.equal(forbidden in s, false);
  assert.deepEqual(await getStatus('910000000000'), { active: false });
});

await test('treated closes the token and renumbers the queue', async () => {
  const { rao } = await setup();
  const a = await bookConfirm(1, 'Ann', rao);
  const b = await bookConfirm(2, 'Bala', rao);
  await callToken(rao.id, a.id);
  await throwsApp(() => treatToken(rao.id, b.id), 'Only a called token');
  await treatToken(rao.id, a.id);
  assert.equal((await getById('tokens', a.id)).status, 'TREATED');
  assert.ok((await getById('tokens', a.id)).closed_at);
  const q = await doctorQueue(rao.id);
  assert.deepEqual(q.map((t) => t.queue_position), [1]);
  assert.equal(q[0].queue_label, 'CAR-002'); // labels never change
});

await test('cancel renumbers, frees the phone and frees a capacity slot', async () => {
  const { rao } = await setup();
  const a = await bookConfirm(1, 'Ann', rao);
  const b = await bookConfirm(2, 'Bala', rao);
  const c = await bookConfirm(3, 'Chitra', rao);
  await cancelByPhone(phone(2));
  assert.equal((await getById('tokens', b.id)).status, 'CANCELLED');
  assert.equal((await getById('tokens', c.id)).queue_position, 2);
  assert.equal((await doctorCapacity(rao.id)).used, 2);
  const again = await createRequest({ name: 'Bala', phone: phone(2), doctorId: rao.id });
  assert.equal(again.token.status, 'PENDING_CONFIRMATION');
  assert.equal(a.queue_position, 1);
});

await test('reject works only on pending or waiting requests and is logged', async () => {
  const { mehta } = await setup();
  const token = await book(9, 'Rejected One', mehta);
  assert.equal((await rejectToken(token.id)).token.status, 'REJECTED');
  await throwsApp(() => rejectToken(token.id), 'Only pending');
  assert.deepEqual(await getStatus(phone(9)), { active: false });
  assert.ok((await recentAudit(50)).some((a) => a.action === 'rejected'));
});

await test('validation errors', async () => {
  const { rao } = await setup();
  await throwsApp(() => createRequest({ name: 'A', phone: phone(10), doctorId: rao.id }), 'full name');
  await throwsApp(() => createRequest({ name: 'Ok Name', phone: '12', doctorId: rao.id }), 'valid phone');
  await throwsApp(() => createRequest({ name: 'Ok Name', phone: phone(10), doctorId: 999 }), 'valid doctor');
});

await test('"I\'m here" is allowed when approaching and recorded for reception', async () => {
  const { rao } = await setup();
  for (let n = 1; n <= 4; n++) await bookConfirm(n, `P${n}`, rao);
  assert.equal((await getStatus(phone(4))).can_here, false); // 3 ahead, not close yet
  assert.equal((await getStatus(phone(3))).can_here, true); // 2 ahead
  const s = await hereByPhone(phone(3));
  assert.equal(s.here, true);
  assert.equal((await getStatus(phone(3))).can_here, false);
});

// ---------- Snooze & Swap ----------

await test('snooze: only when approaching, swaps with the patient behind and keeps labels', async () => {
  const { rao } = await setup();
  for (let n = 1; n <= 4; n++) await bookConfirm(n, `P${n}`, rao);
  await throwsApp(() => snoozeByPhone(phone(4)), 'one or two patients are ahead'); // 3 ahead
  const { token, partner } = await snoozeByPhone(phone(3)); // 2 ahead
  assert.equal(token.queue_position, 4);
  assert.equal(partner.token.queue_position, 3);
  assert.equal(token.queue_label, 'CAR-003');
  assert.equal(token.snooze_count, 1);
  assert.ok(token.snoozed_until);
});

await test('snooze: one per visit, and never after the doctor calls', async () => {
  const { rao } = await setup();
  const a = await bookConfirm(1, 'Ann', rao);
  for (let n = 2; n <= 4; n++) await bookConfirm(n, `P${n}`, rao);
  await snoozeByPhone(phone(3));
  await throwsApp(() => snoozeByPhone(phone(3)), 'already used your snooze');
  // Patient 2 is now at position 2 with one patient ahead, so they may still use their own snooze.
  await snoozeByPhone(phone(2));
  assert.deepEqual((await doctorQueue(rao.id)).map((t) => t.queue_label), ['CAR-001', 'CAR-004', 'CAR-002', 'CAR-003']);
  await callToken(rao.id, a.id);
  await throwsApp(() => snoozeByPhone(phone(1)), 'before the doctor calls');
});

await test('snooze: not offered to the patient who is next in line', async () => {
  const { rao } = await setup();
  await bookConfirm(1, 'Ann', rao);
  await bookConfirm(2, 'Bala', rao);
  await bookConfirm(3, 'Chitra', rao);
  await throwsApp(() => snoozeByPhone(phone(1)), 'one or two patients are ahead');
  assert.equal((await getStatus(phone(1))).can_snooze, false);
  assert.equal((await getStatus(phone(2))).can_snooze, true); // one ahead, Chitra behind
});

await test('snooze: emergency cases cannot snooze and emergency priority is logged', async () => {
  const { rao } = await setup();
  await bookConfirm(1, 'Ann', rao);
  await bookConfirm(2, 'Bala', rao);
  const c = await bookConfirm(3, 'Chitra', rao);
  const { token } = await setEmergencyPriority(c.id);
  assert.equal(token.emergency, true);
  assert.equal(token.queue_position, 1);
  assert.equal(token.queue_label, 'CAR-003'); // identity unchanged
  await throwsApp(() => setEmergencyPriority(c.id), 'already has emergency priority');
  await throwsApp(() => snoozeByPhone(phone(3)), 'Emergency cases cannot be snoozed');
  assert.ok((await recentAudit(50)).some((a) => a.action === 'emergency_priority'));
});

await test('emergency priority goes after a called patient, not in front of them', async () => {
  const { rao } = await setup();
  const a = await bookConfirm(1, 'Ann', rao);
  await bookConfirm(2, 'Bala', rao);
  const c = await bookConfirm(3, 'Chitra', rao);
  await callToken(rao.id, a.id);
  await setEmergencyPriority(c.id);
  assert.deepEqual((await doctorQueue(rao.id)).map((t) => t.queue_label), ['CAR-001', 'CAR-003', 'CAR-002']);
  await throwsApp(() => setEmergencyPriority(a.id), 'Only a confirmed patient');
});

// ---------- Missed turns ----------

await test('missed turn: flagged only after the 2 minute grace, then reception can mark absent', async () => {
  const { rao } = await setup();
  const x = await bookConfirm(1, 'Xavier', rao);
  const y = await bookConfirm(2, 'Yash', rao);
  await callToken(rao.id, x.id);
  advance(1 * MIN);
  await throwsApp(() => markAbsent(x.id), 'grace period');
  assert.equal((await doctorQueue(rao.id))[0].flagged, false);
  advance(2 * MIN); // 3 minutes since the call
  assert.equal((await doctorQueue(rao.id))[0].flagged, true);
  await markAbsent(x.id);
  assert.equal((await getById('tokens', x.id)).status, 'MISSED');
  assert.equal((await getById('tokens', y.id)).queue_position, 1); // the rest of the queue moves up
  assert.equal((await getStatus(phone(1))).status, 'MISSED');
  assert.equal((await getStatus(phone(1))).can_snooze, false);
  assert.equal((await receptionBoard()).missed.length, 1);
});

await test('missed patient can rejoin at the end with the same token label', async () => {
  const { rao } = await setup();
  const x = await bookConfirm(1, 'Xavier', rao);
  await bookConfirm(2, 'Yash', rao);
  await callToken(rao.id, x.id);
  advance(3 * MIN);
  await markAbsent(x.id);
  await rejoin(x.id);
  const t = await getById('tokens', x.id);
  assert.equal(t.status, 'CONFIRMED');
  assert.equal(t.queue_position, 2);
  assert.equal(t.queue_label, 'CAR-001');
  assert.equal(t.rejoin_count, 1);
});

await test('completed visits cannot rejoin the queue', async () => {
  const { rao } = await setup();
  const y = await bookConfirm(1, 'Yash', rao);
  await callToken(rao.id, y.id);
  await treatToken(rao.id, y.id);
  await throwsApp(() => rejoin(y.id), 'completed visit cannot rejoin');
});

await test('present stops the flag and blocks absent; extra time pushes the grace back', async () => {
  const { rao } = await setup();
  const x = await bookConfirm(1, 'Xavier', rao);
  await callToken(rao.id, x.id);
  await markPresent(x.id);
  advance(5 * MIN);
  assert.equal((await doctorQueue(rao.id))[0].flagged, false);
  await throwsApp(() => markAbsent(x.id), 'has not arrived');
  await throwsApp(() => extraTime(x.id), 'has not arrived');
});

await test('extra time gives another 2 minutes before the flag returns', async () => {
  const { rao } = await setup();
  const x = await bookConfirm(1, 'Xavier', rao);
  await callToken(rao.id, x.id);
  advance(90 * 1000);
  await extraTime(x.id);
  advance(1 * MIN); // 2.5 minutes after the call
  assert.equal((await doctorQueue(rao.id))[0].flagged, false);
  advance(2 * MIN); // 4.5 minutes after the call
  assert.equal((await doctorQueue(rao.id))[0].flagged, true);
});

// ---------- Capacity and waiting list ----------

await test('capacity: full day sends new requests to the waiting list and exceptions are logged', async () => {
  const { rao } = await setup();
  await update('doctors', rao.id, { daily_capacity: 1 });
  const p1 = await book(1, 'P1', rao); // pending, takes the only reserved slot
  const p2 = await book(2, 'P2', rao); // waiting list
  assert.equal(p2.status, 'WAITING_LIST');
  assert.equal((await getStatus(phone(2))).waiting_position, 1);
  assert.equal((await listWaitingList()).length, 1);
  await confirm(p1);
  assert.equal((await doctorCapacity(rao.id)).used, 1);

  await promoteWaiting(p2.id); // reception moves the waiting patient forward
  await throwsApp(() => confirmToken(p2.id, BOTH), 'capacity', 'CAPACITY_FULL');
  const exception = await confirm(p2, { ...BOTH, capacityException: true });
  assert.equal(exception.status, 'CONFIRMED');
  assert.equal(exception.queue_label, 'CAR-002');
  assert.ok((await recentAudit(50)).some((a) => a.action === 'capacity_exception'));
  assert.equal((await doctorCapacity(rao.id)).used, 2);
});

await test('capacity: a waiting-list token cannot be confirmed without moving it forward first', async () => {
  const { rao } = await setup();
  await update('doctors', rao.id, { daily_capacity: 1 });
  await bookConfirm(1, 'P1', rao);
  const w = await book(2, 'P2', rao);
  await throwsApp(() => confirmToken(w.id, BOTH), 'Only pending');
});

// ---------- Monthly token numbering ----------

await test('labels restart each month, and historical tokens remain', async () => {
  const { rao } = await setup();
  const nov1 = await bookConfirm(1, 'Ann', rao);
  const nov2 = await bookConfirm(2, 'Bala', rao);
  assert.equal(nov2.queue_label, 'CAR-002');
  now = new Date(2026, 11, 1, 10, 0, 0).getTime(); // 1 December 2026
  const dec1 = await bookConfirm(3, 'Chitra', rao);
  assert.equal(dec1.queue_label, 'CAR-001');
  assert.equal((await getById('tokens', nov1.id)).queue_label, 'CAR-001'); // still stored
  assert.equal((await getById('tokens', nov2.id)).queue_label, 'CAR-002');
});

await test('a label is not reused within the same month even after cancellation', async () => {
  const { rao } = await setup();
  await bookConfirm(1, 'Ann', rao);
  await bookConfirm(2, 'Bala', rao);
  await cancelByPhone(phone(2));
  const c = await bookConfirm(3, 'Chitra', rao);
  assert.equal(c.queue_label, 'CAR-003');
});

// ---------- Staff board and audit ----------

await test('reception board returns all the sections the dashboard needs', async () => {
  const { rao } = await setup();
  await bookConfirm(1, 'Ann', rao);
  await book(2, 'Pending', rao);
  const board = await receptionBoard();
  for (const key of ['pending', 'waiting', 'doctors', 'missed', 'audit']) assert.ok(key in board, key);
  assert.equal(board.pending.length, 1);
  assert.equal(board.doctors.find((d) => d.id === rao.id).queue.length, 1);
  assert.ok(board.doctors.find((d) => d.id === rao.id).queue[0].phone); // reception sees phone numbers
});

await test('audit log records confirmations and never contains phone numbers', async () => {
  const { rao } = await setup();
  await bookConfirm(1, 'Ann', rao);
  const entries = await recentAudit(50);
  assert.ok(entries.some((e) => e.action === 'confirmed'));
  assert.ok(entries.every((e) => !JSON.stringify(e).includes(phone(1))));
});

// Restore the real clock for anything that runs after the tests.
setClock(null);

console.log(`\n${passed} tests passed`);
