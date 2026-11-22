# QueCare Website

Hospital token-queue and appointment web app with three portals: patient, reception and doctor.
Runs locally at http://localhost:4000.

Requires **Node 20.6+** (uses `node --env-file`).

## Run (Windows PowerShell)

```powershell
cd quecare-website
copy .env.example .env     # then edit .env and set real secrets
npm install
npm start
```

Open http://localhost:4000.

`INTERNAL_SECRET` must be the **same value** in this project's `.env` and in the chatbot's `.env`.
Set `NODE_ENV=production` only when serving over HTTPS (it makes the session cookie `secure`).

Run the queue rule tests (no server needed): `npm test`

## Seeded staff logins

| Role | Email | Password |
| --- | --- | --- |
| Receptionist | receptionist@quecare.local | reception123 |
| Doctor (Dr. Asha Rao, Cardiology, capacity 20) | doctor.rao@quecare.local | doctor123 |
| Doctor (Dr. Vikram Mehta, General Medicine, capacity 25) | doctor.mehta@quecare.local | doctor123 |
| Doctor (Dr. Neha Iyer, Orthopedics, capacity 15) | doctor.iyer@quecare.local | doctor123 |

Change these before any real use.

## How a token moves through the system

1. **Request (stage 1).** The patient asks for a token on the website or on WhatsApp. They get a request reference such as `Q-000001`. The request waits as `PENDING_CONFIRMATION`. If the doctor's daily capacity is already promised, the request goes to the `WAITING_LIST` instead.
2. **Confirmation (stage 2).** Reception ticks "Doctor is available" and "Patient is inside the hospital", then confirms. The doctor's queue token is created, such as `CAR-001`, `ORT-001` or `GEN-001`. It gets a queue position and a 4-character confirmatory code. The patient is notified on WhatsApp.
3. **Calling.** The doctor calls the next confirmed patient. The patient has a 2 minute grace period. If they have not arrived after that, the patient is **flagged** for reception. Nobody is removed automatically.
4. **Reception decides.** For a flagged patient, reception can mark them present, give 2 more minutes, or mark them absent. A missed patient can later rejoin at the end of the queue with the same token label. A completed visit can never rejoin.
5. **Completion.** The doctor marks the visit **Treated** (completed), which closes the token.

## Rules implemented

- **Two-stage tokens.** Request references (`Q-000001`) are separate from queue tokens (`CAR-001`).
- **Token labels are per doctor and reset monthly.** The prefix comes from the specialty (CAR, ORT, GEN, or the first three letters). The counter includes cancelled tokens, so a label is never reused in the same month. Old tokens stay in the database.
- **Token identity never changes.** The label stays fixed. Only `queue_position` changes.
- **Daily capacity and waiting list.** Each doctor has `daily_capacity`. Slots are counted from tokens confirmed today. A cancelled token frees its slot. When the day is full, new requests go to the waiting list. Reception can move a waiting request forward. Confirming a full day needs an explicit **capacity exception**, which is written to the activity log.
- **Snooze & Swap.** A patient with one or two patients ahead can snooze once. They swap places with the next patient in the same doctor's queue, both positions change in one step, and the labels stay the same. The snooze is not offered after the doctor calls the patient, to an emergency case, or when no one is behind. The patient behind is notified.
- **"I'm here".** A patient who is approaching or called can tell reception they have arrived. This does not remove a flag by itself. Only reception can.
- **Emergency priority.** Only reception can move a confirmed patient to the front of the waiting patients, after any patient already called. Emergency cases cannot snooze. The change is logged. The site tells everyone that emergencies must not wait for a token, and that they should call 112 or go to the emergency department.
- **Activity log.** Confirmations, capacity exceptions, calls, completions, missed turns, rejoins, emergency priority, snoozes and cancellations are recorded. Entries contain token labels and staff names only. They never contain phone numbers or passwords.
- **Privacy.**
  - Public status (`GET /api/status`) returns only the request reference, status, queue token, position, patients ahead and doctor name. It never returns the patient's name, phone number or confirmatory code.
  - The doctor's queue never includes phone numbers.
  - Reception sees phone numbers, because it needs them to contact patients.
- **Rate limits** on public requests, status lookups, patient actions and login (in-memory, per IP address).
- **Security headers and a 10 KB request limit.** Sessions use `httpOnly` and `sameSite=lax` cookies. Passwords are hashed with bcrypt. Login regenerates the session id. Every staff route checks the role on the server.

## Design

The look follows the QueCare brief and the Unslop direction in the supplied archive:

- **Direction.** A hospital queue for patients and staff. Calm, orderly and warm. The world is a reception desk: ivory paper, forest-green signage, printed token slips.
- **Palette.** Forest green (#173F3A) for structure and primary actions, warm ivory (#F0E8D9) for the background, mist green and soft teal for quiet sections and status, terracotta and muted gold for meaningful accents only.
- **Typography.** Fraunces for headings and Instrument Sans for text, with system fallbacks. The Google Fonts link needs an internet connection. Without one, the pages fall back to the system serif and sans-serif fonts.
- **One bright moment.** A printed token slip on the home page, with a dashed perforation. It is the only decorative element.
- **Status is never colour alone.** Every status has a text label.
- **Accessibility.** Text size (three steps), a high-contrast mode, remembered on the device. Skip link, visible focus rings, semantic tables, `aria-live` status messages, and reduced-motion support. On phones, tables become stacked cards with labels.
- **Responsive.** Checked at 390 px wide with no horizontal scrolling.

## Project layout

- `server.js` starts Express, sessions, security headers, static files and the API.
- `src/db.js` the only storage file (in-memory now; contains the Supabase `CREATE TABLE` statements).
- `src/queue.js` all token rules: two-stage tokens, capacity, waiting list, call, missed turns, emergency priority, Snooze & Swap, public status and staff views.
- `src/audit.js` the activity log. `src/ratelimit.js` the rate limiter.
- `src/auth.js` login and role guards. `src/notify.js` calls the chatbot and holds the message texts.
- `src/routes/api.js` all JSON routes. `src/seed.js` the demo hospital and staff.
- `public/` the portals: `index.html`, `login.html`, `patient/`, `reception/`, `doctor/`, `css/style.css`, `js/common.js` (accessibility controls and helpers).
- `test-queue.js` the queue rule tests (32 tests, fake clock).

## Switching to Supabase later

Re-implement the small functions in `src/db.js` (`insert`, `find`, `findOne`, `getById`, `update`, `isEmpty`) with supabase-js and run the SQL from the comment at the top of that file. Supabase calls are async, so add `await` in the callers (`queue.js`, `audit.js`, `auth.js`, `seed.js`, `routes/api.js`).

## Testing

**Automated (`npm test`, 32 tests, no server needed).** Covers: phone normalisation, specialty prefixes, both token stages, per-doctor numbering, the doctor-scoped queue, call rules and cross-doctor protection, privacy of public status, treatment and renumbering, cancellation and capacity release, rejection, validation, "I'm here", every Snooze & Swap rule, emergency priority, the 2 minute grace and flags, absent and rejoin rules (including the completed-visit rule), extra time, capacity and the waiting list with exceptions, monthly label reset, reception board shape, and activity-log privacy.

**Browser checks (done during development).** The pages were checked in headless Chromium against the same queue rules: patient request, reception confirmation, doctor call, snooze availability, accessibility controls persisting after reload, and no horizontal scrolling at phone width. No JavaScript errors were raised. The only console messages were blocked Google Fonts requests in the sandbox, which had no internet access.

**Not yet tested by me.** `server.js`, `src/routes/api.js` and `src/auth.js` were syntax-checked and their imports verified, but I could not run them. Express and bcryptjs are not installed in the environment I worked in, and there was no network access to install them. Please run `npm install && npm start` and log in as each role before relying on it.

## Not implemented yet (from the master engineering prompt)

- **Patient accounts** with mobile-and-password login, password reset and inactivity logout. Patients still identify themselves by phone number, as in the original project. **This is the most important gap.** Anyone who knows a phone number can check, cancel, snooze or mark "I'm here" for that number. Add one-time-password verification before real use.
- **Automatic waiting-list offers** with a 15-minute acceptance window. Reception moves patients forward by hand.
- **Website notifications** (notification centre and pop-ups). Only WhatsApp messages are sent, through the chatbot.
- **Patient dashboard** (appointment history, visit history, feedback, support tickets).
- **Advance appointments** with preferred date and time, optional email, and rescheduling. Requests are for the same day.
- **Doctor availability and consultation hours**, weekly closing days, public holidays, department closure, doctor leave requests and emergency leave.
- **Cancellation cutoff** that the administrator can configure.
- **Administrator dashboard**: staff accounts and roles, departments, doctor profiles, hospital settings, analytics, feedback review and escalated tickets.
- **Post-visit feedback**, **support tickets**, and **digital confirmation with PDF download**.
- **Hindi and other languages.** The interface is still hard-coded English.
- **Real-time updates.** Dashboards refresh every 10 seconds. There is no WebSocket or SSE.
- **In Consultation** status. Statuses in use: waiting list, pending confirmation, confirmed, called, missed, completed, cancelled, rejected.
- **Analytics** and average waiting time (waiting time is intentionally not predicted, per the brief).

## Decisions and deviations to review

- **Confirmatory code is no longer shown on the website.** It is still sent on WhatsApp. Public status is keyed only by phone number, so showing the code there would let anyone who knows a number read it.
- **Snooze means swap with the next patient.** The "10 minutes" are recorded as `snoozed_until` and shown. The system does not hold the patient out for 10 minutes. Doing so would block the doctor's next call, so it is not enforced.
- **Missed-turn flags are calculated, not scheduled.** A patient is flagged when the grace period has passed and they are still called and not present. No background job runs. Nobody is removed automatically.
- **Emergency priority is for reception only.** Doctors cannot set it.
- **Patient "I'm here" does not clear a flag.** Only reception decides, as the brief says.
- **Rate limits and the activity log are in memory.** They reset when the server restarts. Use a shared store if you run several servers.
- **Data is in memory.** A restart clears all tokens and re-seeds the demo data.

## Security notes

- Passwords are hashed with bcrypt. Plain-text passwords are never stored or logged.
- Sessions use `httpOnly` cookies with `sameSite=lax`. In production, set `NODE_ENV=production` so the cookie is also `secure`. The app does not yet have CSRF tokens. `sameSite=lax` blocks most cross-site form posts, but add tokens before deploying publicly.
- Every staff route enforces its role on the server. The pages also check the role, but that is only a convenience.
- Output is written with `textContent`, never `innerHTML`, to prevent XSS.
- Keep `.env` out of version control (it is in `.gitignore`). Replace `SESSION_SECRET` and `INTERNAL_SECRET` with long random values.

## Supabase (current)

The website stores everything in Supabase when these two lines are set in `.env`:

```
SUPABASE_URL=https://YOUR-PROJECT-ID.supabase.co
SUPABASE_SERVICE_KEY=YOUR-SERVICE-ROLE-KEY
```

- Use the **service_role** key from Project Settings → API. It stays on the server only.
- Create the tables first (see the SQL comment at the top of `src/db.js`).
- On first start, the hospital, doctors and staff logins are added to Supabase if the `hospitals` table is empty.
- If the two lines are empty, the website runs from memory as before.
- `npm test` always uses memory, so it never touches your database.

If the server exits with "Could not reach the database", check the two values and that the tables exist.
