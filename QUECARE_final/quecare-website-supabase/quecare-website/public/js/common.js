// common.js - shared helpers and the accessibility controls. Loaded on every page.
// Text is always set with textContent (never innerHTML) to prevent XSS.
(function () {
  const KEY = 'quecare-display';
  const STATUS_LABEL = {
    WAITING_LIST: 'Waiting list',
    PENDING_CONFIRMATION: 'Pending confirmation',
    CONFIRMED: 'Confirmed',
    CALLED: 'Called',
    MISSED: 'Missed',
    TREATED: 'Completed',
    CANCELLED: 'Cancelled',
    REJECTED: 'Rejected',
  };

  // ----- Display settings (text size and high contrast), remembered on this device -----
  function loadSettings() {
    try {
      return JSON.parse(localStorage.getItem(KEY)) || {};
    } catch {
      return {};
    }
  }
  const settings = Object.assign({ size: 0, contrast: false }, loadSettings());

  function applySettings() {
    const root = document.documentElement;
    root.dataset.size = String(settings.size);
    root.dataset.contrast = settings.contrast ? 'high' : 'normal';
  }

  function saveSettings() {
    try {
      localStorage.setItem(KEY, JSON.stringify(settings));
    } catch {
      /* private mode: settings simply last for this visit */
    }
  }

  function makeButton(label, aria, onClick) {
    const b = document.createElement('button');
    b.type = 'button';
    b.textContent = label;
    b.setAttribute('aria-label', aria);
    b.addEventListener('click', onClick);
    return b;
  }

  function buildToolbar() {
    const header = document.querySelector('header.top');
    if (!header) return;
    const bar = document.createElement('div');
    bar.className = 'a11y';
    bar.setAttribute('role', 'group');
    bar.setAttribute('aria-label', 'Display settings');

    const smaller = makeButton('A-', 'Smaller text', () => {
      settings.size = Math.max(0, settings.size - 1);
      applyAndSave();
    });
    const normal = makeButton('A', 'Default text size', () => {
      settings.size = 0;
      applyAndSave();
    });
    const larger = makeButton('A+', 'Larger text', () => {
      settings.size = Math.min(2, settings.size + 1);
      applyAndSave();
    });
    const contrast = makeButton('High contrast', 'High contrast', () => {
      settings.contrast = !settings.contrast;
      applyAndSave();
    });
    contrast.id = 'contrast-toggle';
    bar.append(smaller, normal, larger, contrast);
    header.append(bar);
    syncToolbar();
  }

  function syncToolbar() {
    const toggle = document.getElementById('contrast-toggle');
    if (toggle) toggle.setAttribute('aria-pressed', String(settings.contrast));
  }

  function applyAndSave() {
    applySettings();
    saveSettings();
    syncToolbar();
  }

  // Skip link and a main landmark id, so keyboard users can jump past the header.
  function addSkipLink() {
    const main = document.querySelector('main');
    if (main && !main.id) main.id = 'main';
    if (!document.querySelector('.skip') && main) {
      const skip = document.createElement('a');
      skip.className = 'skip';
      skip.href = '#main';
      skip.textContent = 'Skip to content';
      document.body.prepend(skip);
    }
  }

  // ----- Shared helpers -----

  // Calls the API. Throws an Error that also carries .status and .code (for example CAPACITY_FULL).
  async function api(url, options = {}) {
    const res = await fetch(url, { headers: { 'Content-Type': 'application/json' }, ...options });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) {
      const err = new Error(data.error || 'Something went wrong. Please try again.');
      err.status = res.status;
      err.code = data.code || null;
      throw err;
    }
    return data;
  }

  // Shows a message box. role=status is announced by screen readers.
  function show(el, text, type) {
    el.textContent = text;
    el.className = `msg ${type} show`;
    el.setAttribute('role', type === 'error' ? 'alert' : 'status');
  }

  // A table cell. The label is used on small screens, where the table becomes a stack of cards.
  function cell(text, label) {
    const td = document.createElement('td');
    td.textContent = text;
    if (label) td.dataset.label = label;
    return td;
  }

  function formatTime(iso) {
    if (!iso) return '';
    return new Date(iso).toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit' });
  }

  window.QC = {
    api,
    show,
    cell,
    formatTime,
    STATUS_LABEL,
    $: (id) => document.getElementById(id),
  };

  applySettings();
  document.addEventListener('DOMContentLoaded', () => {
    addSkipLink();
    buildToolbar();
  });
})();
