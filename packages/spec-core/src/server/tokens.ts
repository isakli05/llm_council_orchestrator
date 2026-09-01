import { randomBytes } from 'node:crypto';

/**
 * §24 — per-session credential for the loopback clarification server.
 *
 * 256 bits of CSPRNG entropy, base64url (URL-safe). Delivered to the browser
 * in the URL FRAGMENT (`http://127.0.0.1:<port>/#<token>`): fragments are
 * never sent to any server (no request line, no header, no log entry, no
 * Referer), which is what "no secrets in URLs" means in the only sense that
 * matters for HTTP. The client strips the fragment from history, keeps the
 * token in sessionStorage, and sends it as the `x-lco-session` header on
 * every API call.
 */
export function generateSessionToken(): string {
  return randomBytes(32).toString('base64url');
}

/** The user-facing session URL (also printed to the terminal as the fallback). */
export function sessionUrl(host: string, port: number, token: string): string {
  return `http://${host}:${port}/#${token}`;
}
