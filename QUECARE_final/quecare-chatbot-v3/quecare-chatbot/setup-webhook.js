// Registers this chatbot as the webhook of your Evolution API instance.
// Run once with: npm run setup
// WEBHOOK_URL is where Evolution sends incoming messages.
// Default works when Evolution runs in Docker on Windows (host.docker.internal).
// If Evolution is NOT in Docker, set WEBHOOK_URL=http://localhost:3000/evo-incoming in .env.

const webhookUrl = process.env.WEBHOOK_URL || 'http://host.docker.internal:3000/evo-incoming';
const url = `${process.env.EVO_URL}/webhook/set/${process.env.EVO_INSTANCE}`;
const body = {
  webhook: {
    enabled: true,
    url: webhookUrl,
    webhookByEvents: false,
    webhookBase64: false,
    events: ['MESSAGES_UPSERT'],
  },
};

try {
  const res = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', apikey: process.env.EVO_API_KEY || '' },
    body: JSON.stringify(body),
  });
  console.log('Status:', res.status);
  console.log('Webhook set to:', webhookUrl);
  console.log('Response:', await res.text());
} catch (err) {
  console.error(`Could not reach Evolution API at ${process.env.EVO_URL}: ${err.message}`);
  process.exitCode = 1;
}
