import { resolveApiBaseUrl } from "./apiBase";

export const API_BASE_URL = resolveApiBaseUrl(
  import.meta.env.VITE_API_BASE_URL,
  typeof window === "undefined" ? undefined : window.location.href
);

export function apiResourceUrl(url?: string) {
  if (!url) return "";
  return url.startsWith("/api/") ? `${API_BASE_URL}${url}` : url;
}

type RequestOptions = {
  token?: string;
  body?: unknown;
  signal?: AbortSignal;
  idempotencyKey?: string;
  ifMatch?: string;
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
      ...(options.token ? { Authorization: `Bearer ${options.token}` } : {}),
      ...(options.idempotencyKey ? { "Idempotency-Key": options.idempotencyKey } : {}),
      ...(options.ifMatch ? { "If-Match": options.ifMatch } : {})
    },
    body: options.body ? JSON.stringify(options.body) : undefined,
    signal: options.signal
  });

  if (!response.ok) {
    const body = await response.text();
    let message = body;
    try {
      const parsed = JSON.parse(body) as { message?: string };
      message = parsed.message ?? body;
    } catch {
      // Plain-text API errors remain supported.
    }
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

function mutationKey() {
  return typeof crypto !== "undefined" && "randomUUID" in crypto ? crypto.randomUUID() : `${Date.now()}-${Math.random().toString(36).slice(2)}`;
}

type MutationControls = { idempotencyKey?: string; ifMatch?: string };

export function apiPost<T>(path: string, body: unknown, token?: string, controls: MutationControls = {}): Promise<T> {
  return request<T>("POST", path, { body, token, idempotencyKey: controls.idempotencyKey ?? mutationKey(), ifMatch: controls.ifMatch });
}

export function apiPut<T>(path: string, body: unknown, token?: string, controls: MutationControls = {}): Promise<T> {
  return request<T>("PUT", path, { body, token, idempotencyKey: controls.idempotencyKey ?? mutationKey(), ifMatch: controls.ifMatch });
}

export function apiPatch<T>(path: string, body: unknown, token?: string, controls: MutationControls = {}): Promise<T> {
  return request<T>("PATCH", path, { body, token, idempotencyKey: controls.idempotencyKey ?? mutationKey(), ifMatch: controls.ifMatch });
}

export function apiDelete<T>(path: string, token?: string, controls: MutationControls = {}): Promise<T> {
  return request<T>("DELETE", path, { token, idempotencyKey: controls.idempotencyKey ?? mutationKey(), ifMatch: controls.ifMatch });
}
