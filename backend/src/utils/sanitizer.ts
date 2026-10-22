/**
 * The Dormammu Loop - Secret & Credential Sanitizer
 * Redacts secrets, authorization headers, credentials, tokens, and sensitive values
 * across logs, inputs, outputs, and execution payloads.
 */

const SENSITIVE_KEY_REGEX =
  /(password|passwd|secret|token|bearer|auth|authorization|api_key|apikey|access_token|refresh_token|private_key|credential|client_secret|cookie|set-cookie|conn_string|connection_string|database_url|webhook_secret)/i;

const BEARER_TOKEN_REGEX = /(Bearer\s+)[A-Za-z0-9\-_.]+/gi;
const BASIC_AUTH_REGEX = /(Basic\s+)[A-Za-z0-9+/=]+/gi;
const COMMON_API_KEY_REGEX = /\b(sk-[a-zA-Z0-9_-]{12,}|ghp_[a-zA-Z0-9]{20,}|gho_[a-zA-Z0-9]{20,}|xox[baprs]-[a-zA-Z0-9-]+)\b/gi;
const URL_CREDENTIAL_REGEX = /(https?:\/\/)([^:@\s]+):([^@\s]+)@/gi;

/**
 * Sanitizes a string by masking credential patterns
 */
export function sanitizeString(val: string): string {
  if (typeof val !== 'string') return val;

  let sanitized = val;
  sanitized = sanitized.replace(BEARER_TOKEN_REGEX, '$1[REDACTED]');
  sanitized = sanitized.replace(BASIC_AUTH_REGEX, '$1[REDACTED]');
  sanitized = sanitized.replace(URL_CREDENTIAL_REGEX, '$1$2:[REDACTED]@');
  sanitized = sanitized.replace(COMMON_API_KEY_REGEX, '[REDACTED_KEY]');
  return sanitized;
}

/**
 * Recursively sanitizes any payload, redacting sensitive keys and values.
 * Handles circular references safely using a WeakSet.
 */
export function sanitizePayload<T = unknown>(data: T, seen = new WeakSet()): T {
  if (data === null || data === undefined) {
    return data;
  }

  if (typeof data === 'string') {
    return sanitizeString(data) as unknown as T;
  }

  if (typeof data !== 'object') {
    return data;
  }

  if (seen.has(data as object)) {
    return '[Circular]' as unknown as T;
  }
  seen.add(data as object);

  if (Array.isArray(data)) {
    return data.map((item) => sanitizePayload(item, seen)) as unknown as T;
  }

  if (data instanceof Date) {
    return data;
  }

  const result: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(data)) {
    if (SENSITIVE_KEY_REGEX.test(key)) {
      result[key] = '[REDACTED]';
    } else {
      result[key] = sanitizePayload(value, seen);
    }
  }

  return result as T;
}

/**
 * Sanitizes an array of structured log entries
 */
export function sanitizeLogs<T extends { message?: string; details?: unknown }>(logs: T[]): T[] {
  if (!Array.isArray(logs)) return [];
  return logs.map((log) => ({
    ...log,
    message: log.message ? sanitizeString(log.message) : log.message,
    details: log.details !== undefined ? sanitizePayload(log.details) : undefined,
  }));
}
