import bcrypt from 'bcryptjs';
import { insert, isEmpty } from './db.js';

// Runs on server start. Only seeds when the store is empty.
export async function seedIfEmpty() {
  if (!(await isEmpty())) return false;

  const hospital = await insert('hospitals', { name: 'QueCare Demo Hospital' });

  const rao = await insert('doctors', {
    hospital_id: hospital.id,
    name: 'Dr. Asha Rao',
    specialty: 'Cardiology',
    active: true,
    daily_capacity: 20,
  });
  const mehta = await insert('doctors', {
    hospital_id: hospital.id,
    name: 'Dr. Vikram Mehta',
    specialty: 'General Medicine',
    active: true,
    daily_capacity: 25,
  });
  const iyer = await insert('doctors', {
    hospital_id: hospital.id,
    name: 'Dr. Neha Iyer',
    specialty: 'Orthopedics',
    active: true,
    daily_capacity: 15,
  });

  const staff = [
    ['receptionist@quecare.local', 'reception123', 'receptionist', null],
    ['doctor.rao@quecare.local', 'doctor123', 'doctor', rao.id],
    ['doctor.mehta@quecare.local', 'doctor123', 'doctor', mehta.id],
    ['doctor.iyer@quecare.local', 'doctor123', 'doctor', iyer.id],
  ];
  for (const [email, password, role, doctorId] of staff) {
    await insert('staff_users', {
      hospital_id: hospital.id,
      email,
      password_hash: bcrypt.hashSync(password, 10),
      role,
      doctor_id: doctorId,
    });
  }
  console.log('[seed] Seeded hospital, 3 doctors and 4 staff users');
  return true;
}
