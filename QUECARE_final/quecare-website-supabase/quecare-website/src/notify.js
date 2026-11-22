// notify.js - sends WhatsApp messages by asking the chatbot's /notify endpoint.
// A failed notification must never fail the request: we only log it.
// Website notifications are shown on the patient page. Other channels can be added here later.

export async function notifyPatient(phone, message) {
  const url = `${process.env.CHATBOT_URL || 'http://localhost:3000'}/notify`;
  try {
    const res = await fetch(url, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-internal-secret': process.env.INTERNAL_SECRET || '',
      },
      body: JSON.stringify({ phone, message }),
      signal: AbortSignal.timeout(8000),
    });
    if (!res.ok) {
      console.error(`[notify] chatbot answered ${res.status} for ${phone}`);
      return false;
    }
    console.log(`[notify] sent to ${phone}`);
    return true;
  } catch (err) {
    console.error(`[notify] failed for ${phone}: ${err.message}`);
    return false;
  }
}

export const messages = {
  requested: (t) => `QueCare: we have received your token request. Reference ${t.request_ref}. The reception will confirm it shortly.`,
  waitlisted: (doctor) =>
    `QueCare: ${doctor.name} has reached today's capacity. You are on the waiting list. Reception will contact you if a slot opens.`,
  confirmed: (t) =>
    `QueCare: your request is confirmed. Reference ${t.request_ref}. Queue token: ${t.queue_label}. ` +
    `Confirmatory code: ${t.confirm_code}. Please show this code at the reception when you are called.`,
  called: (t, doctor) => `Your turn is ready. Please go to ${doctor.name} now. Queue token: ${t.queue_label}.`,
  rejected: () => 'Sorry, your token request could not be confirmed. Please contact the reception.',
  moved: (t) => `QueCare: your queue position has changed. Token ${t.queue_label} is now at position ${t.queue_position}.`,
  absent: () => 'QueCare: we could not find you when your turn was called. Please go to the reception to rejoin the queue.',
  rejoined: (t) => `QueCare: you have rejoined the queue. Token ${t.queue_label} is now at position ${t.queue_position}.`,
};
