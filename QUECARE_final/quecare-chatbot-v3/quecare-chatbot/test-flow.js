// Feeds messages through the state machine with a FAKE core API (no website,
// no Evolution needed). Run with: npm test
import assert from 'node:assert/strict';
import { parseIntent } from './src/keywords.js';

process.env.CORE_URL = 'http://core.test';
process.env.INTERNAL_SECRET = 'test-secret';

// ---- fake website API, installed in place of fetch ----
const doctors = [
  { id: 1, name: 'Dr. Asha Rao', specialty: 'Cardiology' },
  { id: 2, name: 'Dr. Vikram Mehta', specialty: 'General Medicine' },
];
let activeToken = null;
let down = false;
const calls = [];

globalThis.fetch = async (url, opts = {}) => {
  if (down) throw new Error('connect ECONNREFUSED');
  const path = url.replace(process.env.CORE_URL, '');
  calls.push({ path, method: opts.method, secret: opts.headers?.['x-internal-secret'], body: opts.body && JSON.parse(opts.body) });
  const json = (status, data) => ({ ok: status < 400, status, json: async () => data });
  if (path === '/api/doctors') return json(200, doctors);
  if (path === '/api/requests') {
    if (activeToken) return json(400, { error: 'You already have an active token' });
    activeToken = { status: 'PENDING_CONFIRMATION', doctor_name: 'Dr. Asha Rao' };
    return json(201, { id: 1 });
  }
  if (path.startsWith('/api/status')) return json(200, activeToken ? { active: true, ...activeToken } : { active: false });
  if (path === '/api/requests/cancel') {
    activeToken = null;
    return json(200, { ok: true, message: 'Your token has been cancelled.' });
  }
  return json(404, { error: 'not found' });
};

const { handleMessage } = await import('./src/flow.js');
const P = '919876543210';
const say = async (text) => {
  const reply = await handleMessage(P, text);
  console.log(`  > ${text}\n  < ${reply.replace(/\n/g, '\n    ')}`);
  return reply;
};
let passed = 0;
const ok = (name) => console.log(`ok - ${name}\n`) || passed++;

// keywords
assert.equal(parseIntent('  HeLLo '), 'MENU');
assert.equal(parseIntent('2'), 'STATUS');
assert.equal(parseIntent('Cancel'), 'CANCEL');
assert.equal(parseIntent('help'), 'HELP');
assert.equal(parseIntent('blah'), 'UNKNOWN');
ok('keywords');

assert.match(await say('Hi'), /^Welcome to QueCare\. Reply:\n1 - Book a token/);
ok('greeting shows menu');

assert.equal(await say('banana'), 'I did not understand. Type menu to see options.');
ok('unknown text');

assert.equal(await say('2'), 'You have no active token. Type 1 to book one.');
ok('status with no token');

assert.equal(await say('1'), 'Please send your full name.');
assert.match(await say('A'), /too short/);
const list = await say('Anita Sharma');
assert.equal(list, 'Which doctor would you like to see?\n1 - Dr. Asha Rao (Cardiology)\n2 - Dr. Vikram Mehta (General Medicine)');
assert.match(await say('9'), /number from 1 to 2/);
assert.match(await say('1'), /^Thanks Anita Sharma\. Your request has been sent to the reception/);
const create = calls.find((c) => c.path === '/api/requests');
assert.deepEqual(create.body, { name: 'Anita Sharma', phone: P, doctorId: 1, source: 'whatsapp' });
assert.equal(create.secret, 'test-secret');
ok('full booking flow sends the right request with the secret header');

assert.match(await say('status'), /Waiting for reception confirmation/);
ok('status of pending token');

await say('1');
await say('Anita Sharma');
assert.equal(await say('1'), 'You already have an active token');
ok('second booking shows the core error');

activeToken = { status: 'CONFIRMED', queue_label: 'C-01', queue_position: 2, patients_ahead: 1, confirm_code: 'K7Q2', doctor_name: 'Dr. Asha Rao' };
const s = await say('2');
for (const part of ['Confirmed', 'C-01', 'Queue position: 2', 'Patients ahead: 1', 'K7Q2']) assert.ok(s.includes(part), part);
ok('status of confirmed token shows token, position, ahead and code');

assert.equal(await say('3'), 'Are you sure you want to cancel token C-01? Reply YES or NO.');
assert.equal(await say('maybe'), 'Please reply YES or NO.');
assert.equal(await say('no'), 'Cancel aborted.');
await say('cancel');
assert.equal(await say('YES'), 'Your token has been cancelled.');
assert.equal(activeToken, null);
assert.match(await say('3'), /nothing to cancel/);
ok('cancel flow (no, yes, nothing to cancel)');

await say('1');
await say('menu');
assert.match(await say('2'), /no active token/);
ok('menu keyword resets any state');

down = true;
assert.equal(await say('2'), 'Service is temporarily unavailable. Please try again shortly.');
ok('network failure message');

console.log(`${passed} checks passed`);
