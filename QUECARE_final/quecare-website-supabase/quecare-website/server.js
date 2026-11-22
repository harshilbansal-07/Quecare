import path from 'node:path';
import { fileURLToPath } from 'node:url';
import express from 'express';
import session from 'express-session';
import { seedIfEmpty } from './src/seed.js';
import { apiRouter } from './src/routes/api.js';
import { pageGuard } from './src/auth.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const PORT = Number(process.env.PORT) || 4000;

if (!process.env.SESSION_SECRET || process.env.SESSION_SECRET === 'change-me') {
  console.warn('[warn] SESSION_SECRET is not set or still "change-me". Set a real value in .env.');
}
if (!process.env.INTERNAL_SECRET) {
  console.warn('[warn] INTERNAL_SECRET is not set. The chatbot will not be able to create requests.');
}

try {
  await seedIfEmpty();
} catch (err) {
  console.error(`[startup] Could not reach the database: ${err.message}`);
  console.error('[startup] Check SUPABASE_URL and SUPABASE_SERVICE_KEY in .env, and that the tables exist.');
  process.exit(1);
}

const app = express();
app.disable('x-powered-by');
app.use(express.json({ limit: '10kb' })); // requests are tiny, so refuse large bodies

// Basic security headers: no framing (clickjacking), no MIME sniffing, limited referrers.
app.use((req, res, next) => {
  res.set('X-Frame-Options', 'DENY');
  res.set('X-Content-Type-Options', 'nosniff');
  res.set('Referrer-Policy', 'same-origin');
  next();
});

app.use(
  session({
    secret: process.env.SESSION_SECRET || 'dev-only-secret',
    resave: false,
    saveUninitialized: false,
    // Cookie is only sent over HTTPS when NODE_ENV=production (so local http:// still works).
    cookie: {
      httpOnly: true,
      sameSite: 'lax',
      secure: process.env.NODE_ENV === 'production',
      maxAge: 4 * 60 * 60 * 1000, // 4 hours
    },
  })
);

app.use('/api', apiRouter);

// Staff pages: redirect to the login page when not logged in with the right role.
app.use('/reception', pageGuard('receptionist'));
app.use('/doctor', pageGuard('doctor'));

app.use(express.static(path.join(__dirname, 'public')));

app.listen(PORT, () => {
  console.log(`QueCare website running at http://localhost:${PORT}`);
});
