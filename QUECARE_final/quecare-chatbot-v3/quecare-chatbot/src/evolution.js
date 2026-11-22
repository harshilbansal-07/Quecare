// evolution.js - sends WhatsApp text messages through Evolution API.

// Returns {ok, status}. Never throws.
export async function sendText(phone, text) {
  const number = String(phone).replace(/\D/g, '');

  // Testing aid: log instead of calling Evolution. Real sending is NOT exercised.
  if (process.env.EVO_MOCK === 'true') {
    console.log(`[evolution][MOCK] would send to ${number}: ${JSON.stringify(text)}`);
    return { ok: true, status: 0, mock: true };
  }

  const url = `${process.env.EVO_URL}/message/sendText/${process.env.EVO_INSTANCE}`;
  try {
    const res = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', apikey: process.env.EVO_API_KEY || '' },
      body: JSON.stringify({ number, text }),
      signal: AbortSignal.timeout(10000),
    });
    console.log(`[evolution] sendText to ${number} -> HTTP ${res.status}`);
    if (!res.ok) {
      const body = await res.text().catch(() => '');
      console.error(`[evolution] error body: ${body.slice(0, 300)}`);
    }
    return { ok: res.ok, status: res.status };
  } catch (err) {
    console.error(`[evolution] sendText to ${number} failed: ${err.message}`);
    return { ok: false, status: 0 };
  }
}
