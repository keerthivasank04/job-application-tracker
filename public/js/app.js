import { api, auth, ApiError } from './api.js';
import {
  $, $$, STATUSES, STATUS_GROUPS, esc, safeUrl, icon, pill, logo, initials,
  fmtDate, fmtDateTime, fmtTime, fmtMonth, fmtRelative, fmtPay, fmtBytesName,
  toDate, toDateInput, toDateTimeInput, toast, showError, withBusy,
  openDialog, closeDialog, initDialogs, confirmAction,
} from './ui.js';

// ============================================================================
// State
// ============================================================================

const DEFAULT_FILTERS = () => ({ what: '', where: '', tab: 'all', date: '', pay: '', resume: '', interview: '', sort: 'recent' });

const state = {
  user: null,
  applications: [],
  interviews: [],
  stats: null,
  view: 'jobs',
  filters: DEFAULT_FILTERS(),
  selectedId: null,
  detailInterviews: [],
  detailHistory: [],
  authMode: 'login',
  loaded: false,
};

const byId = (id) => state.applications.find((a) => a.id === Number(id));
const isDesktop = () => window.matchMedia('(min-width: 961px)').matches;
const DAY = 864e5;

// ============================================================================
// Theme
// ============================================================================

const THEME_KEY = 'jt.theme';

function currentTheme() {
  const explicit = document.documentElement.dataset.theme;
  if (explicit) return explicit;
  return window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light';
}

function applyTheme(theme) {
  if (theme) document.documentElement.dataset.theme = theme;
  const isDark = currentTheme() === 'dark';
  $('#themeToggle use').setAttribute('href', isDark ? '#i-sun' : '#i-moon');
  $('#themeToggle span').textContent = isDark ? 'Light theme' : 'Dark theme';
}

function initTheme() {
  let saved = null;
  try { saved = localStorage.getItem(THEME_KEY); } catch { /* storage unavailable */ }
  applyTheme(saved === 'dark' || saved === 'light' ? saved : null);
}

function toggleTheme() {
  const next = currentTheme() === 'dark' ? 'light' : 'dark';
  try { localStorage.setItem(THEME_KEY, next); } catch { /* ignore */ }
  applyTheme(next);
}

// ============================================================================
// Auth screens
// ============================================================================

function showAuth() {
  $('#appView').hidden = true;
  $('#authView').hidden = false;
  document.title = 'Sign in | Job Tracker';
  showResetPanel(false);
  setAuthMode(state.authMode);
  setTimeout(() => $('#authEmail').focus(), 0);
}

function setAuthMode(mode) {
  state.authMode = mode;
  const signup = mode === 'signup';
  $('#tabLogin').setAttribute('aria-selected', String(!signup));
  $('#tabSignup').setAttribute('aria-selected', String(signup));
  $('#nameField').hidden = !signup;
  $('#forgotLink').hidden = signup;
  $('#passwordHint').hidden = !signup;
  $('#authTitle').textContent = signup ? 'Create your account' : 'Ready to take the next step?';
  $('#authSubtitle').textContent = signup
    ? 'Track every application, interview and offer in one place.'
    : 'Sign in to keep track of every job you apply for.';
  $('#authSubmit').textContent = signup ? 'Create account' : 'Sign in';
  $('#authPassword').setAttribute('autocomplete', signup ? 'new-password' : 'current-password');
  showError($('#authError'), '');
}

function showResetPanel(show) {
  $('#authPanelMain').hidden = show;
  $('#authPanelReset').hidden = !show;
  if (show) {
    $('#forgotForm').hidden = false;
    $('#resetForm').hidden = true;
    $('#resetSubtitle').textContent = "Enter your account email and we'll send you a reset code.";
    $('#forgotEmail').value = $('#authEmail').value;
    showError($('#forgotError'), '');
    showError($('#resetError'), '');
    setTimeout(() => $('#forgotEmail').focus(), 0);
  }
}

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

function bindAuth() {
  $$('[data-auth-mode]').forEach((btn) => btn.addEventListener('click', () => setAuthMode(btn.dataset.authMode)));

  $$('[data-toggle-password]').forEach((btn) =>
    btn.addEventListener('click', () => {
      const input = document.getElementById(btn.dataset.togglePassword);
      const show = input.type === 'password';
      input.type = show ? 'text' : 'password';
      btn.textContent = show ? 'Hide' : 'Show';
      btn.setAttribute('aria-label', show ? 'Hide password' : 'Show password');
    })
  );

  $('#demoLink').addEventListener('click', () => {
    setAuthMode('login');
    $('#authEmail').value = 'demo@jobtracker.dev';
    $('#authPassword').value = 'DemoPassword123';
    $('#authForm').requestSubmit();
  });

  $('#authForm').addEventListener('submit', async (e) => {
    e.preventDefault();
    const errorEl = $('#authError');
    const email = $('#authEmail').value.trim();
    const password = $('#authPassword').value;
    const name = $('#authName').value.trim();

    if (!EMAIL_RE.test(email)) return showError(errorEl, 'Please enter a valid email address.');
    if (password.length < 8) return showError(errorEl, 'Password must be at least 8 characters.');
    showError(errorEl, '');

    await withBusy($('#authSubmit'), async () => {
      try {
        if (state.authMode === 'signup') {
          await api.signup(email, password, name || undefined);
        }
        const { token } = await api.login(email, password);
        auth.token = token;
        const wasSignup = state.authMode === 'signup';
        $('#authPassword').value = '';
        $('#authName').value = '';
        state.authMode = 'login';
        await startSession();
        if (wasSignup) toast('Account created. Welcome aboard!');
      } catch (err) {
        showError(errorEl, err.message);
      }
    });
  });

  $('#forgotLink').addEventListener('click', () => showResetPanel(true));
  $('#backToLogin').addEventListener('click', () => showResetPanel(false));

  $('#forgotForm').addEventListener('submit', async (e) => {
    e.preventDefault();
    const email = $('#forgotEmail').value.trim();
    if (!EMAIL_RE.test(email)) return showError($('#forgotError'), 'Please enter a valid email address.');
    showError($('#forgotError'), '');

    await withBusy(e.submitter, async () => {
      try {
        const res = await api.forgotPassword(email);
        $('#forgotForm').hidden = true;
        $('#resetForm').hidden = false;
        $('#resetSubtitle').textContent = `If ${email} has an account, a reset code is on its way.`;
        const info = $('#resetInfo');
        if (res?.devResetToken) {
          $('#resetToken').value = res.devResetToken;
          info.textContent = 'Development mode: email delivery is simulated, so the reset code has been filled in for you.';
        } else {
          info.textContent = 'Paste the reset code from the email and choose a new password. The code expires in 1 hour.';
        }
        $('#resetPassword').focus();
      } catch (err) {
        showError($('#forgotError'), err.message);
      }
    });
  });

  $('#resetForm').addEventListener('submit', async (e) => {
    e.preventDefault();
    const token = $('#resetToken').value.trim();
    const pw = $('#resetPassword').value;
    if (!token) return showError($('#resetError'), 'Enter the reset code.');
    if (pw.length < 8) return showError($('#resetError'), 'Password must be at least 8 characters.');
    showError($('#resetError'), '');

    await withBusy(e.submitter, async () => {
      try {
        await api.resetPassword(token, pw);
        $('#authEmail').value = $('#forgotEmail').value;
        $('#resetPassword').value = '';
        $('#resetToken').value = '';
        showResetPanel(false);
        setAuthMode('login');
        toast('Password updated. Sign in with your new password.');
        $('#authPassword').focus();
      } catch (err) {
        showError($('#resetError'), err.message);
      }
    });
  });
}

// ============================================================================
// Session
// ============================================================================

async function startSession() {
  try {
    state.user = await api.profile();
  } catch (err) {
    if (err instanceof ApiError && (err.status === 401 || err.status === 404)) {
      auth.clear();
      showAuth();
      return;
    }
    showAuth();
    showError($('#authError'), err.message);
    return;
  }

  $('#authView').hidden = true;
  $('#appView').hidden = false;
  renderUser();
  setView(viewFromHash(), false);
  renderLoading();
  await refreshData();
}

function renderUser() {
  const u = state.user;
  $('#userAvatar').textContent = initials(u.name || u.email);
  $('#userName').textContent = u.name || 'Your account';
  $('#userEmail').textContent = u.email;
}

function signOut(message) {
  auth.clear();
  Object.assign(state, {
    user: null, applications: [], interviews: [], stats: null, loaded: false,
    selectedId: null, authMode: 'login', filters: DEFAULT_FILTERS(),
  });
  syncFilterControls();
  closeSheet();
  $$('dialog[open]').forEach((d) => d.close());
  $('#userMenu').hidden = true;
  showAuth();
  if (message) toast(message, 'error');
}

window.addEventListener('auth:expired', () => {
  if (state.user) signOut('Your session has expired. Please sign in again.');
});

// ============================================================================
// Data loading
// ============================================================================

async function refreshData() {
  try {
    const [stats, applications, interviews] = await Promise.all([
      api.stats(),
      api.listAllApplications(),
      api.allInterviews(),
    ]);
    state.stats = stats;
    state.applications = applications;
    state.interviews = interviews;
    state.loaded = true;
    detailStale = true;
    if (state.selectedId && !byId(state.selectedId)) state.selectedId = null;
    renderAll();
  } catch (err) {
    if (err.status !== 401) toast(err.message, 'error');
  }
}

// ============================================================================
// Derived data
// ============================================================================

function upcomingInterviews() {
  const now = Date.now();
  return state.interviews
    .filter((i) => i.status === 'Scheduled' && (toDate(i.scheduledDate)?.getTime() ?? 0) >= now)
    .sort((a, b) => toDate(a.scheduledDate) - toDate(b.scheduledDate));
}

function interviewsFor(appId) {
  return state.interviews.filter((i) => i.applicationId === appId);
}

function nextInterviewFor(appId) {
  return upcomingInterviews().find((i) => i.applicationId === appId) || null;
}

/** Applications matching the search box and filter pills (ignores the status tab). */
function searchMatches() {
  const f = state.filters;
  const what = f.what.trim().toLowerCase();
  const where = f.where.trim().toLowerCase();
  const now = Date.now();

  return state.applications.filter((a) => {
    if (what && ![a.company, a.role, a.notes].some((v) => v && v.toLowerCase().includes(what))) return false;
    if (where && !(a.jobLocation || '').toLowerCase().includes(where)) return false;
    if (f.date && (toDate(a.appliedDate)?.getTime() ?? 0) < now - Number(f.date) * DAY) return false;
    const hasPay = typeof a.salaryMin === 'number' || typeof a.salaryMax === 'number';
    if (f.pay === 'with' && !hasPay) return false;
    if (f.pay === 'without' && hasPay) return false;
    if (f.resume === 'with' && !a.resumeOriginalName) return false;
    if (f.resume === 'without' && a.resumeOriginalName) return false;
    if (f.interview) {
      const count = interviewsFor(a.id).length;
      if (f.interview === 'upcoming' && !nextInterviewFor(a.id)) return false;
      if (f.interview === 'any' && count === 0) return false;
      if (f.interview === 'none' && count > 0) return false;
    }
    return true;
  });
}

function inTab(app, tabKey) {
  const group = STATUS_GROUPS.find((g) => g.key === tabKey);
  return !group?.statuses || group.statuses.includes(app.status);
}

function sortApps(list) {
  const salary = (a) => a.salaryMax ?? a.salaryMin ?? -1;
  const time = (a) => toDate(a.appliedDate)?.getTime() ?? 0;
  const sorters = {
    recent: (a, b) => time(b) - time(a) || b.id - a.id,
    company: (a, b) => a.company.localeCompare(b.company, undefined, { sensitivity: 'base' }) || time(b) - time(a),
    salary: (a, b) => salary(b) - salary(a) || time(b) - time(a),
  };
  return [...list].sort(sorters[state.filters.sort] || sorters.recent);
}

function visibleApplications() {
  return sortApps(searchMatches().filter((a) => inTab(a, state.filters.tab)));
}

function filtersActive() {
  const f = state.filters;
  return Boolean(f.what || f.where || f.date || f.pay || f.resume || f.interview || f.tab !== 'all');
}

// ============================================================================
// Rendering
// ============================================================================

function renderAll() {
  renderBadges();
  if (state.view === 'jobs') renderJobs();
  else if (state.view === 'pipeline') renderBoard();
  else renderInterviews();
}

function renderBadges() {
  const upcoming = upcomingInterviews();
  const badge = $('#interviewBadge');
  badge.textContent = upcoming.length;
  badge.hidden = upcoming.length === 0;
}

function renderLoading() {
  $('#jobList').innerHTML = '<li class="skeleton"></li><li class="skeleton"></li><li class="skeleton"></li>';
  $('#board').innerHTML = STATUSES.map(
    (s) => `<div class="column"><div class="column-head"><span class="column-title">${s}</span></div>
      <div class="column-body"><div class="skeleton" style="height:84px"></div></div></div>`
  ).join('');
}

function renderInsights() {
  const s = state.stats;
  const el = $('#insights');
  if (!s || !s.totalApplications) { el.innerHTML = ''; return; }
  const upcoming = upcomingInterviews();
  const parts = [
    `<strong>${esc(s.interviewRate)}</strong> interview rate`,
    `<strong>${esc(s.offerRate)}</strong> offer rate`,
    upcoming.length
      ? `<strong>${upcoming.length}</strong> upcoming interview${upcoming.length === 1 ? '' : 's'}`
      : 'No upcoming interviews',
  ];
  el.innerHTML = parts.join('<span class="sep">|</span>');
}

function renderTabs(matches) {
  $('#statusTabs').innerHTML = STATUS_GROUPS.map((g) => {
    const count = matches.filter((a) => inTab(a, g.key)).length;
    const active = state.filters.tab === g.key;
    return `<button type="button" class="status-tab" data-tab="${g.key}" aria-pressed="${active}">
      <span class="count">${count}</span><span class="label">${g.label}</span></button>`;
  }).join('');
}

function jobCardHtml(a) {
  const pay = fmtPay(a, true);
  const rounds = interviewsFor(a.id).length;
  const next = nextInterviewFor(a.id);
  const soon = next && toDate(next.scheduledDate) - Date.now() < 2 * DAY;
  const firstNote = (a.notes || '').split('\n').map((l) => l.trim()).find(Boolean);
  const selected = a.id === state.selectedId;

  return `
    <li>
      <button type="button" class="job-card${selected ? ' is-selected' : ''}" data-app-id="${a.id}" aria-pressed="${selected}">
        <div class="job-card-tags">
          ${pill(a.status)}
          ${next ? `<span class="tag ${soon ? 'tag--soon' : ''}" data-status="Scheduled">${icon('calendar')}Interview ${esc(fmtRelative(next.scheduledDate))}</span>` : ''}
        </div>
        <div class="job-title">${esc(a.role)}</div>
        <div class="job-company">${esc(a.company)}</div>
        ${a.jobLocation ? `<div class="job-location">${esc(a.jobLocation)}</div>` : ''}
        ${pay || rounds || a.resumeOriginalName ? `<div class="chips">
          ${pay ? `<span class="chip chip--pay">${esc(pay)}</span>` : ''}
          ${rounds ? `<span class="chip">${rounds} interview round${rounds === 1 ? '' : 's'}</span>` : ''}
          ${a.resumeOriginalName ? `<span class="chip">${icon('file')}Resume</span>` : ''}
        </div>` : ''}
        ${firstNote ? `<ul class="job-snippet"><li>${esc(firstNote)}</li></ul>` : ''}
        <div class="job-meta"><span title="${esc(fmtDate(a.appliedDate))}">Applied ${esc(fmtRelative(a.appliedDate))}</span></div>
      </button>
    </li>`;
}

function renderJobs() {
  const hasAny = state.applications.length > 0;
  $('#emptyState').hidden = !(state.loaded && !hasAny);
  $('#jobsLayout').hidden = state.loaded && !hasAny;
  $('#statusTabs').hidden = state.loaded && !hasAny;
  $('.myjobs-head').hidden = state.loaded && !hasAny;
  if (!state.loaded) return;

  syncFilterControls();
  renderInsights();
  const matches = searchMatches();
  renderTabs(matches);

  const list = visibleApplications();
  $('#resultCount').textContent = `${list.length} job${list.length === 1 ? '' : 's'}${filtersActive() ? ' found' : ''}`;
  $$('#sortLinks .sort-link').forEach((b) => b.setAttribute('aria-pressed', String(b.dataset.sort === state.filters.sort)));

  $('#jobList').innerHTML = list.length
    ? list.map(jobCardHtml).join('')
    : `<li class="job-list-empty"><strong>No jobs match your search</strong>Try different keywords or <button type="button" class="link" data-action="clear-filters">clear all filters</button>.</li>`;

  // Keep a job selected on desktop, like a job portal's results page
  if (state.selectedId && !list.some((a) => a.id === state.selectedId) && isDesktop()) state.selectedId = null;
  if (!state.selectedId && isDesktop() && list.length) state.selectedId = list[0].id;
  $$('#jobList .job-card').forEach((c) => {
    const sel = Number(c.dataset.appId) === state.selectedId;
    c.classList.toggle('is-selected', sel);
    c.setAttribute('aria-pressed', String(sel));
  });
  renderDetail();
}

function renderBoard() {
  const apps = sortApps(state.applications);
  $('#board').innerHTML = STATUSES.map((status) => {
    const items = apps.filter((a) => a.status === status);
    return `
      <section class="column" data-status="${status}" aria-label="${status}">
        <header class="column-head">
          <span class="column-title"><span class="tag" data-status="${status}">${status}</span></span>
          <span class="column-count">${items.length}</span>
        </header>
        <div class="column-body">
          ${items.length
            ? items.map((a) => {
                const pay = fmtPay(a, true);
                return `<button type="button" class="board-card" draggable="true" data-app-id="${a.id}">
                  <span class="job-title">${esc(a.role)}</span>
                  <span class="job-company">${esc(a.company)}</span>
                  ${a.jobLocation ? `<span class="job-location">${esc(a.jobLocation)}</span>` : ''}
                  ${pay ? `<span class="chips"><span class="chip chip--pay">${esc(pay)}</span></span>` : ''}
                  <span class="job-meta"><span>Applied ${esc(fmtRelative(a.appliedDate))}</span></span>
                </button>`;
              }).join('')
            : `<div class="column-empty">Drop jobs here</div>`}
        </div>
      </section>`;
  }).join('');
}

function interviewItemHtml(i, { showCompany = true } = {}) {
  const link = safeUrl(i.meetingLink);
  const d = i.scheduledDate;
  return `
    <li class="interview-item" data-interview-id="${i.id}">
      <div class="interview-date"><span class="m">${esc(fmtMonth(d))}</span><span class="d">${toDate(d)?.getDate() ?? ''}</span><span class="t">${esc(fmtTime(d))}</span></div>
      <div class="interview-body">
        <div class="interview-title">${esc(i.roundName)} ${pill(i.status)}</div>
        ${showCompany ? `<div class="interview-sub"><button type="button" class="link" data-open-app="${i.applicationId}">${esc(i.role)}</button> at ${esc(i.company)}</div>` : ''}
        <div class="interview-sub">${esc(fmtDateTime(d))} · ${esc(fmtRelative(d))}${i.interviewer ? ` · ${esc(i.interviewer)}` : ''}</div>
        ${link ? `<div class="interview-sub"><a href="${esc(link)}" target="_blank" rel="noopener noreferrer">${icon('video')}Join meeting</a></div>` : ''}
        ${i.feedbackNotes ? `<div class="interview-notes">${esc(i.feedbackNotes)}</div>` : ''}
      </div>
      <div class="interview-actions">
        ${i.status === 'Scheduled' ? `<button type="button" class="icon-btn icon-btn--sm" data-int-action="complete" title="Mark as completed" aria-label="Mark as completed">${icon('check')}</button>` : ''}
        <button type="button" class="icon-btn icon-btn--sm" data-int-action="edit" title="Edit" aria-label="Edit interview">${icon('edit')}</button>
        <button type="button" class="icon-btn icon-btn--sm icon-btn--danger" data-int-action="delete" title="Delete" aria-label="Delete interview">${icon('trash')}</button>
      </div>
    </li>`;
}

function renderInterviews() {
  const upcoming = upcomingInterviews();
  const upcomingIds = new Set(upcoming.map((i) => i.id));
  const past = state.interviews
    .filter((i) => !upcomingIds.has(i.id))
    .sort((a, b) => toDate(b.scheduledDate) - toDate(a.scheduledDate));

  $('#upcomingList').innerHTML = upcoming.length
    ? upcoming.map((i) => interviewItemHtml(i)).join('')
    : `<li class="list-empty">No upcoming interviews. Open a job and choose <strong>Add round</strong> to schedule one.</li>`;
  $('#pastList').innerHTML = past.length
    ? past.map((i) => interviewItemHtml(i)).join('')
    : `<li class="list-empty">Completed and cancelled rounds will appear here.</li>`;
}

// ============================================================================
// Detail pane
// ============================================================================

// Interviews + history for the selected job are fetched lazily and re-fetched
// whenever the underlying data changes (detailStale) or another job is selected.
let detailLoadedFor = null;
let detailStale = true;

function renderDetail() {
  const app = byId(state.selectedId);
  $('#detailPlaceholder').hidden = Boolean(app);
  $('#detailContent').hidden = !app;
  if (!app) { closeSheet(); return; }

  $('#detailLogo').outerHTML = logo(app.company, 'logo--lg').replace('class="logo', 'id="detailLogo" class="logo');
  $('#detailTitle').textContent = app.role;

  const url = safeUrl(app.jobPostUrl);
  $('#detailCompany').innerHTML = url
    ? `<a href="${esc(url)}" target="_blank" rel="noopener noreferrer">${esc(app.company)}</a>`
    : esc(app.company);
  $('#detailLocation').textContent = app.jobLocation || '';
  $('#detailLocation').hidden = !app.jobLocation;
  const pay = fmtPay(app);
  $('#detailSalary').textContent = pay;
  $('#detailSalary').hidden = !pay;

  const apply = $('#detailApply');
  apply.hidden = !url;
  if (url) apply.href = url;

  $('#detailStatus').innerHTML = STATUSES.map((s) => `<option ${s === app.status ? 'selected' : ''}>${s}</option>`).join('');

  const rows = [
    ['money', 'Pay', pay ? `<div class="chips"><span class="chip chip--pay">${esc(pay)}</span></div>` : '<div class="value">Not listed</div>'],
    ['flag', 'Status', `<div class="chips">${pill(app.status)}</div>`],
    ['calendar', 'Date applied', `<div class="value">${esc(fmtDate(app.appliedDate))} (${esc(fmtRelative(app.appliedDate))})</div>`],
    ['pin', 'Location', `<div class="value">${esc(app.jobLocation || 'Not specified')}</div>`],
  ];
  if (url) rows.push(['external', 'Job posting', `<div class="value"><a href="${esc(url)}" target="_blank" rel="noopener noreferrer">${esc(new URL(url).hostname.replace(/^www\./, ''))}</a></div>`]);
  $('#detailFacts').innerHTML = rows
    .map(([ic, title, body]) => `<div class="detail-row">${icon(ic)}<div><div class="detail-row-title">${title}</div>${body}</div></div>`)
    .join('');

  $('#detailNotesSection').hidden = !app.notes;
  $('#detailNotes').textContent = app.notes || '';

  renderResume(app);

  state.detailInterviews = interviewsFor(app.id).map((i) => ({ ...i, company: app.company, role: app.role }));
  if (detailLoadedFor !== app.id) {
    state.detailHistory = null;
    detailLoadedFor = app.id;
    detailStale = true;
  }
  if (detailStale) {
    detailStale = false;
    loadDetailExtras();
  }
  renderDetailInterviews();
  renderHistory();
}

async function loadDetailExtras() {
  const id = state.selectedId;
  if (!id) return;
  try {
    const [history, interviews] = await Promise.all([api.history(id), api.applicationInterviews(id)]);
    if (state.selectedId !== id) return;
    const app = byId(id);
    state.detailHistory = history;
    state.detailInterviews = interviews.map((i) => ({ ...i, company: app?.company, role: app?.role }));
    renderDetailInterviews();
    renderHistory();
  } catch (err) {
    if (err.status !== 401) toast(err.message, 'error');
  }
}

function renderDetailInterviews() {
  const items = [...state.detailInterviews].sort((a, b) => toDate(a.scheduledDate) - toDate(b.scheduledDate));
  $('#detailInterviews').innerHTML = items.length
    ? items.map((i) => interviewItemHtml(i, { showCompany: false })).join('')
    : `<li class="list-empty">No interview rounds yet.</li>`;
}

function renderHistory() {
  const app = byId(state.selectedId);
  if (!state.detailHistory) {
    $('#detailHistory').innerHTML = `<li class="muted">Loading…</li>`;
    return;
  }
  const entries = [...state.detailHistory].reverse().map(
    (h) => `<li>
      <div class="tl-title">Status changed ${pill(h.fromStatus)} → ${pill(h.toStatus)}</div>
      <div class="tl-time">${esc(fmtDateTime(h.changedAt))}</div>
      ${h.notes ? `<div class="tl-note">${esc(h.notes)}</div>` : ''}
    </li>`
  );
  entries.push(`<li><div class="tl-title">Applied</div><div class="tl-time">${esc(fmtDateTime(app?.appliedDate))}</div></li>`);
  $('#detailHistory').innerHTML = entries.join('');
}

function renderResume(app) {
  const box = $('#detailResume');
  if (app.resumeOriginalName) {
    box.innerHTML = `
      <div class="resume-box">
        <span class="file-icon">${icon('file')}</span>
        <div class="file-meta">
          <div class="file-name" title="${esc(app.resumeOriginalName)}">${esc(app.resumeOriginalName)}</div>
          <div class="file-sub">${esc(fmtBytesName(app.resumeOriginalName))} · uploaded ${esc(fmtRelative(app.resumeUploadedAt))}</div>
        </div>
        <button type="button" class="btn btn--outline btn--sm" data-resume="download">${icon('download')}<span>Download</span></button>
        <button type="button" class="icon-btn icon-btn--sm" data-resume="replace" title="Replace" aria-label="Replace resume">${icon('upload')}</button>
        <button type="button" class="icon-btn icon-btn--sm icon-btn--danger" data-resume="delete" title="Remove" aria-label="Remove resume">${icon('trash')}</button>
      </div>`;
  } else {
    box.innerHTML = `
      <button type="button" class="dropzone" data-resume="replace">
        ${icon('upload')}
        <span><strong>Upload the resume you sent</strong> or drag and drop it here</span>
        <span class="hint">PDF, DOC or DOCX · up to 5 MB</span>
      </button>`;
  }
}

function selectJob(id, { scroll = false } = {}) {
  const app = byId(id);
  if (!app) return;
  if (state.view !== 'jobs') setView('jobs', false);
  // Make sure the job is visible in the list
  if (!visibleApplications().some((a) => a.id === app.id)) {
    state.filters = { ...DEFAULT_FILTERS(), sort: state.filters.sort };
  }
  state.selectedId = app.id;
  renderJobs();
  if (!isDesktop()) openSheet();
  $('.dp-body')?.scrollTo?.({ top: 0 });
  if (scroll) $(`.job-card[data-app-id="${app.id}"]`)?.scrollIntoView({ block: 'nearest' });
}

function openSheet() {
  $('#detailPane').classList.add('is-open');
  document.body.classList.add('sheet-open');
  $('#detailBack').focus();
}

function closeSheet() {
  const pane = $('#detailPane');
  if (!pane.classList.contains('is-open')) return;
  pane.classList.remove('is-open');
  document.body.classList.remove('sheet-open');
  $(`.job-card[data-app-id="${state.selectedId}"]`)?.focus();
}

async function uploadResume(file) {
  const app = byId(state.selectedId);
  if (!app || !file) return;
  if (!/\.(pdf|docx?)$/i.test(file.name)) return toast('Only PDF, DOC or DOCX files are allowed', 'error');
  if (file.size > 5 * 1024 * 1024) return toast('File is larger than 5 MB', 'error');

  $('#detailResume').innerHTML = `<div class="resume-box"><span class="file-icon">${icon('upload')}</span><div class="file-meta"><div class="file-name">${esc(file.name)}</div><div class="file-sub">Uploading…</div></div></div>`;
  try {
    await api.uploadResume(app.id, file);
    toast('Resume uploaded');
    await refreshData();
  } catch (err) {
    toast(err.message, 'error');
    renderResume(app);
  }
}

function bindDetail() {
  $('#detailStatus').addEventListener('change', async (e) => {
    const app = byId(state.selectedId);
    if (!app) return;
    await changeStatus(app, e.target.value);
  });
  $('#detailEdit').addEventListener('click', () => openAppForm(byId(state.selectedId)));
  $('#detailDelete').addEventListener('click', () => deleteApplication(byId(state.selectedId)));
  $('#addInterviewBtn').addEventListener('click', () => openInterviewForm(state.selectedId));
  $('#detailBack').addEventListener('click', closeSheet);

  const resumeInput = $('#resumeInput');
  resumeInput.addEventListener('change', () => {
    const file = resumeInput.files?.[0];
    resumeInput.value = '';
    uploadResume(file);
  });

  const box = $('#detailResume');
  box.addEventListener('click', async (e) => {
    const btn = e.target.closest('[data-resume]');
    const app = byId(state.selectedId);
    if (!btn || !app) return;
    const action = btn.dataset.resume;
    if (action === 'replace') resumeInput.click();
    if (action === 'download') {
      await withBusy(btn, async () => {
        try { await api.downloadResume(app.id, app.resumeOriginalName); } catch (err) { toast(err.message, 'error'); }
      });
    }
    if (action === 'delete') {
      const ok = await confirmAction({ title: 'Remove resume?', message: `"${app.resumeOriginalName}" will be removed from this job.`, confirmLabel: 'Remove' });
      if (!ok) return;
      try {
        await api.deleteResume(app.id);
        toast('Resume removed');
        await refreshData();
      } catch (err) {
        toast(err.message, 'error');
      }
    }
  });
  box.addEventListener('dragover', (e) => {
    if (!e.dataTransfer.types.includes('Files')) return;
    e.preventDefault();
    box.querySelector('.dropzone')?.classList.add('is-over');
  });
  box.addEventListener('dragleave', () => box.querySelector('.dropzone')?.classList.remove('is-over'));
  box.addEventListener('drop', (e) => {
    if (!e.dataTransfer.files?.length) return;
    e.preventDefault();
    uploadResume(e.dataTransfer.files[0]);
  });
}

// ============================================================================
// Views, search & filters
// ============================================================================

const VIEWS = ['jobs', 'pipeline', 'interviews'];
const VIEW_TITLES = { jobs: 'My jobs', pipeline: 'Pipeline', interviews: 'Interviews' };

function viewFromHash() {
  const v = location.hash.replace('#', '');
  return VIEWS.includes(v) ? v : 'jobs';
}

function setView(view, render = true) {
  state.view = view;
  $$('.nav-link').forEach((l) => (l.dataset.view === view ? l.setAttribute('aria-current', 'page') : l.removeAttribute('aria-current')));
  $('#jobsView').hidden = view !== 'jobs';
  $('#pipelineView').hidden = view !== 'pipeline';
  $('#interviewsView').hidden = view !== 'interviews';
  document.title = `${VIEW_TITLES[view]} | Job Tracker`;
  if (location.hash !== `#${view}`) history.replaceState(null, '', `#${view}`);
  if (view !== 'jobs') closeSheet();
  if (render && state.loaded) renderAll();
}

function syncFilterControls() {
  const f = state.filters;
  if (document.activeElement !== $('#searchWhat')) $('#searchWhat').value = f.what;
  if (document.activeElement !== $('#searchWhere')) $('#searchWhere').value = f.where;
  for (const [id, key] of [['#filterDate', 'date'], ['#filterPay', 'pay'], ['#filterResume', 'resume'], ['#filterInterview', 'interview']]) {
    $(id).value = f[key];
    $(id).classList.toggle('is-active', Boolean(f[key]));
  }
  $('#clearFilters').hidden = !(f.what || f.where || f.date || f.pay || f.resume || f.interview);
}

function updateFilters(patch) {
  Object.assign(state.filters, patch);
  if (state.loaded) renderJobs();
}

function bindShell() {
  window.addEventListener('hashchange', () => state.user && setView(viewFromHash()));

  // Search
  let timer;
  const liveSearch = () => {
    clearTimeout(timer);
    timer = setTimeout(() => updateFilters({ what: $('#searchWhat').value, where: $('#searchWhere').value }), 150);
  };
  $('#searchWhat').addEventListener('input', liveSearch);
  $('#searchWhere').addEventListener('input', liveSearch);
  $('#searchForm').addEventListener('submit', (e) => {
    e.preventDefault();
    clearTimeout(timer);
    updateFilters({ what: $('#searchWhat').value, where: $('#searchWhere').value });
    $('#jobList').scrollIntoView({ behavior: 'smooth', block: 'nearest' });
  });

  // Filter pills
  for (const [id, key] of [['#filterDate', 'date'], ['#filterPay', 'pay'], ['#filterResume', 'resume'], ['#filterInterview', 'interview']]) {
    $(id).addEventListener('change', (e) => {
      // Apply any search text still waiting on the debounce together with the filter
      clearTimeout(timer);
      updateFilters({ what: $('#searchWhat').value, where: $('#searchWhere').value, [key]: e.target.value });
    });
  }
  $('#clearFilters').addEventListener('click', () => updateFilters({ ...DEFAULT_FILTERS(), tab: state.filters.tab, sort: state.filters.sort }));

  // Tabs & sorting
  $('#statusTabs').addEventListener('click', (e) => {
    const tab = e.target.closest('[data-tab]');
    if (tab) { clearTimeout(timer); updateFilters({ what: $('#searchWhat').value, where: $('#searchWhere').value, tab: tab.dataset.tab }); }
  });
  $('#sortLinks').addEventListener('click', (e) => {
    const b = e.target.closest('[data-sort]');
    if (b) updateFilters({ sort: b.dataset.sort });
  });

  // Job list
  const jobList = $('#jobList');
  jobList.addEventListener('click', (e) => {
    if (e.target.closest('[data-action="clear-filters"]')) {
      updateFilters({ ...DEFAULT_FILTERS(), sort: state.filters.sort });
      return;
    }
    const card = e.target.closest('.job-card');
    if (card) selectJob(Number(card.dataset.appId));
  });
  jobList.addEventListener('keydown', (e) => {
    if (e.key !== 'ArrowDown' && e.key !== 'ArrowUp') return;
    const cards = $$('.job-card', jobList);
    const idx = cards.indexOf(document.activeElement);
    if (idx === -1) return;
    e.preventDefault();
    const next = cards[Math.max(0, Math.min(cards.length - 1, idx + (e.key === 'ArrowDown' ? 1 : -1)))];
    next.focus();
    if (isDesktop()) selectJob(Number(next.dataset.appId));
  });

  // New application
  $('#newAppBtn').addEventListener('click', () => openAppForm());
  document.addEventListener('click', (e) => {
    if (e.target.closest('[data-action="new-application"]')) openAppForm();
  });

  // User menu
  const menuBtn = $('#userMenuBtn');
  const menu = $('#userMenu');
  const setMenu = (open) => { menu.hidden = !open; menuBtn.setAttribute('aria-expanded', String(open)); };
  menuBtn.addEventListener('click', (e) => { e.stopPropagation(); setMenu(menu.hidden); });
  document.addEventListener('click', (e) => { if (!e.target.closest('.menu')) setMenu(false); });
  menu.addEventListener('click', async (e) => {
    const action = e.target.closest('[data-action]')?.dataset.action;
    if (!action) return;
    if (action === 'toggle-theme') { toggleTheme(); return; }
    setMenu(false);
    if (action === 'logout') { signOut(); toast('Signed out'); }
    if (action === 'open-profile') openProfile();
    if (action === 'export') {
      try { await api.exportCsv(); toast('Your jobs were exported as CSV'); } catch (err) { toast(err.message, 'error'); }
    }
  });

  // Pipeline board: open, drag & drop
  const board = $('#board');
  board.addEventListener('click', (e) => {
    const card = e.target.closest('.board-card');
    if (card) selectJob(Number(card.dataset.appId), { scroll: true });
  });
  board.addEventListener('dragstart', (e) => {
    const card = e.target.closest('.board-card');
    if (!card) return;
    e.dataTransfer.setData('text/plain', card.dataset.appId);
    e.dataTransfer.effectAllowed = 'move';
    card.classList.add('is-dragging');
  });
  board.addEventListener('dragend', (e) => {
    e.target.closest('.board-card')?.classList.remove('is-dragging');
    $$('.column.is-drop-target').forEach((c) => c.classList.remove('is-drop-target'));
  });
  board.addEventListener('dragover', (e) => {
    const col = e.target.closest('.column');
    if (!col) return;
    e.preventDefault();
    e.dataTransfer.dropEffect = 'move';
    $$('.column.is-drop-target').forEach((c) => c !== col && c.classList.remove('is-drop-target'));
    col.classList.add('is-drop-target');
  });
  board.addEventListener('dragleave', (e) => {
    const col = e.target.closest('.column');
    if (col && !col.contains(e.relatedTarget)) col.classList.remove('is-drop-target');
  });
  board.addEventListener('drop', async (e) => {
    const col = e.target.closest('.column');
    if (!col) return;
    e.preventDefault();
    col.classList.remove('is-drop-target');
    const app = byId(Number(e.dataTransfer.getData('text/plain')));
    if (app && app.status !== col.dataset.status) await changeStatus(app, col.dataset.status);
  });

  // Interview lists (Interviews page + detail pane)
  for (const list of [$('#upcomingList'), $('#pastList'), $('#detailInterviews')]) {
    list.addEventListener('click', (e) => {
      const openBtn = e.target.closest('[data-open-app]');
      if (openBtn) return selectJob(Number(openBtn.dataset.openApp), { scroll: true });
      const btn = e.target.closest('[data-int-action]');
      if (!btn) return;
      const id = Number(btn.closest('[data-interview-id]').dataset.interviewId);
      const interview = state.interviews.find((i) => i.id === id) || state.detailInterviews.find((i) => i.id === id);
      if (!interview) return;
      const action = btn.dataset.intAction;
      if (action === 'edit') openInterviewForm(interview.applicationId, interview);
      if (action === 'delete') deleteInterview(interview);
      if (action === 'complete') completeInterview(interview, btn);
    });
  }

  // Keyboard shortcuts: "n" new job, "/" focus search, Esc closes menus and the mobile sheet
  document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape') {
      setMenu(false);
      if (!$$('dialog[open]').length) closeSheet();
      return;
    }
    if (e.metaKey || e.ctrlKey || e.altKey) return;
    if (!state.user || $$('dialog[open]').length) return;
    if (e.target.closest('input, textarea, select, [contenteditable]')) return;
    if (e.key === 'n') { e.preventDefault(); openAppForm(); }
    if (e.key === '/' && state.view === 'jobs') { e.preventDefault(); $('#searchWhat').focus(); }
  });

  // Re-evaluate the detail pane when crossing the mobile/desktop breakpoint
  window.matchMedia('(min-width: 961px)').addEventListener('change', () => {
    closeSheet();
    if (state.loaded && state.view === 'jobs') renderJobs();
  });
}

// ============================================================================
// Application create / edit / delete
// ============================================================================

function openAppForm(app = null) {
  const form = $('#appForm');
  form.reset();
  showError($('#appError'), '');
  $$('.is-invalid', form).forEach((el) => el.classList.remove('is-invalid'));
  $('#appStatus').innerHTML = STATUSES.map((s) => `<option>${s}</option>`).join('');

  $('#appDialogTitle').textContent = app ? 'Edit job' : 'Add a job';
  $('#appSubmit').textContent = app ? 'Save changes' : 'Add job';
  $('#appId').value = app?.id ?? '';
  $('#appCompany').value = app?.company ?? '';
  $('#appRole').value = app?.role ?? '';
  $('#appStatus').value = app?.status ?? 'Applied';
  $('#appDate').value = toDateInput(app?.appliedDate);
  $('#appDate').dataset.original = $('#appDate').value;
  $('#appDate').max = toDateInput(new Date());
  $('#appLocation').value = app?.jobLocation ?? '';
  $('#appSalaryMin').value = app?.salaryMin ?? '';
  $('#appSalaryMax').value = app?.salaryMax ?? '';
  $('#appCurrency').value = app?.currency || 'USD';
  $('#appUrl').value = app?.jobPostUrl ?? '';
  $('#appNotes').value = app?.notes ?? '';
  $('#statusNoteField').hidden = true;
  $('#appStatusNote').value = '';
  $('#appStatus').dataset.original = app?.status ?? '';

  const cur = $('#appCurrency');
  if (app?.currency && ![...cur.options].some((o) => o.value === app.currency)) {
    cur.add(new Option(app.currency, app.currency, true, true));
  }

  openDialog($('#appDialog'));
  $('#appRole').focus();
}

function readAppForm() {
  const errors = [];
  const get = (id) => $(id).value.trim();
  const num = (id) => (get(id) === '' ? null : Number(get(id)));

  const payload = {
    company: get('#appCompany'),
    role: get('#appRole'),
    status: $('#appStatus').value,
    jobLocation: get('#appLocation') || null,
    salaryMin: num('#appSalaryMin'),
    salaryMax: num('#appSalaryMax'),
    currency: $('#appCurrency').value,
    jobPostUrl: get('#appUrl') || null,
    notes: get('#appNotes') || null,
  };

  const mark = (id, msg) => { $(id).classList.add('is-invalid'); errors.push(msg); };

  // Only send appliedDate when the user picked a different day than the one shown
  const dateVal = $('#appDate').value;
  if (dateVal && dateVal !== $('#appDate').dataset.original) {
    const [y, m, d] = dateVal.split('-').map(Number);
    const isToday = dateVal === toDateInput(new Date());
    // Midday local time avoids the date shifting when converted across time zones
    payload.appliedDate = (isToday ? new Date() : new Date(y, m - 1, d, 12, 0, 0)).toISOString();
  }

  if (!payload.role) mark('#appRole', 'Job title is required.');
  if (!payload.company) mark('#appCompany', 'Company is required.');
  if (dateVal && new Date(`${dateVal}T00:00:00`) > new Date()) mark('#appDate', 'Date applied cannot be in the future.');
  for (const [key, id] of [['salaryMin', '#appSalaryMin'], ['salaryMax', '#appSalaryMax']]) {
    const v = payload[key];
    if (v !== null && (!Number.isInteger(v) || v < 0)) mark(id, 'Pay must be a positive whole number.');
  }
  if (payload.salaryMin !== null && payload.salaryMax !== null && payload.salaryMin > payload.salaryMax) {
    mark('#appSalaryMin', 'Minimum pay cannot exceed the maximum.');
  }
  if (payload.jobPostUrl && !safeUrl(payload.jobPostUrl)) mark('#appUrl', 'Job posting link must start with http:// or https://');

  return { payload, error: errors[0] };
}

function bindAppForm() {
  const statusSel = $('#appStatus');
  statusSel.addEventListener('change', () => {
    const original = statusSel.dataset.original;
    $('#statusNoteField').hidden = !original || statusSel.value === original;
  });
  $('#appForm').addEventListener('input', (e) => e.target.classList?.remove('is-invalid'));

  $('#appForm').addEventListener('submit', async (e) => {
    e.preventDefault();
    $$('.is-invalid', e.target).forEach((el) => el.classList.remove('is-invalid'));
    const { payload, error } = readAppForm();
    if (error) return showError($('#appError'), error);
    showError($('#appError'), '');

    const id = $('#appId').value;
    const note = $('#appStatusNote').value.trim();
    if (id && note) payload.statusNote = note;

    await withBusy($('#appSubmit'), async () => {
      try {
        const saved = id ? await api.updateApplication(id, payload) : await api.createApplication(payload);
        closeDialog($('#appDialog'));
        toast(id ? 'Job updated' : `${saved.role} at ${saved.company} added`);
        if (!id) {
          // Show the new job: reset filters that could hide it and select it
          state.filters = { ...DEFAULT_FILTERS(), sort: state.filters.sort };
          state.selectedId = saved.id;
          if (state.view !== 'jobs') setView('jobs', false);
        }
        await refreshData();
        if (!id && !isDesktop()) openSheet();
      } catch (err) {
        showError($('#appError'), err.message);
      }
    });
  });
}

async function changeStatus(app, status) {
  const previous = app.status;
  app.status = status; // optimistic update
  renderAll();
  try {
    await api.updateApplication(app.id, { status });
    toast(`Moved to ${status}`);
    await refreshData();
  } catch (err) {
    app.status = previous;
    renderAll();
    toast(err.message, 'error');
  }
}

async function deleteApplication(app) {
  if (!app) return;
  const ok = await confirmAction({
    title: `Delete ${app.role} at ${app.company}?`,
    message: 'This removes the job together with its interviews, activity and resume. This cannot be undone.',
    confirmLabel: 'Delete job',
  });
  if (!ok) return;
  try {
    await api.deleteApplication(app.id);
    if (state.selectedId === app.id) { state.selectedId = null; closeSheet(); }
    toast('Job deleted');
    await refreshData();
  } catch (err) {
    toast(err.message, 'error');
  }
}

// ============================================================================
// Interviews
// ============================================================================

function openInterviewForm(appId, interview = null) {
  const form = $('#interviewForm');
  form.reset();
  showError($('#intError'), '');
  const app = byId(appId);
  $('#interviewDialogTitle').textContent = interview ? 'Edit interview round' : `Add interview: ${app?.company ?? ''}`;
  $('#intSubmit').textContent = interview ? 'Save changes' : 'Add round';
  $('#intId').value = interview?.id ?? '';
  $('#intAppId').value = appId;
  $('#intRound').value = interview?.roundName ?? '';
  $('#intDate').value = interview ? toDateTimeInput(interview.scheduledDate) : '';
  $('#intStatus').value = interview?.status ?? 'Scheduled';
  $('#intInterviewer').value = interview?.interviewer ?? '';
  $('#intLink').value = interview?.meetingLink ?? '';
  $('#intNotes').value = interview?.feedbackNotes ?? '';
  openDialog($('#interviewDialog'));
  $('#intRound').focus();
}

function bindInterviewForm() {
  $('#interviewForm').addEventListener('submit', async (e) => {
    e.preventDefault();
    const id = $('#intId').value;
    const appId = Number($('#intAppId').value);
    const round = $('#intRound').value.trim();
    const dateVal = $('#intDate').value;
    const link = $('#intLink').value.trim();

    if (!round) return showError($('#intError'), 'Round name is required.');
    if (!dateVal || isNaN(new Date(dateVal).getTime())) return showError($('#intError'), 'Please choose a valid date and time.');
    if (link && !safeUrl(link)) return showError($('#intError'), 'Meeting link must start with http:// or https://');
    showError($('#intError'), '');

    const payload = {
      roundName: round,
      scheduledDate: new Date(dateVal).toISOString(),
      status: $('#intStatus').value,
      interviewer: $('#intInterviewer').value.trim() || null,
      meetingLink: link || null,
      feedbackNotes: $('#intNotes').value.trim() || null,
    };

    await withBusy($('#intSubmit'), async () => {
      try {
        if (id) {
          await api.updateInterview(id, payload);
        } else {
          await api.createInterview(appId, payload);
          // Nudge the job into "Interviewing" when the first round is added
          const app = byId(appId);
          if (app && app.status === 'Applied') {
            await api.updateApplication(appId, { status: 'Interviewing', statusNote: `Interview scheduled: ${round}` });
          }
        }
        closeDialog($('#interviewDialog'));
        toast(id ? 'Interview updated' : 'Interview round added');
        await refreshData();
      } catch (err) {
        showError($('#intError'), err.message);
      }
    });
  });
}

async function completeInterview(interview, btn) {
  await withBusy(btn, async () => {
    try {
      await api.updateInterview(interview.id, { status: 'Completed' });
      toast(`${interview.roundName} marked as completed`);
      await refreshData();
    } catch (err) {
      toast(err.message, 'error');
    }
  });
}

async function deleteInterview(interview) {
  const ok = await confirmAction({
    title: 'Delete interview round?',
    message: `"${interview.roundName}" on ${fmtDateTime(interview.scheduledDate)} will be removed.`,
    confirmLabel: 'Delete round',
  });
  if (!ok) return;
  try {
    await api.deleteInterview(interview.id);
    toast('Interview round deleted');
    await refreshData();
  } catch (err) {
    toast(err.message, 'error');
  }
}

// ============================================================================
// Profile & settings
// ============================================================================

function openProfile() {
  const u = state.user;
  $('#profileEmail').value = u.email;
  $('#pwUsername').value = u.email;
  $('#profileName').value = u.name ?? '';
  $('#profileLinkedin').value = u.linkedinUrl ?? '';
  $('#profileGithub').value = u.githubUrl ?? '';
  $('#passwordForm').reset();
  showError($('#profileError'), '');
  showError($('#passwordError'), '');
  openDialog($('#profileDialog'));
}

function bindProfile() {
  $('#profileForm').addEventListener('submit', async (e) => {
    e.preventDefault();
    const payload = {
      name: $('#profileName').value.trim() || null,
      linkedinUrl: $('#profileLinkedin').value.trim() || null,
      githubUrl: $('#profileGithub').value.trim() || null,
    };
    for (const [k, label] of [['linkedinUrl', 'LinkedIn'], ['githubUrl', 'GitHub']]) {
      if (payload[k] && !safeUrl(payload[k])) return showError($('#profileError'), `${label} URL must start with http:// or https://`);
    }
    showError($('#profileError'), '');
    await withBusy(e.submitter, async () => {
      try {
        state.user = await api.updateProfile(payload);
        renderUser();
        toast('Profile saved');
      } catch (err) {
        showError($('#profileError'), err.message);
      }
    });
  });

  $('#passwordForm').addEventListener('submit', async (e) => {
    e.preventDefault();
    const current = $('#pwCurrent').value;
    const next = $('#pwNew').value;
    if (!current) return showError($('#passwordError'), 'Enter your current password.');
    if (next.length < 8) return showError($('#passwordError'), 'New password must be at least 8 characters.');
    if (next === current) return showError($('#passwordError'), 'New password must be different from the current one.');
    showError($('#passwordError'), '');
    await withBusy(e.submitter, async () => {
      try {
        await api.changePassword(current, next);
        e.target.reset();
        toast('Password updated');
      } catch (err) {
        showError($('#passwordError'), err.message);
      }
    });
  });

  $('#deleteAccountBtn').addEventListener('click', async () => {
    const ok = await confirmAction({
      title: 'Delete your account?',
      message: 'All of your jobs, interviews and resumes will be permanently deleted.',
      confirmLabel: 'Delete account',
      requireText: 'DELETE',
    });
    if (!ok) return;
    try {
      await api.deleteAccount();
      signOut();
      toast('Your account has been deleted');
    } catch (err) {
      toast(err.message, 'error');
    }
  });
}

// ============================================================================
// Health indicator
// ============================================================================

async function checkHealth() {
  const badge = $('#healthBadge');
  const label = badge.querySelector('.health-label');
  try {
    await api.health();
    badge.dataset.state = 'ok';
    label.textContent = 'All systems operational';
  } catch (err) {
    const degraded = err.status === 503;
    badge.dataset.state = degraded ? 'degraded' : 'down';
    label.textContent = degraded ? 'Database unavailable' : 'Server unreachable';
  }
}

// ============================================================================
// Boot
// ============================================================================

function boot() {
  $$('.year').forEach((el) => { el.textContent = new Date().getFullYear(); });
  initTheme();
  initDialogs();
  bindAuth();
  bindShell();
  bindAppForm();
  bindDetail();
  bindInterviewForm();
  bindProfile();

  checkHealth();
  setInterval(() => document.visibilityState === 'visible' && checkHealth(), 60_000);
  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'visible' && state.user) refreshData();
  });

  if (auth.token) startSession();
  else showAuth();
}

boot();
