import { Router } from 'express';
import { find } from '../db.js';
import { checkLogin, requireRole, hasInternalSecret } from '../auth.js';
import { rateLimit } from '../ratelimit.js';
import {
  AppError,
  createRequest,
  confirmToken,
  rejectToken,
  promoteWaiting,
  callToken,
  treatToken,
  markPresent,
  extraTime,
  markAbsent,
  rejoin,
  setEmergencyPriority,
  cancelByPhone,
  snoozeByPhone,
  hereByPhone,
  getStatus,
  doctorQueue,
  doctorCapacity,
  receptionBoard,
  STATUS,
} from '../queue.js';
import { notifyPatient, messages } from '../notify.js';

export const apiRouter = Router();

// Small wrapper so thrown AppErrors become JSON error responses.
const handle = (fn) => async (req, res) => {
  try {
    await fn(req, res);
  } catch (err) {
    if (err instanceof AppError) {
      return res.status(err.status).json({ error: err.message, ...(err.code ? { code: err.code } : {}) });
    }
    console.error('[api] unexpected error:', err);
    res.status(500).json({ error: 'Something went wrong. Please try again.' });
  }
};

// Who did it, for the audit log. Only the role and display name, never credentials.
const staffActor = (req) => req.session.user.name;

// Rate limits for public routes. Keyed by IP address.
const limitRequests = rateLimit({ windowMs: 10 * 60 * 1000, max: 20 });
const limitLookup = rateLimit({ windowMs: 60 * 1000, max: 30 });
const limitPatientAction = rateLimit({ windowMs: 60 * 1000, max: 15 });
const limitLogin = rateLimit({ windowMs: 15 * 60 * 1000, max: 10 });

const phoneOf = (value) => (typeof value === 'string' || typeof value === 'number' ? String(value) : '');

// ---------- Public / patient ----------

apiRouter.get(
  '/doctors',
  handle(async (req, res) => {
    const doctors = (await find('doctors', (d) => d.active)).map(({ id, name, specialty }) => ({ id, name, specialty }));
    res.json(doctors);
  })
);

apiRouter.post(
  '/requests',
  limitRequests,
  handle(async (req, res) => {
    const { name, phone, doctorId, source } = req.body || {};
    // Only the chatbot may claim source "whatsapp" (it proves itself with the secret header).
    let realSource = 'website';
    if (source === 'whatsapp') {
      if (!hasInternalSecret(req)) throw new AppError('Not allowed', 401);
      realSource = 'whatsapp';
    }
    const { token, patient, doctor } = await createRequest({ name, phone, doctorId, source: realSource });
    const waitlisted = token.status === STATUS.WAITING;
    await notifyPatient(patient.phone, waitlisted ? messages.waitlisted(doctor) : messages.requested(token));
    res.status(201).json({
      id: token.id,
      request_ref: token.request_ref,
      status: token.status,
    });
  })
);

apiRouter.get(
  '/status',
  limitLookup,
  handle(async (req, res) => {
    res.json(await getStatus(phoneOf(req.query.phone)));
  })
);

apiRouter.post(
  '/requests/cancel',
  limitPatientAction,
  handle(async (req, res) => {
    const { token } = await cancelByPhone(phoneOf(req.body?.phone));
    res.json({ ok: true, status: token.status, message: 'Your token has been cancelled.' });
  })
);

apiRouter.post(
  '/requests/snooze',
  limitPatientAction,
  handle(async (req, res) => {
    const { token, partner } = await snoozeByPhone(phoneOf(req.body?.phone));
    // The patient behind moved forward, so tell them.
    await notifyPatient(partner.patient.phone, messages.moved(partner.token));
    res.json({
      ok: true,
      message: 'You have moved back one place. The patient behind you has moved forward.',
      queue_position: token.queue_position,
    });
  })
);

apiRouter.post(
  '/requests/here',
  limitPatientAction,
  handle(async (req, res) => {
    const status = await hereByPhone(phoneOf(req.body?.phone));
    res.json({ ok: true, status });
  })
);

// ---------- Auth ----------

apiRouter.post(
  '/auth/login',
  limitLogin,
  handle(async (req, res) => {
    const user = await checkLogin(req.body?.email, req.body?.password);
    if (!user) throw new AppError('Wrong email or password', 401);
    // New session id on login (prevents session fixation).
    req.session.regenerate((err) => {
      if (err) return res.status(500).json({ error: 'Could not start a session' });
      req.session.user = user;
      req.session.save(() => res.json({ role: user.role, name: user.name }));
    });
  })
);

apiRouter.post('/auth/logout', (req, res) => {
  req.session.destroy(() => {
    res.clearCookie('connect.sid');
    res.json({ ok: true });
  });
});

apiRouter.get('/auth/me', (req, res) => {
  const user = req.session?.user;
  if (!user) return res.status(401).json({ error: 'Not logged in' });
  res.json({ role: user.role, name: user.name });
});

// ---------- Receptionist ----------

apiRouter.get(
  '/reception/board',
  requireRole('receptionist'),
  handle(async (req, res) => {
    res.json(await receptionBoard());
  })
);

apiRouter.post(
  '/reception/requests/:id/confirm',
  requireRole('receptionist'),
  handle(async (req, res) => {
    const { token, patient } = await confirmToken(req.params.id, {
      doctorAvailable: req.body?.doctorAvailable,
      patientInside: req.body?.patientInside,
      capacityException: req.body?.capacityException === true,
      actor: staffActor(req),
    });
    await notifyPatient(patient.phone, messages.confirmed(token));
    res.json({
      ok: true,
      request_ref: token.request_ref,
      queue_label: token.queue_label,
      queue_position: token.queue_position,
      confirm_code: token.confirm_code,
    });
  })
);

apiRouter.post(
  '/reception/requests/:id/reject',
  requireRole('receptionist'),
  handle(async (req, res) => {
    const { patient } = await rejectToken(req.params.id, { actor: staffActor(req) });
    // req.body.reason is accepted but only logged (the patient message is fixed).
    if (req.body?.reason) console.log(`[reception] rejected token ${req.params.id}: ${req.body.reason}`);
    await notifyPatient(patient.phone, messages.rejected());
    res.json({ ok: true });
  })
);

apiRouter.post(
  '/reception/requests/:id/promote',
  requireRole('receptionist'),
  handle(async (req, res) => {
    await promoteWaiting(req.params.id, { actor: staffActor(req) });
    res.json({ ok: true });
  })
);

apiRouter.post(
  '/reception/tokens/:id/present',
  requireRole('receptionist'),
  handle(async (req, res) => {
    await markPresent(req.params.id, { actor: staffActor(req) });
    res.json({ ok: true });
  })
);

apiRouter.post(
  '/reception/tokens/:id/extra-time',
  requireRole('receptionist'),
  handle(async (req, res) => {
    await extraTime(req.params.id, { actor: staffActor(req) });
    res.json({ ok: true });
  })
);

apiRouter.post(
  '/reception/tokens/:id/absent',
  requireRole('receptionist'),
  handle(async (req, res) => {
    const { patient } = await markAbsent(req.params.id, { actor: staffActor(req) });
    await notifyPatient(patient.phone, messages.absent());
    res.json({ ok: true });
  })
);

apiRouter.post(
  '/reception/tokens/:id/rejoin',
  requireRole('receptionist'),
  handle(async (req, res) => {
    const { token, patient } = await rejoin(req.params.id, { actor: staffActor(req) });
    await notifyPatient(patient.phone, messages.rejoined(token));
    res.json({ ok: true, queue_position: token.queue_position });
  })
);

apiRouter.post(
  '/reception/tokens/:id/emergency',
  requireRole('receptionist'),
  handle(async (req, res) => {
    await setEmergencyPriority(req.params.id, { actor: staffActor(req) });
    res.json({ ok: true });
  })
);

// ---------- Doctor (always scoped to the logged-in doctor) ----------

apiRouter.get(
  '/doctor/queue',
  requireRole('doctor'),
  handle(async (req, res) => {
    const doctorId = req.session.user.doctorId;
    res.json({ capacity: await doctorCapacity(doctorId), queue: await doctorQueue(doctorId) });
  })
);

apiRouter.post(
  '/doctor/tokens/:id/call',
  requireRole('doctor'),
  handle(async (req, res) => {
    const { token, patient, doctor } = await callToken(req.session.user.doctorId, req.params.id, staffActor(req));
    await notifyPatient(patient.phone, messages.called(token, doctor));
    res.json({ ok: true, status: token.status });
  })
);

apiRouter.post(
  '/doctor/tokens/:id/treated',
  requireRole('doctor'),
  handle(async (req, res) => {
    const { token } = await treatToken(req.session.user.doctorId, req.params.id, staffActor(req));
    res.json({ ok: true, status: token.status });
  })
);
