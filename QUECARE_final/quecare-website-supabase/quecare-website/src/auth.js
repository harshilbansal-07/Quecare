import bcrypt from 'bcryptjs';
import { findOne, getById } from './db.js';

// Returns the session user object, or null when the credentials are wrong.
export async function checkLogin(email, password) {
  const user = await findOne('staff_users', (u) => u.email === String(email ?? '').trim().toLowerCase());
  if (!user || !bcrypt.compareSync(String(password ?? ''), user.password_hash)) return null;
  const doctor = user.doctor_id ? await getById('doctors', user.doctor_id) : null;
  return {
    id: user.id,
    role: user.role,
    doctorId: user.doctor_id,
    hospitalId: user.hospital_id,
    name: doctor ? doctor.name : 'Receptionist',
  };
}

// API guard: 401 when not logged in, 403 when logged in with the wrong role.
export function requireRole(role) {
  return (req, res, next) => {
    const user = req.session?.user;
    if (!user) return res.status(401).json({ error: 'Please log in' });
    if (user.role !== role) return res.status(403).json({ error: 'You are not allowed to do this' });
    next();
  };
}

// Page guard: redirect to the login page when the role does not match.
export function pageGuard(role) {
  return (req, res, next) => {
    if (req.session?.user?.role === role) return next();
    res.redirect('/login.html');
  };
}

// The chatbot proves it is the chatbot with this header.
export function hasInternalSecret(req) {
  const expected = process.env.INTERNAL_SECRET;
  return !!expected && req.get('x-internal-secret') === expected;
}
