/**
 * Thin API client for the Job Tracker backend.
 * - Attaches the JWT from storage to every request
 * - Normalises error responses into ApiError instances
 * - Emits an "auth:expired" event on 401 so the app can sign the user out
 */

const TOKEN_KEY = 'jt.token';

export class ApiError extends Error {
  constructor(message, status, body) {
    super(message);
    this.name = 'ApiError';
    this.status = status;
    this.body = body;
  }
}

function safeStorage(fn, fallback = null) {
  try { return fn(); } catch { return fallback; }
}

export const auth = {
  get token() { return safeStorage(() => localStorage.getItem(TOKEN_KEY)); },
  set token(value) {
    safeStorage(() => (value ? localStorage.setItem(TOKEN_KEY, value) : localStorage.removeItem(TOKEN_KEY)));
  },
  clear() { this.token = null; },
};

async function parseBody(res) {
  if (res.status === 204) return null;
  const type = res.headers.get('content-type') || '';
  if (type.includes('application/json')) {
    try { return await res.json(); } catch { return null; }
  }
  return null;
}

/**
 * Core request helper.
 * @param {string} path
 * @param {{ method?: string, body?: any, raw?: boolean, auth?: boolean }} [options]
 */
export async function request(path, { method = 'GET', body, raw = false, auth: withAuth = true } = {}) {
  const headers = {};
  const token = auth.token;
  if (withAuth && token) headers.Authorization = `Bearer ${token}`;

  let payload = body;
  if (body !== undefined && !(body instanceof FormData)) {
    headers['Content-Type'] = 'application/json';
    payload = JSON.stringify(body);
  }

  let res;
  try {
    res = await fetch(path, { method, headers, body: payload });
  } catch {
    throw new ApiError('Unable to reach the server. Check your connection and try again.', 0);
  }

  if (res.status === 401 && withAuth && token) {
    window.dispatchEvent(new CustomEvent('auth:expired'));
  }

  if (!res.ok) {
    const data = await parseBody(res);
    const message =
      data?.error ||
      (res.status === 429 ? 'Too many requests. Please wait a moment and try again.' : `Request failed (${res.status})`);
    throw new ApiError(message, res.status, data);
  }

  if (raw) return res;
  return parseBody(res);
}

/** Download a protected file (uses fetch so the Authorization header is sent). */
export async function download(path, fallbackName) {
  const res = await request(path, { raw: true });
  const blob = await res.blob();
  const disposition = res.headers.get('content-disposition') || '';
  const match = /filename\*?=(?:UTF-8'')?"?([^";]+)"?/i.exec(disposition);
  const filename = match ? decodeURIComponent(match[1]) : fallbackName;

  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

export const api = {
  // Auth & profile
  login: (email, password) => request('/auth/login', { method: 'POST', body: { email, password }, auth: false }),
  signup: (email, password, name) => request('/auth/signup', { method: 'POST', body: { email, password, name }, auth: false }),
  forgotPassword: (email) => request('/auth/forgot-password', { method: 'POST', body: { email }, auth: false }),
  resetPassword: (token, newPassword) => request('/auth/reset-password', { method: 'POST', body: { token, newPassword }, auth: false }),
  profile: () => request('/auth/profile'),
  updateProfile: (data) => request('/auth/profile', { method: 'PATCH', body: data }),
  changePassword: (currentPassword, newPassword) =>
    request('/auth/change-password', { method: 'POST', body: { currentPassword, newPassword } }),
  deleteAccount: () => request('/auth/profile', { method: 'DELETE' }),

  // Applications
  stats: () => request('/applications/stats'),
  async listAllApplications() {
    const all = [];
    let cursor = null;
    // Follow cursor pagination until every record is loaded
    do {
      const qs = new URLSearchParams({ limit: '100' });
      if (cursor) qs.set('cursor', String(cursor));
      const page = await request(`/applications?${qs}`);
      all.push(...(page?.applications ?? []));
      cursor = page?.nextCursor ?? null;
    } while (cursor);
    return all;
  },
  getApplication: (id) => request(`/applications/${id}`),
  createApplication: (data) => request('/applications', { method: 'POST', body: data }),
  updateApplication: (id, data) => request(`/applications/${id}`, { method: 'PATCH', body: data }),
  deleteApplication: (id) => request(`/applications/${id}`, { method: 'DELETE' }),
  history: (id) => request(`/applications/${id}/history`),

  // Resume
  uploadResume(id, file) {
    const form = new FormData();
    form.append('resume', file);
    return request(`/applications/${id}/resume`, { method: 'POST', body: form });
  },
  deleteResume: (id) => request(`/applications/${id}/resume`, { method: 'DELETE' }),
  downloadResume: (id, name) => download(`/applications/${id}/resume`, name || 'resume'),

  // Interviews
  allInterviews: () => request('/interviews'),
  applicationInterviews: (id) => request(`/applications/${id}/interviews`),
  createInterview: (appId, data) => request(`/applications/${appId}/interviews`, { method: 'POST', body: data }),
  updateInterview: (id, data) => request(`/interviews/${id}`, { method: 'PATCH', body: data }),
  deleteInterview: (id) => request(`/interviews/${id}`, { method: 'DELETE' }),

  // Misc
  exportCsv: () => download('/export/csv', 'applications.csv'),
  health: () => request('/health', { auth: false, raw: true }),
};
