# Hospital Queue Management System: Token Generation & Reusable Slot Logic

This document outlines the token naming convention and database recycling architecture for the Hospital Queue Management System (Web + WhatsApp Bot). Instead of generating infinitely incrementing IDs, the system treats digital tokens like **physical reusable cards** that dynamically overwrite patient data upon reassignment.

---

## 1. Token Naming Convention

Tokens follow a short, human-readable format designed for easy announcement over hospital speakers, clear visibility on waiting room screens, and quick entry on mobile devices.

### Format
`[Department/Doctor Prefix]-[2-Digit Number]`

### Examples
| Department / Doctor | Prefix | Token Sequence |
| :--- | :--- | :--- |
| **General Medicine** | `G` | `G-01`, `G-02`, `G-03` ... `G-99` |
| **Pediatrics** | `P` | `P-01`, `P-02`, `P-03` ... `P-99` |
| **Dental** | `D` | `D-01`, `D-02`, `D-03` ... `D-99` |
| **Orthopedics** | `O` | `O-01`, `O-02`, `O-03` ... `O-99` |

> **Note for Multi-Doctor Clinics:** If a clinic routes by specific doctors rather than departments, use the doctor's initial as the prefix (e.g., Dr. Sharma = `S-01`, Dr. Verma = `V-01`).

---

## 2. Reusable Slot Architecture ("Card-Box" Logic)

To prevent database bloat and keep token numbers simple (`01` to `99`), each department maintains a **fixed pool of token slots** in the active queue table.

### Token Lifecycle States
Every token slot exists in one of four states:
1. **`AVAILABLE`**: The token is free and ready to be assigned to the next patient.
2. **`WAITING`**: A patient has booked the token via WhatsApp or the Web Portal and is waiting in the queue.
3. **`IN_CONSULTATION`**: The doctor has called the token into the consultation room.
4. **`COMPLETED`**: The visit has ended, and the token is eligible for recycling.

### How Data Overwriting Works
When a patient books a token (via WhatsApp chatbot, website, or receptionist walk-in entry):
1. **Slot Selection:** The system queries the active table for the lowest-numbered token in that department with `status = 'AVAILABLE'` (e.g., `G-01`).
2. **Data Overwrite (UPDATE, not INSERT):** Rather than creating a new row, the system **overwrites** the existing fields on `G-01` with the new patient's details:
   * `patient_name`: Overwritten with the new patient's name.
   * `patient_phone`: Overwritten with the new patient's WhatsApp/contact number.
   * `booked_at`: Overwritten with the current timestamp.
   * `status`: Updated from `AVAILABLE` to `WAITING`.

---

## 3. Recycling & Reset Triggers

Tokens return to the `AVAILABLE` pool through two mechanisms:

1. **Scheduled Daily Reset (Primary):**
   * A cron job runs automatically at midnight (`00:00`), resetting all tokens across all departments back to `status = 'AVAILABLE'` and clearing stale active session flags.
2. **Same-Day Overflow Recycling (Optional):**
   * If a high-volume department exceeds 99 patients in a single day, any token marked `COMPLETED` earlier in the day can be immediately re-pooled as `AVAILABLE` once `01`–`99` are exhausted.

---

## 4. Recommended Database Structure

To support seamless overwriting while still preserving hospital analytics, separate **live queue slots** from **historical visit logs**.

### Table 1: `active_tokens` (Fixed Pool — Overwritten Daily)
| Column | Type | Description |
| :--- | :--- | :--- |
| `token_code` | `VARCHAR(10)` (PK) | Fixed identifier (e.g., `G-01`, `P-04`) |
| `department_id` | `VARCHAR(10)` | Department or Doctor code (`G`, `P`, `D`) |
| `status` | `ENUM` | `AVAILABLE`, `WAITING`, `IN_CONSULTATION`, `COMPLETED` |
| `patient_name` | `VARCHAR(100)` | Current patient's name (overwritten on reuse) |
| `patient_phone` | `VARCHAR(20)` | Current patient's phone/WhatsApp ID (overwritten on reuse) |
| `booked_at` | `TIMESTAMP` | Exact time the current patient claimed the token |

### Table 2: `visit_history` (Append-Only Audit Log)
Before overwriting an existing token slot—or immediately when a doctor clicks **"Complete Visit"**—insert a snapshot of the completed consultation into `visit_history`.

* **Why this matters:** It ensures the hospital retains accurate daily footfall, peak-hour analytics, and patient visit records without slowing down or cluttering the real-time queue table.

---

## 5. Edge-Case Safeguards

* **Preventing Old WhatsApp Screenshot Reuse:**
  * If a patient arrives at the reception desk showing yesterday's WhatsApp confirmation for `G-01`, the system validates `booked_at` against the current date (`CURRENT_DATE`). If the dates do not match, the receptionist dashboard flags the token as **Expired**.
* **Concurrency Lock on Booking:**
  * When two patients book simultaneously via WhatsApp and the Web Portal, use a row-level lock (`SELECT ... FOR UPDATE`) when fetching the lowest `AVAILABLE` token so both patients are never assigned `G-01` at the exact same millisecond.