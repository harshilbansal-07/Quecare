/*
 * db.js - the ONLY file that touches storage.
 *
 * Two backends, same functions:
 *   - Supabase (used when SUPABASE_URL and SUPABASE_SERVICE_KEY are set in .env)
 *   - In-memory (used by the tests, or when the Supabase values are missing)
 *
 * Every function here is async. Callers must use `await`.
 * The schema below must match what you created in the Supabase SQL Editor.
 *
 * ---------------------------------------------------------------------------
 * SUPABASE / POSTGRES SCHEMA
 * ---------------------------------------------------------------------------
 * CREATE TABLE hospitals (
 *   id    BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
 *   name  TEXT NOT NULL
 * );
 *
 * CREATE TABLE doctors (
 *   id              BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
 *   hospital_id     BIGINT NOT NULL REFERENCES hospitals(id),
 *   name            TEXT NOT NULL,
 *   specialty       TEXT NOT NULL,
 *   active          BOOLEAN NOT NULL DEFAULT TRUE,
 *   daily_capacity  INTEGER NOT NULL DEFAULT 20 CHECK (daily_capacity >= 0)
 * );
 *
 * CREATE TABLE staff_users (
 *   id            BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
 *   hospital_id   BIGINT NOT NULL REFERENCES hospitals(id),
 *   email         TEXT NOT NULL UNIQUE,
 *   password_hash TEXT NOT NULL,
 *   role          TEXT NOT NULL CHECK (role IN ('receptionist', 'doctor')),
 *   doctor_id     BIGINT NULL REFERENCES doctors(id)
 * );
 *
 * CREATE TABLE patients (
 *   id         BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
 *   phone      TEXT NOT NULL UNIQUE,            -- digits only
 *   name       TEXT NOT NULL,
 *   created_at TIMESTAMPTZ NOT NULL DEFAULT now()
 * );
 *
 * CREATE TABLE tokens (see the SQL you were given; it matches the columns used in queue.js)
 * CREATE TABLE audit_logs (see the SQL you were given)
 * ---------------------------------------------------------------------------
 */
import { createClient } from '@supabase/supabase-js';

const TABLES = ['hospitals', 'doctors', 'staff_users', 'patients', 'tokens', 'audit_logs'];
const PAGE = 1000; // Supabase returns at most 1000 rows per request, so we read in pages

// True when Supabase is configured. Tests set QUECARE_FORCE_MEMORY=1 to stay in memory.
export function usingSupabase() {
  return (
    !!process.env.SUPABASE_URL &&
    !!process.env.SUPABASE_SERVICE_KEY &&
    process.env.QUECARE_FORCE_MEMORY !== '1'
  );
}

// ---------- Supabase backend ----------

let client = null;
function supabase() {
  if (!client) {
    client = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_KEY, {
      auth: { persistSession: false, autoRefreshToken: false },
    });
  }
  return client;
}

function dbError(error) {
  const err = new Error(`Database error: ${error.message}`);
  err.code = error.code;
  return err;
}

// Reads every row of a table in id order, page by page.
async function fetchAll(table) {
  const rows = [];
  for (let from = 0; ; from += PAGE) {
    const { data, error } = await supabase()
      .from(table)
      .select('*')
      .order('id', { ascending: true })
      .range(from, from + PAGE - 1);
    if (error) throw dbError(error);
    rows.push(...data);
    if (data.length < PAGE) break;
  }
  return rows;
}

// ---------- In-memory backend ----------

const mem = { tables: {}, counters: {} };
for (const name of TABLES) mem.tables[name] = [];

function memInsert(table, row) {
  mem.counters[table] = (mem.counters[table] || 0) + 1;
  const record = { id: mem.counters[table], ...row };
  mem.tables[table].push(record);
  return record;
}
const memGetById = (table, id) => mem.tables[table].find((r) => r.id === id) || null;
function memUpdate(table, id, patch) {
  const record = memGetById(table, id);
  if (!record) return null;
  Object.assign(record, patch);
  return record;
}

// ---------- Public functions (same names for both backends) ----------

export async function insert(table, row) {
  if (!usingSupabase()) return memInsert(table, row);
  const { data, error } = await supabase().from(table).insert(row).select().single();
  if (error) throw dbError(error);
  return data;
}

export async function find(table, predicate = () => true) {
  if (!usingSupabase()) return mem.tables[table].filter(predicate);
  return (await fetchAll(table)).filter(predicate);
}

export async function findOne(table, predicate) {
  const rows = await find(table, predicate);
  return rows[0] || null;
}

export async function getById(table, id) {
  if (!usingSupabase()) return memGetById(table, id);
  const { data, error } = await supabase().from(table).select('*').eq('id', id).maybeSingle();
  if (error) throw dbError(error);
  return data;
}

export async function update(table, id, patch) {
  if (!usingSupabase()) return memUpdate(table, id, patch);
  const { data, error } = await supabase().from(table).update(patch).eq('id', id).select().maybeSingle();
  if (error) throw dbError(error);
  return data;
}

// The newest `limit` rows of a table (newest first). Used for the audit log.
export async function recentRows(table, limit) {
  if (!usingSupabase()) return mem.tables[table].slice(-limit).reverse();
  const { data, error } = await supabase()
    .from(table)
    .select('*')
    .order('id', { ascending: false })
    .limit(limit);
  if (error) throw dbError(error);
  return data;
}

export async function isEmpty() {
  if (!usingSupabase()) return mem.tables.hospitals.length === 0;
  const { data, error } = await supabase().from('hospitals').select('id').limit(1);
  if (error) throw dbError(error);
  return data.length === 0;
}

// Test helper only: wipes the in-memory store. Never used with Supabase.
export function resetAll() {
  for (const name of TABLES) mem.tables[name].length = 0;
  for (const name of Object.keys(mem.counters)) delete mem.counters[name];
}
