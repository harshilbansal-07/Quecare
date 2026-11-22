const $ = QC.$;
const { api, show, cell, STATUS_LABEL } = QC;

function report(text, type) {
  show($('msg'), text, type);
}

async function call(url, options) {
  try {
    return await api(url, options);
  } catch (err) {
    if (err.status === 401 || err.status === 403) window.location.href = '/login.html';
    throw err;
  }
}

function statusText(row) {
  if (row.status === 'CALLED' && row.flagged) return 'Called, not yet arrived';
  if (row.status === 'CALLED' && row.present) return 'Called, present';
  return STATUS_LABEL[row.status] || row.status;
}

function render(data) {
  $('capacity').textContent = `Today: ${data.capacity.used} of ${data.capacity.limit} slots used.`;
  const queue = data.queue;
  const rows = $('rows');
  rows.innerHTML = '';
  $('empty').hidden = queue.length > 0;

  for (const row of queue) {
    const tr = document.createElement('tr');
    if (row.emergency) tr.className = 'is-emergency';

    const actions = document.createElement('td');
    actions.className = 'actions';
    const callBtn = document.createElement('button');
    callBtn.type = 'button';
    callBtn.textContent = 'Call';
    callBtn.className = 'small';
    callBtn.disabled = !row.can_call;
    callBtn.addEventListener('click', () => act(`/api/doctor/tokens/${row.id}/call`, 'Patient called.'));

    const done = document.createElement('button');
    done.type = 'button';
    done.textContent = 'Treated';
    done.className = 'small secondary';
    done.disabled = !row.can_treat;
    done.addEventListener('click', () => act(`/api/doctor/tokens/${row.id}/treated`, 'Visit marked as complete.'));
    actions.append(callBtn, done);

    const statusCell = cell('', 'Status');
    const span = document.createElement('span');
    span.className = `status s-${row.status === 'CALLED' ? 'called' : 'confirmed'}`;
    span.textContent = statusText(row);
    statusCell.append(span);
    if (row.emergency) {
      const tag = document.createElement('span');
      tag.className = 'tag emerg';
      tag.textContent = 'Emergency priority';
      statusCell.append(document.createTextNode(' '), tag);
    }

    tr.append(cell(String(row.queue_position), 'Position'), cell(row.queue_label, 'Token'), cell(row.patient_name, 'Patient'), statusCell, actions);
    rows.append(tr);
  }
}

async function load() {
  try {
    render(await call('/api/doctor/queue'));
  } catch (err) {
    report(err.message, 'error');
  }
}

async function act(url, okText) {
  try {
    await call(url, { method: 'POST' });
    report(okText, 'ok');
  } catch (err) {
    report(err.message, 'error');
  }
  await load();
}

$('logout').addEventListener('click', async () => {
  await fetch('/api/auth/logout', { method: 'POST' });
  window.location.href = '/login.html';
});

(async () => {
  try {
    const me = await api('/api/auth/me');
    if (me.role !== 'doctor') throw new Error('wrong role');
    $('who').textContent = me.name;
  } catch {
    window.location.href = '/login.html';
    return;
  }
  load();
  setInterval(load, 10000);
})();
