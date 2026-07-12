export const API_BASE_URL = import.meta.env.VITE_API_BASE_URL ?? "http://127.0.0.1:4000";

export function apiResourceUrl(url?: string) {
  if (!url) return "";
  return url.startsWith("/api/") ? `${API_BASE_URL}${url}` : url;
}

type RequestOptions = {
  token?: string;
  body?: unknown;
  signal?: AbortSignal;
};

export class ApiError extends Error {
  constructor(
    message: string,
    public readonly status: number
  ) {
    super(message);
  }
}

async function request<T>(method: string, path: string, options: RequestOptions = {}): Promise<T> {
  const response = await fetch(`${API_BASE_URL}${path}`, {
    method,
    headers: {
      ...(options.body ? { "Content-Type": "application/json" } : {}),
      ...(options.token ? { Authorization: `Bearer ${options.token}` } : {})
    },
    body: options.body ? JSON.stringify(options.body) : undefined,
    signal: options.signal
  });

  if (!response.ok) {
    const message = await response.text();
    throw new ApiError(message || `API request failed: ${response.status}`, response.status);
  }

  return response.json();
}

export function apiGet<T>(path: string, token?: string): Promise<T> {
  return request<T>("GET", path, { token });
}

export function apiGetWithSignal<T>(path: string, signal: AbortSignal, token?: string): Promise<T> {
  return request<T>("GET", path, { token, signal });
}

export function apiPost<T>(path: string, body: unknown, token?: string): Promise<T> {
  return request<T>("POST", path, { body, token });
}

export function apiPut<T>(path: string, body: unknown, token?: string): Promise<T> {
  return request<T>("PUT", path, { body, token });
}

export function apiPatch<T>(path: string, body: unknown, token?: string): Promise<T> {
  return request<T>("PATCH", path, { body, token });
}

export function apiDelete<T>(path: string, token?: string): Promise<T> {
  return request<T>("DELETE", path, { token });
}
