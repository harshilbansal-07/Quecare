const $ = QC.$;
const { api, show, cell, formatTime, STATUS_LABEL } = QC;

// Pending-row checkbox state survives the 10 second refresh: request id -> { avail, inside }.
const checks = new Map();

const ACTION_LABEL = {
  confirmed: 'Confirmed',
  capacity_exception: 'Capacity exception',
  rejected: 'Rejected',
  waitlist_moved_forward: 'Moved forward from waiting list',
  called: 'Called',
  completed: 'Completed',
  marked_present: 'Marked present',
  extra_time: 'Extra time given',
  marked_absent: 'Marked absent',
  rejoined_queue: 'Rejoined queue',
  emergency_priority: 'Emergency priority',
  snooze_swap: 'Snooze and swap',
  patient_here: 'Patient said they are here',
  cancelled: 'Cancelled by patient',
};

function report(text, type) {
  show($('msg'), text, type);
}

// Shared error handling: send the user to login when the session has ended.
async function call(url, options) {
  try {
    return await api(url, options);
  } catch (err) {
    if (err.status === 401 || err.status === 403) {
      window.location.href = '/login.html';
    }
    throw err;
  }
}

function statusClass(status) {
  return `s-${String(status).toLowerCase().split('_')[0]}`;
}

function statusCell(status, label) {
  const td = cell('', label);
  const span = document.createElement('span');
  span.className = `status ${statusClass(status)}`;
  span.textContent = STATUS_LABEL[status] || status;
  td.append(span);
  return td;
}

function tag(text, className) {
  const span = document.createElement('span');
  span.className = `tag ${className || ''}`.trim();
  span.textContent = text;
  return span;
}

function actionButton(label, className, onClick, disabled = false) {
  const b = document.createElement('button');
  b.type = 'button';
  b.textContent = label;
  b.className = `small ${className || ''}`.trim();
  b.disabled = disabled;
  b.addEventListener('click', onClick);
  return b;
}

function emptyRow(tbody, emptyEl, count) {
  tbody.innerHTML = '';
  emptyEl.hidden = count > 0;
}

// ---------- Pending requests ----------

function renderPending(rows) {
  const body = $('pending-rows');
  const liveIds = new Set(rows.map((r) => r.id));
  for (const id of checks.keys()) if (!liveIds.has(id)) checks.delete(id);
  emptyRow(body, $('pending-empty'), rows.length);

  for (const r of rows) {
    const state = checks.get(r.id) || { avail: false, inside: false };
    checks.set(r.id, state);
    const tr = document.createElement('tr');

    const confirmBtn = actionButton('Confirm', '', () => confirmRequest(r.id, confirmBtn));
    const syncConfirm = () => {
      confirmBtn.disabled = !(state.avail && state.inside);
    };
    syncConfirm();

    const tdChecks = cell('', 'Checks');
    tdChecks.className = 'checks';
    const avail = labelledCheck('Doctor is available', state.avail, (v) => {
      state.avail = v;
      syncConfirm();
    });
    const inside = labelledCheck('Patient is inside the hospital', state.inside, (v) => {
      state.inside = v;
      syncConfirm();
    });
    tdChecks.append(avail, inside);

    const tdActions = cell('', '');
    tdActions.className = 'actions';
    tdActions.append(confirmBtn, actionButton('Reject', 'danger', () => rejectRequest(r.id)));

    tr.append(
      cell(r.request_ref, 'Reference'),
      cell(r.patient_name, 'Patient'),
      cell(r.phone, 'Phone'),
      cell(`${r.doctor_name} (${r.specialty})`, 'Doctor'),
      cell(r.source, 'Source'),
      tdChecks,
      tdActions
    );
    body.append(tr);
  }
}

function labelledCheck(text, checked, onChange) {
  const wrap = document.createElement('label');
  const input = document.createElement('input');
  input.type = 'checkbox';
  input.checked = checked;
  input.addEventListener('change', () => onChange(input.checked));
  wrap.append(input, document.createTextNode(text));
  return wrap;
}

async function confirmRequest(id, button, capacityException = false) {
  button.disabled = true;
  try {
    const data = await call(`/api/reception/requests/${id}/confirm`, {
      method: 'POST',
      body: JSON.stringify({ doctorAvailable: true, patientInside: true, capacityException }),
    });
    report(`Confirmed. Token ${data.queue_label}, position ${data.queue_position}, code ${data.confirm_code}.`, 'ok');
    checks.delete(id);
    await load();
  } catch (err) {
    if (err.code === 'CAPACITY_FULL' && !capacityException) {
      const ok = window.confirm(`${err.message}\n\nConfirm this patient as a capacity exception? The exception is recorded in the activity log.`);
      if (ok) return confirmRequest(id, button, true);
    }
    report(err.message, 'error');
    button.disabled = false;
  }
}

async function rejectRequest(id) {
  const reason = window.prompt('Reason for rejecting (optional, kept in the server log only):', '');
  if (reason === null) return;
  try {
    await call(`/api/reception/requests/${id}/reject`, { method: 'POST', body: JSON.stringify({ reason }) });
    report('Request rejected. The patient has been notified.', 'ok');
    await load();
  } catch (err) {
    report(err.message, 'error');
  }
}

// ---------- Waiting list ----------

function renderWaiting(rows) {
  const body = $('waiting-rows');
  emptyRow(body, $('waiting-empty'), rows.length);
  for (const r of rows) {
    const tr = document.createElement('tr');
    const td = cell('', 'Action');
    td.className = 'actions';
    td.append(
      actionButton('Move to pending', '', () => promoteRequest(r.id)),
      actionButton('Reject', 'danger', () => rejectRequest(r.id))
    );
    tr.append(cell(r.request_ref, 'Reference'), cell(r.patient_name, 'Patient'), cell(r.phone, 'Phone'), cell(`${r.doctor_name} (${r.specialty})`, 'Doctor'), td);
    body.append(tr);
  }
}

async function promoteRequest(id) {
  try {
    await call(`/api/reception/requests/${id}/promote`, { method: 'POST' });
    report('Moved to pending. You can now confirm the request.', 'ok');
    await load();
  } catch (err) {
    report(err.message, 'error');
  }
}

// ---------- Live queues ----------

function queueRowFlags(row) {
  const flags = [];
  if (row.emergency) flags.push(tag('Emergency priority', 'emerg'));
  if (row.here) flags.push(tag('Said they are here'));
  if (row.status === 'CALLED' && row.present) flags.push(tag('Present'));
  if (row.status === 'CALLED' && !row.present && row.flagged) flags.push(tag('Not arrived, grace over', 'flag'));
  if (row.status === 'CALLED' && !row.present && !row.flagged && row.grace_until) {
    flags.push(tag(`Grace until ${formatTime(row.grace_until)}`));
  }
  return flags;
}

function renderQueues(doctors) {
  const host = $('queues');
  host.innerHTML = '';
  for (const d of doctors) {
    const wrap = document.createElement('div');
    const title = document.createElement('h3');
    title.className = 'subhead';
    title.textContent = `${d.name} (${d.specialty})`;
    const count = document.createElement('p');
    count.className = 'count';
    count.textContent = `Today: ${d.used} of ${d.capacity} slots used.`;
    wrap.append(title, count);

    const table = document.createElement('table');
    table.className = 'stack';
    const head = document.createElement('thead');
    const hr = document.createElement('tr');
    for (const h of ['Position', 'Token', 'Patient', 'Status', 'Flags', 'Actions']) {
      const th = document.createElement('th');
      th.textContent = h;
      hr.append(th);
    }
    head.append(hr);
    const body = document.createElement('tbody');

    if (d.queue.length === 0) {
      const tr = document.createElement('tr');
      const td = document.createElement('td');
      td.colSpan = 6;
      td.className = 'empty';
      td.textContent = 'No patients in this queue.';
      tr.append(td);
      body.append(tr);
    }

    for (const row of d.queue) {
      const tr = document.createElement('tr');
      if (row.emergency) tr.className = 'is-emergency';
      const actions = document.createElement('td');
      actions.className = 'actions';

      if (row.status === 'CALLED') {
        if (!row.present) {
          actions.append(actionButton('Mark present', '', () => tokenAction(`/api/reception/tokens/${row.id}/present`, 'Marked present.')));
          actions.append(actionButton('Extra time', 'secondary', () => tokenAction(`/api/reception/tokens/${row.id}/extra-time`, 'Two more minutes given.')));
          actions.append(
            actionButton(
              'Mark absent',
              'danger',
              () => confirmAbsent(row),
              !row.flagged
            )
          );
        }
      } else if (row.status === 'CONFIRMED' && !row.emergency) {
        actions.append(actionButton('Emergency priority', 'secondary', () => confirmEmergency(row)));
      }

      const flags = document.createElement('td');
      flags.setAttribute('data-label', 'Flags');
      for (const f of queueRowFlags(row)) flags.append(f);

      tr.append(
        cell(String(row.queue_position), 'Position'),
        cell(row.queue_label, 'Token'),
        cell(row.patient_name, 'Patient'),
        statusCell(row.status, 'Status'),
        flags,
        actions
      );
      body.append(tr);
    }

    table.append(head, body);
    const scroll = document.createElement('div');
    scroll.className = 'table-wrap';
    scroll.append(table);
    wrap.append(scroll);
    host.append(wrap);
  }
}

async function tokenAction(url, okText) {
  try {
    await call(url, { method: 'POST' });
    report(okText, 'ok');
  } catch (err) {
    report(err.message, 'error');
  }
  await load();
}

function confirmAbsent(row) {
  if (!window.confirm(`Mark ${row.queue_label} as absent? The token keeps its number. The patient can rejoin the end of the queue.`)) return;
  tokenAction(`/api/reception/tokens/${row.id}/absent`, 'Marked absent. The patient has been notified.');
}

function confirmEmergency(row) {
  if (!window.confirm(`Move ${row.queue_label} to emergency priority?\n\nEmergency cases still need immediate medical attention. They must not wait for a token.`)) return;
  tokenAction(`/api/reception/tokens/${row.id}/emergency`, 'Emergency priority set. Queue positions updated.');
}

// ---------- Missed turns ----------

function renderMissed(rows) {
  const body = $('missed-rows');
  emptyRow(body, $('missed-empty'), rows.length);
  for (const r of rows) {
    const tr = document.createElement('tr');
    const td = cell('', 'Action');
    td.className = 'actions';
    td.append(actionButton('Rejoin at end of queue', '', () => rejoinQueue(r)));
    tr.append(cell(r.queue_label, 'Token'), cell(r.patient_name, 'Patient'), cell(r.phone, 'Phone'), statusCell(r.status, 'Status'), td);
    body.append(tr);
  }
}

function rejoinQueue(row) {
  if (!window.confirm(`Let ${row.queue_label} rejoin at the end of the queue? The token number stays the same.`)) return;
  tokenAction(`/api/reception/tokens/${row.id}/rejoin`, 'Patient rejoined the queue at the end.');
}

// ---------- Activity ----------

function renderAudit(entries) {
  const body = $('audit-rows');
  emptyRow(body, $('audit-empty'), entries.length);
  for (const e of entries) {
    const label = ACTION_LABEL[e.action] || e.action;
    const token = e.detail && e.detail.token ? e.detail.token : '';
    const tr = document.createElement('tr');
    tr.append(cell(formatTime(e.at), 'Time'), cell(e.actor, 'Who'), cell(label, 'Action'), cell(token, 'Token'));
    body.append(tr);
  }
}

// ---------- Load and refresh ----------

async function load() {
  try {
    const board = await call('/api/reception/board');
    renderPending(board.pending);
    renderWaiting(board.waiting);
    renderQueues(board.doctors);
    renderMissed(board.missed);
    renderAudit(board.audit);
  } catch (err) {
    report(err.message, 'error');
  }
}

$('logout').addEventListener('click', async () => {
  await fetch('/api/auth/logout', { method: 'POST' });
  window.location.href = '/login.html';
});

(async () => {
  try {
    const me = await api('/api/auth/me');
    if (me.role !== 'receptionist') throw new Error('wrong role');
    $('who').textContent = me.name;
  } catch {
    window.location.href = '/login.html';
    return;
  }
  load();
  setInterval(load, 10000);
})();
