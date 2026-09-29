/**
 * Shared UI helpers: DOM shortcuts, formatting, toasts, dialogs and confirms.
 */

export const $ = (sel, root = document) => root.querySelector(sel);
export const $$ = (sel, root = document) => Array.from(root.querySelectorAll(sel));

export const STATUSES = ['Applied', 'Interviewing', 'Offered', 'Accepted', 'Rejected', 'Withdrawn'];

export const STATUS_COLORS = {
  Applied: 'var(--st-applied)',
  Interviewing: 'var(--st-interviewing)',
  Offered: 'var(--st-offered)',
  Accepted: 'var(--st-accepted)',
  Rejected: 'var(--st-rejected)',
  Withdrawn: 'var(--st-withdrawn)',
};

/** Escape text for safe interpolation into HTML. */
export function esc(value) {
  if (value === null || value === undefined) return '';
  return String(value)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

/** Only allow http(s) links to be rendered as hrefs. */
export function safeUrl(value) {
  try {
    const url = new URL(value);
    return url.protocol === 'http:' || url.protocol === 'https:' ? url.href : null;
  } catch {
    return null;
  }
}

export function icon(name, cls = '') {
  return `<svg class="icon ${cls}" aria-hidden="true"><use href="#i-${name}"/></svg>`;
}

export function pill(status) {
  return `<span class="tag" data-status="${esc(status)}">${esc(status)}</span>`;
}

/** Group statuses into the "My jobs" tabs. */
export const STATUS_GROUPS = [
  { key: 'all', label: 'All jobs', statuses: null },
  { key: 'applied', label: 'Applied', statuses: ['Applied'] },
  { key: 'interviewing', label: 'Interviewing', statuses: ['Interviewing'] },
  { key: 'offers', label: 'Offers', statuses: ['Offered', 'Accepted'] },
  { key: 'archived', label: 'Archived', statuses: ['Rejected', 'Withdrawn'] },
];

// ---------- Company logo ----------
const LOGO_COLORS = ['#4f46e5', '#0891b2', '#059669', '#d97706', '#dc2626', '#7c3aed', '#db2777', '#2563eb', '#0d9488', '#9333ea'];

export function logo(company, cls = '') {
  const name = (company || '?').trim();
  let hash = 0;
  for (const ch of name) hash = (hash * 31 + ch.charCodeAt(0)) >>> 0;
  const color = LOGO_COLORS[hash % LOGO_COLORS.length];
  return `<span class="logo ${cls}" style="background:${color}" aria-hidden="true">${esc(name.charAt(0).toUpperCase())}</span>`;
}

export function initials(nameOrEmail) {
  const s = (nameOrEmail || '').trim();
  if (!s) return '?';
  if (s.includes('@') && !s.includes(' ')) return s.slice(0, 2).toUpperCase();
  const parts = s.split(/\s+/).filter(Boolean);
  return ((parts[0]?.[0] || '') + (parts.length > 1 ? parts[parts.length - 1][0] : '')).toUpperCase();
}

// ---------- Formatting ----------
const dateFmt = new Intl.DateTimeFormat(undefined, { day: 'numeric', month: 'short', year: 'numeric' });
const dateTimeFmt = new Intl.DateTimeFormat(undefined, { day: 'numeric', month: 'short', year: 'numeric', hour: 'numeric', minute: '2-digit' });
const timeFmt = new Intl.DateTimeFormat(undefined, { hour: 'numeric', minute: '2-digit' });
const monthFmt = new Intl.DateTimeFormat(undefined, { month: 'short' });
const relFmt = new Intl.RelativeTimeFormat(undefined, { numeric: 'auto' });

export function toDate(value) {
  if (!value) return null;
  const d = new Date(value);
  return isNaN(d.getTime()) ? null : d;
}

export const fmtDate = (v) => (toDate(v) ? dateFmt.format(toDate(v)) : '—');
export const fmtDateTime = (v) => (toDate(v) ? dateTimeFmt.format(toDate(v)) : '—');
export const fmtTime = (v) => (toDate(v) ? timeFmt.format(toDate(v)) : '');
export const fmtMonth = (v) => (toDate(v) ? monthFmt.format(toDate(v)) : '');

export function fmtRelative(value) {
  const d = toDate(value);
  if (!d) return '';
  const diffSec = (d.getTime() - Date.now()) / 1000;
  const units = [
    ['year', 31536000], ['month', 2592000], ['week', 604800], ['day', 86400], ['hour', 3600], ['minute', 60],
  ];
  for (const [unit, secs] of units) {
    if (Math.abs(diffSec) >= secs) return relFmt.format(Math.round(diffSec / secs), unit);
  }
  return 'just now';
}

export function fmtMoney(amount, currency = 'USD', compact = false) {
  if (amount === null || amount === undefined || amount === '') return '';
  try {
    return new Intl.NumberFormat(undefined, {
      style: 'currency',
      currency: currency || 'USD',
      maximumFractionDigits: compact ? 1 : 0,
      notation: compact ? 'compact' : 'standard',
    }).format(amount);
  } catch {
    return `${currency || ''} ${Number(amount).toLocaleString()}`.trim();
  }
}

export function fmtSalaryRange(app, compact = false) {
  const { salaryMin: min, salaryMax: max, currency } = app;
  const hasMin = typeof min === 'number';
  const hasMax = typeof max === 'number';
  if (hasMin && hasMax) return min === max ? fmtMoney(min, currency, compact) : `${fmtMoney(min, currency, compact)} – ${fmtMoney(max, currency, compact)}`;
  if (hasMin) return `${fmtMoney(min, currency, compact)}+`;
  if (hasMax) return `Up to ${fmtMoney(max, currency, compact)}`;
  return '';
}

/** Portal-style pay text, e.g. "$150K – $180K a year". */
export function fmtPay(app, compact = false) {
  const range = fmtSalaryRange(app, compact);
  return range ? `${range} a year` : '';
}

export function fmtBytesName(name) {
  const ext = (name || '').split('.').pop()?.toUpperCase();
  return ext && ext.length <= 4 ? ext : 'FILE';
}

/** Value for <input type="date"> in local time. */
export function toDateInput(value) {
  const d = toDate(value) ?? new Date();
  const pad = (n) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}

/** Value for <input type="datetime-local"> in local time. */
export function toDateTimeInput(value) {
  const d = toDate(value);
  if (!d) return '';
  const pad = (n) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

// ---------- Toasts ----------
export function toast(message, type = 'success', timeout = 3500) {
  const host = $('#toasts');
  const el = document.createElement('div');
  el.className = `toast toast--${type}`;
  el.setAttribute('role', type === 'error' ? 'alert' : 'status');
  el.innerHTML = `${icon(type === 'error' ? 'alert' : 'check')}<span></span>`;
  el.querySelector('span').textContent = message;
  host.appendChild(el);
  // Keep at most three toasts on screen
  while (host.children.length > 3) host.firstElementChild.remove();
  setTimeout(() => {
    el.classList.add('is-leaving');
    setTimeout(() => el.remove(), 220);
  }, timeout);
}

// ---------- Inline alerts & busy buttons ----------
export function showError(el, message) {
  if (!el) return;
  el.textContent = message;
  el.hidden = !message;
}

export async function withBusy(button, fn) {
  if (!button) return fn();
  button.classList.add('is-loading');
  button.disabled = true;
  try {
    return await fn();
  } finally {
    button.classList.remove('is-loading');
    button.disabled = false;
  }
}

// ---------- Dialogs ----------
export function openDialog(dialog) {
  if (!dialog.open) dialog.showModal();
}

export function closeDialog(dialog) {
  if (dialog.open) dialog.close();
}

/** Wire generic close behaviour: [data-close] buttons and backdrop clicks. */
export function initDialogs() {
  for (const dialog of $$('dialog')) {
    dialog.addEventListener('click', (e) => {
      if (e.target.closest('[data-close]')) {
        closeDialog(dialog);
        return;
      }
      // Clicking the backdrop (the dialog element itself, outside its content box)
      if (e.target === dialog) {
        const r = dialog.getBoundingClientRect();
        const inside = e.clientX >= r.left && e.clientX <= r.right && e.clientY >= r.top && e.clientY <= r.bottom;
        if (!inside || dialog.classList.contains('drawer')) closeDialog(dialog);
      }
    });
  }
}

/**
 * Promise-based confirmation dialog.
 * @param {{ title: string, message: string, confirmLabel?: string, requireText?: string }} opts
 */
export function confirmAction({ title, message, confirmLabel = 'Delete', requireText }) {
  const dialog = $('#confirmDialog');
  const ok = $('#confirmOk');
  const inputField = $('#confirmInputField');
  const input = $('#confirmInput');

  $('#confirmTitle').textContent = title;
  $('#confirmMessage').textContent = message;
  ok.textContent = confirmLabel;
  inputField.hidden = !requireText;
  input.value = '';
  ok.disabled = Boolean(requireText);
  if (requireText) $('#confirmInputLabel').textContent = `Type "${requireText}" to confirm`;

  const onInput = () => { ok.disabled = input.value.trim() !== requireText; };
  input.addEventListener('input', onInput);

  return new Promise((resolve) => {
    dialog.returnValue = '';
    dialog.addEventListener(
      'close',
      () => {
        input.removeEventListener('input', onInput);
        resolve(dialog.returnValue === 'ok');
      },
      { once: true }
    );
    dialog.showModal();
    (requireText ? input : $('#confirmCancel')).focus();
  });
}
