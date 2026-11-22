# QueCare

A hospital token queue system. Patients request a token by website or WhatsApp, reception confirms it, and doctors call patients in order.

This repository contains two projects:

| Folder | What it is |
|---|---|
| `quecare-website-supabase/quecare-website` | Website with patient, reception and doctor dashboards, backed by Supabase |
| `quecare-chatbot-v3/quecare-chatbot` | WhatsApp chatbot (via Evolution API) that talks to the website |

---

## 1. Project overview

QueCare handles the queue for a hospital's outpatient doctors.

- A patient asks for a token, either on the website or by messaging the WhatsApp number.
- The request gets a reference such as `Q-000001` and waits for reception.
- Reception checks that the doctor is available and the patient is inside, then confirms. The patient receives a queue token such as `CAR-001` and a 4-character confirmation code on WhatsApp.
- The doctor calls the next patient. If the patient doesn't arrive within 2 minutes, reception can mark them absent, and they can rejoin later.

Each doctor has a daily capacity. When it is full, new requests go to a waiting list.

Queue labels are prefixed by specialty (`CAR` for Cardiology, `GEN` for General Medicine, `ORT` for Orthopedics) and numbered per doctor per month.

---

## 2. How the website works

The website has three parts. Staff pages are protected by login and redirect to the login page if you are not logged in with the right role.

### Patient portal (`/patient/`)

No login needed. A patient can:
- **Request a token:** enter name, phone number (with country code) and choose a doctor.
- **Check status:** see the request state, queue position and patients ahead.
- **Cancel:** cancel their active token (not allowed once they have been called).
- **Press "I'm here":** available when they are close to the front of the queue.
- **Snooze:** move back one place once, swapping with the patient behind (only when one or two patients are ahead).

Each phone number can hold only one active token at a time.

### Reception dashboard (`/reception/`)

Login required (receptionist). Reception can:
- **Confirm** a pending request. Both boxes ("Doctor is available" and "Patient is inside") must be ticked. This creates the queue token and sends the WhatsApp message.
- **Reject** a request.
- **Move a waiting-list request forward** so it can be confirmed.
- **Mark present**, **give extra time** (another 2 minutes), or **mark absent** once the grace period has passed.
- **Rejoin** a missed patient at the end of the queue.
- **Give emergency priority** to a confirmed patient.

### Doctor dashboard (`/doctor/`)

Login required (doctor). Each doctor sees only their own queue, without phone numbers. Doctors can:
- **Call** the next patient (only the one at the front of the queue). The patient gets a WhatsApp message.
- **Treated:** complete the visit. The queue renumbers automatically.

### Status values

| Status | Meaning |
|---|---|
| `WAITING_LIST` | Doctor's daily capacity is full |
| `PENDING_CONFIRMATION` | Waiting for reception |
| `CONFIRMED` | Has a queue token and is in the queue |
| `CALLED` | Doctor has called the patient |
| `MISSED` | Patient did not arrive in time |
| `TREATED` | Visit completed |
| `CANCELLED` | Cancelled by the patient |
| `REJECTED` | Not confirmed by reception |

---

## 3. How to test all 3 dashboards

Make sure the website is running at `http://localhost:4000` and the chatbot is running (for WhatsApp messages).

### Demo logins

| Dashboard | Email | Password |
|---|---|---|
| Reception | `receptionist@quecare.local` | `reception123` |
| Doctor (Dr. Asha Rao) | `doctor.rao@quecare.local` | `doctor123` |
| Doctor (Dr. Vikram Mehta) | `doctor.mehta@quecare.local` | `doctor123` |
| Doctor (Dr. Neha Iyer) | `doctor.iyer@quecare.local` | `doctor123` |

Change these before any real use.

### Test order

**Step 1: Patient portal**
1. Open `http://localhost:4000` and click the patient card.
2. Enter a name, a phone number such as `917000000001`, and choose a doctor.
3. Submit. You should see a reference like `Q-000001` and status "Pending".
4. Enter the same phone number in the status check. It should show as pending with no queue position.

**Step 2: Reception dashboard**
1. Open `http://localhost:4000/login.html` and log in as the receptionist.
2. The new request appears in the pending list.
3. Tick both boxes and click **Confirm**.
4. The request moves to the doctor's queue with a label such as `CAR-001`. The patient gets the code on WhatsApp.

**Step 3: Doctor dashboard**
1. Log out, then log in as `doctor.rao@quecare.local`.
2. The confirmed patient appears in the queue, with no phone number shown.
3. Click **Call**. The patient gets the "your turn is ready" message.
4. Wait 2 minutes without marking the patient present, then check reception. The patient is flagged. Reception can then mark them absent, or give extra time.
5. Click **Treated** for a patient who has been called and present. The queue renumbers.

**Pass criteria:** each step shows the expected status, and the phone numbers never appear on the doctor dashboard.

### Automated tests

Run these in the website folder, with no server or database needed:

```powershell
npm.cmd test
```

It should print `32 tests passed`. The tests use an in-memory store, so they never touch Supabase.

---

## 4. How the chatbot works

The chatbot receives WhatsApp messages through Evolution API and replies to the same number. It does not store data itself. It calls the website's API for every action.

### Conversation

Send `hi` to start. The chatbot replies with the menu:

```
1 - Book a token
2 - Check my token status
3 - Cancel my token
help - Show this menu
```

- **Book (1):** asks for your full name, then which doctor you want. It then sends your request to reception.
- **Status (2):** shows your request or token status, doctor, queue position and patients ahead.
- **Cancel (3):** asks you to reply `YES` or `NO`, then cancels your active token.
- **`hi`, `hello`, `hey`, `menu`:** return to the menu from any step.

### Messages the chatbot sends automatically

The website asks the chatbot to send these:
- The request was received (with the reference).
- The request is confirmed (with the queue token and confirmation code).
- Your turn is ready (after the doctor calls you).
- You were marked absent, or you rejoined the queue.
- Your position changed after a snooze swap.

### Connecting to WhatsApp

1. The Evolution API instance (`plswork`) must be connected to the WhatsApp number.
2. `npm.cmd run setup` registers the chatbot as the webhook, so incoming messages reach `/evo-incoming`.
3. `POST /notify` lets the website send messages. It requires the `INTERNAL_SECRET` header, which must match the website's value.

### Testing without WhatsApp

Set `EVO_MOCK=true` in the chatbot's `.env`. Replies are printed in the console instead of being sent, which is useful for checking the conversation flow.

---

## 5. Supabase database

The website stores all data in Supabase (Postgres). The database layer is in `src/db.js`, the only file that talks to storage.

### How the website connects

- If `SUPABASE_URL` and `SUPABASE_SERVICE_KEY` are set in `.env`, the website reads and writes Supabase.
- If they are empty, the website uses an in-memory store instead. Data is lost on restart.
- Tests always use memory, so `npm test` never touches your database.

The service key must be the **secret** key (`sb_secret_...`) or the `service_role` key. Do not use the publishable key (`sb_publishable_...`), which cannot read the tables. Keep the secret key on the server only.

### Tables

| Table | What it holds |
|---|---|
| `hospitals` | Hospital name (one row for the demo) |
| `doctors` | Name, specialty, whether active, and daily capacity |
| `staff_users` | Staff logins: email, password hash, role (receptionist or doctor), linked doctor |
| `patients` | Phone number (digits only, unique), name |
| `tokens` | Every request and queue token, with status, labels, positions and timestamps |
| `audit_logs` | Record of staff and queue actions (no phone numbers or passwords) |

### Important rules in the database

- **One active token per patient:** a unique index on `tokens` stops a phone number from holding two active tokens at once.
- **Unique confirmation codes:** a unique index stops two active tokens from sharing a confirmation code.
- **Status values are checked:** only the listed statuses are allowed.

### First run

On the first start, if the `hospitals` table is empty, the website adds the demo hospital, three doctors and four staff logins.

### Reading the data

Use **Table Editor** in Supabase to see rows. Recent `tokens` show each request's status and timestamps. `audit_logs` shows who did what and when.

### Common problems

- **"permission denied for table":** the key is wrong (publishable instead of secret), or the tables are missing.
- **"Could not reach the database" at startup:** check `SUPABASE_URL` and that the tables exist.

---

## Running locally

**Website**
```powershell
cd quecare-website-supabase\quecare-website
npm.cmd install
npm.cmd start
```

**Chatbot**
```powershell
cd quecare-chatbot-v3\quecare-chatbot
npm.cmd install
npm.cmd start
```

Each folder needs its own `.env` file. Use `.env.example` as a template. Never commit `.env` files.

---

## Known limits

- Anyone who knows a phone number can look up or cancel its token. Phone verification is needed before real use.
- Demo passwords are visible in the seed file and must be changed.
- Queue updates that change several records are not yet atomic.
- Sessions and rate limits are stored in memory, so they need changing before deploying to a serverless host.
