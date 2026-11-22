// core.js - HTTP client for the QueCare website API ("core").
// Every function returns {ok: true, data} or {ok: false, error}. It never throws,
// and `error` is text that can be shown to the patient directly.
//
// SUPABASE SWAP NOTE: later, this file could talk to Supabase directly instead of
// the website. Keep the four function names and return shape and flow.js will not change.

const UNAVAILABLE = 'Service is temporarily unavailable. Please try again shortly.';

async function request(method, path, body) {
  const url = `${process.env.CORE_URL}${path}`;
  try {
    const res = await fetch(url, {
      method,
      headers: {
        'Content-Type': 'application/json',
        'x-internal-secret': process.env.INTERNAL_SECRET || '',
      },
      body: body ? JSON.stringify(body) : undefined,
      signal: AbortSignal.timeout(10000),
    });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) return { ok: false, error: data.error || UNAVAILABLE };
    return { ok: true, data };
  } catch (err) {
    console.error(`[core] ${method} ${path} failed: ${err.message}`);
    return { ok: false, error: UNAVAILABLE };
  }
}

export const getDoctors = () => request('GET', '/api/doctors');
export const createRequest = (body) => request('POST', '/api/requests', body);
export const getStatus = (phone) => request('GET', `/api/status?phone=${encodeURIComponent(phone)}`);
export const cancelRequest = (phone) => request('POST', '/api/requests/cancel', { phone });
