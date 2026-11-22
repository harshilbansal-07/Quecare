import express from 'express';
import { sendText } from './src/evolution.js';
import { handleMessage } from './src/flow.js';

const PORT = Number(process.env.PORT) || 3000;
const app = express();
app.use(express.json({ limit: '2mb' }));

app.get('/health', (req, res) => res.json({ ok: true }));

// Called by the website only (needs the shared secret).
app.post('/notify', async (req, res) => {
  const secret = process.env.INTERNAL_SECRET;
  if (!secret || req.get('x-internal-secret') !== secret) {
    return res.status(401).json({ error: 'Unauthorized' });
  }
  const { phone, message } = req.body || {};
  if (!phone || !message) return res.status(400).json({ error: 'phone and message are required' });
  const result = await sendText(phone, message);
  if (!result.ok) return res.status(502).json({ error: 'Could not send the WhatsApp message' });
  res.json({ ok: true });
});

// Evolution webhook: answer 200 right away, then process in the background.
app.post('/evo-incoming', (req, res) => {
  res.sendStatus(200);
  processIncoming(req.body).catch((err) => console.error('[incoming] error:', err));
});

async function processIncoming(body) {
  const data = Array.isArray(body?.data) ? body.data[0] : body?.data;
  const jid = data?.key?.remoteJid;
  if (!jid || data.key.fromMe) return; // ignore our own messages
  if (jid.endsWith('@g.us')) return; // ignore group messages

  const phone = jid.split('@')[0].replace(/\D/g, '');
  const text = data.message?.conversation ?? data.message?.extendedTextMessage?.text;
  if (!phone || typeof text !== 'string' || !text.trim()) return; // media, reactions, etc.

  console.log(`[incoming] ${phone}: ${text}`);
  const reply = await handleMessage(phone, text);
  await sendText(phone, reply);
}

app.listen(PORT, () => {
  console.log(`QueCare chatbot running at http://localhost:${PORT}`);
  if (!process.env.INTERNAL_SECRET) console.warn('[warn] INTERNAL_SECRET is not set; /notify will reject everything.');
  if (process.env.EVO_MOCK === 'true') console.warn('[warn] EVO_MOCK=true: messages are logged, not sent.');
});
