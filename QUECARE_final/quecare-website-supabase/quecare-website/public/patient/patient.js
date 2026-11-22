const $ = QC.$;
const { api, show } = QC;

// The phone number being tracked. It is kept in memory only, not stored on the device.
let trackedPhone = null;
let refreshTimer = null;

const STATUS_TEXT = {
  WAITING_LIST: 'You are on the waiting list',
  PENDING_CONFIRMATION: 'Waiting for reception to confirm',
  CONFIRMED: 'Confirmed. Please wait for your turn',
  CALLED: 'Your turn is ready',
  MISSED: 'You were not found when your turn was called',
};

async function loadDoctors() {
  const select = $('doctor');
  try {
    const doctors = await api('/api/doctors');
    select.innerHTML = '';
    select.append(new Option('Choose a doctor', ''));
    for (const d of doctors) select.append(new Option(`${d.name} (${d.specialty})`, d.id));
  } catch (err) {
    select.innerHTML = '';
    select.append(new Option('Could not load doctors', ''));
    show($('request-msg'), err.message, 'error');
  }
}

$('request-form').addEventListener('submit', async (event) => {
  event.preventDefault();
  const msg = $('request-msg');
  msg.className = 'msg';
  const phone = $('phone').value;
  try {
    const data = await api('/api/requests', {
      method: 'POST',
      body: JSON.stringify({
        name: $('name').value,
        phone,
        doctorId: Number($('doctor').value),
        source: 'website',
      }),
    });
    const text =
      data.status === 'WAITING_LIST'
        ? `Your request reference is ${data.request_ref}. Your doctor has reached today's capacity, so you are on the waiting list.`
        : `Your request reference is ${data.request_ref}. Reception will confirm it shortly. Check your token below.`;
    show(msg, text, 'ok');
    $('status-phone').value = phone;
    $('request-form').reset();
    loadDoctors();
  } catch (err) {
    show(msg, err.message, 'error');
  }
});

// Builds a list of label and value pairs, using textContent only.
function factList(pairs) {
  const dl = document.createElement('dl');
  dl.className = 'facts';
  for (const [label, value] of pairs) {
    const dt = document.createElement('dt');
    dt.textContent = label;
    const dd = document.createElement('dd');
    dd.textContent = value;
    dl.append(dt, dd);
  }
  return dl;
}

function button(label, className, onClick) {
  const b = document.createElement('button');
  b.type = 'button';
  b.textContent = label;
  if (className) b.className = className;
  b.addEventListener('click', onClick);
  return b;
}

function renderStatus(data) {
  const box = $('status-box');
  box.innerHTML = '';

  const heading = document.createElement('p');
  heading.className = 'headline';
  heading.textContent = STATUS_TEXT[data.status] || 'Your token';
  box.append(heading);

  const pairs = [['Reference', data.request_ref], ['Doctor', data.doctor_name]];
  if (data.queue_label) pairs.push(['Queue token', data.queue_label]);
  if (data.queue_position != null) pairs.push(['Queue position', String(data.queue_position)]);
  if (data.patients_ahead != null) pairs.push(['Patients ahead', String(data.patients_ahead)]);
  if (data.waiting_position != null) pairs.push(['Waiting list position', String(data.waiting_position)]);
  box.append(factList(pairs));

  if (data.status === 'CALLED') {
    const notice = document.createElement('div');
    notice.className = 'notice';
    notice.style.marginTop = '16px';
    const p = document.createElement('p');
    p.textContent = 'Please go to the doctor now.';
    notice.append(p);
    box.append(notice);
  }

  if (data.status === 'MISSED') {
    const notice = document.createElement('div');
    notice.className = 'notice';
    notice.style.marginTop = '16px';
    const p = document.createElement('p');
    p.textContent = 'Please go to the reception desk to rejoin the queue. Your token number stays the same.';
    notice.append(p);
    box.append(notice);
  }

  // Snooze and "I'm here" only appear when the patient is close to their turn, or has been called.
  if (data.can_here || data.can_snooze || data.here) {
    const approach = document.createElement('div');
    approach.className = 'approach';
    const h = document.createElement('h3');
    h.textContent = data.status === 'CALLED' ? 'Please go to the doctor now' : 'Your turn is getting close';
    approach.append(h);
    const actions = document.createElement('div');
    actions.className = 'actions-row';
    if (data.here) {
      const p = document.createElement('p');
      p.textContent = 'You have told reception that you are here.';
      approach.append(p);
    } else if (data.can_here) {
      actions.append(button("I'm here", '', markHere));
    }
    if (data.can_snooze) {
      actions.append(button('Snooze 10 minutes', 'secondary', snooze));
    }
    if (actions.childElementCount) approach.append(actions);
    box.append(approach);
  }

  if (['WAITING_LIST', 'PENDING_CONFIRMATION', 'CONFIRMED'].includes(data.status)) {
    const actions = document.createElement('div');
    actions.className = 'actions-row';
    actions.append(button('Cancel my token', 'danger', cancelToken));
    box.append(actions);
  }
  box.hidden = false;
}

function startRefresh() {
  clearInterval(refreshTimer);
  refreshTimer = setInterval(() => {
    if (trackedPhone) checkStatus(true);
  }, 20000);
}

async function checkStatus(silent = false) {
  const msg = $('status-msg');
  if (!silent) msg.className = 'msg';
  const phone = $('status-phone').value;
  try {
    const data = await api(`/api/status?phone=${encodeURIComponent(phone)}`);
    if (!data.active) {
      trackedPhone = null;
      clearInterval(refreshTimer);
      $('status-box').hidden = true;
      if (!silent) show(msg, 'You have no active token.', 'error');
      return;
    }
    trackedPhone = phone;
    renderStatus(data);
    startRefresh();
    if (!silent) msg.className = 'msg';
  } catch (err) {
    if (!silent) {
      $('status-box').hidden = true;
      show(msg, err.message, 'error');
    }
  }
}

async function markHere() {
  try {
    await api('/api/requests/here', { method: 'POST', body: JSON.stringify({ phone: trackedPhone }) });
    await checkStatus(true);
  } catch (err) {
    show($('status-msg'), err.message, 'error');
  }
}

async function snooze() {
  if (!confirm('Snooze moves you back one place, and the patient behind you moves forward. You can use this once for this visit. Continue?')) return;
  const msg = $('status-msg');
  try {
    const data = await api('/api/requests/snooze', { method: 'POST', body: JSON.stringify({ phone: trackedPhone }) });
    show(msg, data.message, 'ok');
    await checkStatus(true);
  } catch (err) {
    show(msg, err.message, 'error');
  }
}

async function cancelToken() {
  if (!confirm('Are you sure you want to cancel your token?')) return;
  const msg = $('status-msg');
  try {
    const data = await api('/api/requests/cancel', { method: 'POST', body: JSON.stringify({ phone: trackedPhone }) });
    trackedPhone = null;
    clearInterval(refreshTimer);
    $('status-box').hidden = true;
    show(msg, data.message, 'ok');
  } catch (err) {
    show(msg, err.message, 'error');
  }
}

$('status-form').addEventListener('submit', (event) => {
  event.preventDefault();
  checkStatus(false);
});

loadDoctors();
