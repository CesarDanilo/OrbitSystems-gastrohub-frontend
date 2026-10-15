import type { ApiErrorBody, ErrorCategory } from '@orbitsystems/gastrohub-contracts';

/** Error thrown for any non-2xx API response, carrying the server's stable code. */
export class ApiError extends Error {
  constructor(
    public readonly status: number,
    public readonly category: ErrorCategory,
    public readonly code: string,
    message: string,
    public readonly details?: unknown,
  ) {
    super(message);
    this.name = 'ApiError';
  }

  get fieldErrors(): Record<string, string> {
    const fields =
      (this.details as { fields?: { path: string; message: string }[] } | undefined)?.fields ?? [];
    return Object.fromEntries(fields.map((f) => [f.path, f.message]));
  }
}

export const NETWORK_ERROR_MESSAGE = 'Sem conexão. Verifique sua internet e tente novamente.';

type Method = 'GET' | 'POST' | 'PUT' | 'PATCH' | 'DELETE';

async function request<T>(
  method: Method,
  path: string,
  body?: unknown,
  init: RequestInit = {},
): Promise<T> {
  const isForm = body instanceof FormData;
  let response: Response;
  try {
    response = await fetch(`/api${path}`, {
      method,
      credentials: 'same-origin',
      headers: {
        // Required by the API on authenticated mutations (CSRF defense).
        'x-requested-with': 'gastrohub',
        ...(body !== undefined && !isForm ? { 'content-type': 'application/json' } : {}),
        ...init.headers,
      },
      body: body === undefined ? undefined : isForm ? body : JSON.stringify(body),
      signal: init.signal,
    });
  } catch (error) {
    if ((error as Error).name === 'AbortError') throw error;
    throw new ApiError(0, 'ExternalServiceError', 'NETWORK_ERROR', NETWORK_ERROR_MESSAGE);
  }

  if (response.status === 204) return undefined as T;
  const data = await response.json().catch(() => null);
  if (!response.ok) {
    const error = (data as ApiErrorBody | null)?.error;
    throw new ApiError(
      response.status,
      error?.category ?? 'InternalError',
      error?.code ?? 'UNKNOWN',
      error?.message ?? 'Algo deu errado. Tente novamente.',
      error?.details,
    );
  }
  return data as T;
}

export const api = {
  get: <T>(path: string, init?: RequestInit) => request<T>('GET', path, undefined, init),
  post: <T>(path: string, body?: unknown, init?: RequestInit) =>
    request<T>('POST', path, body ?? {}, init),
  put: <T>(path: string, body: unknown) => request<T>('PUT', path, body),
  patch: <T>(path: string, body: unknown) => request<T>('PATCH', path, body),
  delete: <T = void>(path: string) => request<T>('DELETE', path),
  upload: <T>(path: string, form: FormData) => request<T>('POST', path, form),
};

export function errorMessage(error: unknown): string {
  if (error instanceof ApiError) return error.message;
  return 'Algo deu errado. Tente novamente.';
}
