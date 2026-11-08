/**
 * The API client.
 *
 * One place where the access token is attached, where the `{ success, message,
 * data, error }` envelope is unwrapped, and where a 401 triggers a single
 * refresh-and-retry.
 */

const BASE = '/api';

let accessToken = null;
let onUnauthenticated = () => {};

export function setAccessToken(token) {
  accessToken = token;
}

export function getAccessToken() {
  return accessToken;
}

export function setUnauthenticatedHandler(fn) {
  onUnauthenticated = fn;
}

/** An error carrying the API's own code and details. */
export class ApiError extends Error {
  constructor(message, { status, code, details } = {}) {
    super(message);
    this.name = 'ApiError';
    this.status = status;
    this.code = code;
    this.details = details;
  }

  /** 409 from the workflow: someone else moved the order on. */
  get isConflict() {
    return this.status === 409;
  }
}

let refreshing = null;

/** Rotate the refresh cookie. Concurrent callers share one in-flight request. */
async function refreshSession() {
  if (!refreshing) {
    refreshing = fetch(`${BASE}/auth/refresh`, { method: 'POST', credentials: 'include' })
      .then(async (res) => {
        const body = await res.json().catch(() => null);
        if (!res.ok || !body?.success) throw new ApiError('Session expired', { status: 401 });
        accessToken = body.data.accessToken;
        return body.data;
      })
      .finally(() => {
        refreshing = null;
      });
  }
  return refreshing;
}

async function parse(res) {
  const text = await res.text();
  if (!text) return null;
  try {
    return JSON.parse(text);
  } catch {
    return { success: false, message: text, data: null, error: { code: 'BAD_RESPONSE' } };
  }
}

/**
 * @param {string} path e.g. '/orders/mine'
 * @param {{ method?: string, body?: any, formData?: FormData, retry?: boolean }} [options]
 */
export async function request(path, { method = 'GET', body, formData, retry = true } = {}) {
  const headers = {};
  if (accessToken) headers.Authorization = `Bearer ${accessToken}`;
  if (body !== undefined) headers['Content-Type'] = 'application/json';

  const res = await fetch(`${BASE}${path}`, {
    method,
    headers,
    credentials: 'include',
    ...(body !== undefined ? { body: JSON.stringify(body) } : {}),
    ...(formData ? { body: formData } : {}),
  });

  const parsed = await parse(res);

  if (res.status === 401 && retry) {
    try {
      await refreshSession();
      return request(path, { method, body, formData, retry: false });
    } catch {
      onUnauthenticated();
      throw new ApiError('Please sign in again', { status: 401, code: 'UNAUTHORIZED' });
    }
  }

  if (!res.ok || !parsed?.success) {
    throw new ApiError(parsed?.message || `Request failed (${res.status})`, {
      status: res.status,
      code: parsed?.error?.code,
      details: parsed?.error?.details,
    });
  }

  return parsed.data;
}

export const api = {
  get: (path) => request(path),
  post: (path, body) => request(path, { method: 'POST', body }),
  patch: (path, body) => request(path, { method: 'PATCH', body }),
  del: (path) => request(path, { method: 'DELETE' }),
  upload: (path, formData) => request(path, { method: 'POST', formData }),
  refreshSession,
};
