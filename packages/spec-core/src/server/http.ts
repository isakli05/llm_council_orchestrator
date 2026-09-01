import { z } from 'zod';
import { createServer, type IncomingMessage, type Server, type ServerResponse } from 'node:http';
import { timingSafeEqual } from 'node:crypto';
import { sessionUrl } from './tokens';
import type { ClarifySession, SessionSnapshot } from '../clarify/session/orchestrator';
import type { ClarificationAnswer } from '../clarify/model';
import { ReviewChangeSetSchema } from '../clarify/review-changes';

/**
 * §5/§23/§24 — the loopback clarification server: ONE session per process,
 * node:http only (no framework), static assets from an EXACT-NAME allowlist.
 *
 * Trust boundary: the browser is an untrusted presentation client; this
 * server is the ONLY mutator, and it validates every payload with zod before
 * touching the session. Guards (all of them, every request):
 *   - loopback bind only (127.0.0.1, dynamic port; NEVER 0.0.0.0);
 *   - Host must be 127.0.0.1/localhost with THIS port (DNS-rebinding kill);
 *   - Origin, when present, must be this origin (CSRF);
 *   - Sec-Fetch-Site, when present, must be same-origin/none (cross-site
 *     always refused);
 *   - every /api/* call requires the per-session token (timing-safe compare)
 *     — the token travels only in the URL fragment + x-lco-session header,
 *     never in any request the server logs;
 *   - GET is pure; ALL mutations are POST with Content-Type application/json
 *     and a 1 MiB body ceiling;
 *   - responses carry CSP default-src 'none' (+script/style/connect 'self'),
 *     nosniff, no-referrer, CORP/COOP same-origin; API responses no-store.
 *
 * The snapshot this server returns contains ONLY product data (questions,
 * review, progress, honest usage) — never provider config, env values, keys,
 * filesystem paths, or model routing internals.
 */

/** One static asset: exact bytes + MIME type (allowlist-served only). */
export interface StaticAssets {
  html: string;
  files: Map<string, { content: string; type: string }>;
}

export interface SessionEvent {
  type:
    | 'session.started'
    | 'questions.presented'
    | 'answers.submitted'
    | 'revalidation.completed'
    | 'clarification.discovered'
    | 'review.generated'
    | 'changes.applied'
    | 'spec.approved'
    | 'session.cancelled'
    | 'session.failed'
    | 'session.http.error';
  sessionId: string;
  /** Counts/ids only — NEVER free-text answers (§37). */
  detail?: Record<string, string | number>;
}

export interface ClarifyServerOptions {
  session: ClarifySession;
  sessionId: string;
  token: string;
  assets: StaticAssets;
  onEvent?: (event: SessionEvent) => void;
  /** Authenticated-request inactivity shutdown (default 30 minutes). */
  inactivityMs?: number;
  nowMs?: () => number;
}

export interface ClarifyServerHandle {
  server: Server;
  address: '127.0.0.1';
  port: number;
  origin: string;
  sessionUrl: string;
  token: string;
  /** Resolves when the initial round has finished (any outcome). */
  started: Promise<void>;
  close(): Promise<void>;
}

const MAX_BODY_BYTES = 1_048_576;
const DEFAULT_INACTIVITY_MS = 30 * 60 * 1000;
const CSP = [
  "default-src 'none'",
  "script-src 'self'",
  "style-src 'self'",
  "connect-src 'self'",
  "img-src 'self' data:",
  "font-src 'self'",
  "form-action 'none'",
  "base-uri 'none'",
  "frame-ancestors 'none'",
].join('; ');

const ClarificationAnswerApiSchema = z
  .object({
    decisionId: z.string().min(1),
    kind: z.enum(['option', 'other']),
    selectedOption: z.string().optional(),
    freeText: z.string().optional(),
  })
  .strict();

const ApplyRoundRequestSchema = z
  .object({ answers: z.array(ClarificationAnswerApiSchema).min(1).max(50) })
  .strict();

const ApproveRequestSchema = z
  .object({ pendingChangeIds: z.array(z.string().min(1)).max(50) })
  .strict();

const CancelRequestSchema = z.object({}).strict();

type Json = Record<string, unknown>;

export async function startClarifyServer(opts: ClarifyServerOptions): Promise<ClarifyServerHandle> {
  const inactivityMs = opts.inactivityMs ?? DEFAULT_INACTIVITY_MS;
  const emit = (type: SessionEvent['type'], detail?: Record<string, string | number>): void => {
    opts.onEvent?.({ type, sessionId: opts.sessionId, ...(detail !== undefined ? { detail } : {}) });
  };

  // Inactivity needs a clock: the CLI injects one; a library caller without
  // nowMs gets no inactivity timeout (the repo rule is that core never reads
  // the wall clock itself).
  let lastActivity = opts.nowMs !== undefined ? opts.nowMs() : Number.MAX_SAFE_INTEGER;

  let closed = false;
  let inactivityTimer: NodeJS.Timeout | undefined;

  const snapshotBefore = (): SessionSnapshot => opts.session.snapshot();

  /** Diff two snapshots into structured events (ids/counts only). */
  const emitDelta = (before: SessionSnapshot, after: SessionSnapshot): void => {
    if (before.state === 'STARTING' && after.state === 'CLARIFICATION_REQUIRED') {
      emit('questions.presented', { questions: after.questions.length });
    }
    if (after.state === 'CLARIFICATION_REQUIRED' && before.state !== after.state) {
      emit('questions.presented', { questions: after.questions.length });
    }
    if (after.progress.newlyDiscovered > 0 && after.state === 'CLARIFICATION_REQUIRED') {
      emit('clarification.discovered', { count: after.progress.newlyDiscovered });
    }
    if (before.state !== 'FINAL_REVIEW' && before.state !== 'APPROVED' && after.state === 'FINAL_REVIEW') {
      emit('review.generated', { reviewVersion: after.review?.reviewVersion ?? 0 });
    }
    if (after.state === 'FAILED') emit('session.failed', {});
    if (after.state === 'CANCELLED') emit('session.cancelled', {});
  };

  const securityHeaders = (res: ServerResponse, extra: Record<string, string> = {}): void => {
    res.setHeader('Content-Security-Policy', CSP);
    res.setHeader('X-Content-Type-Options', 'nosniff');
    res.setHeader('Referrer-Policy', 'no-referrer');
    res.setHeader('Cross-Origin-Resource-Policy', 'same-origin');
    res.setHeader('Cross-Origin-Opener-Policy', 'same-origin');
    res.setHeader('Cache-Control', 'no-store');
    for (const [k, v] of Object.entries(extra)) res.setHeader(k, v);
  };

  const sendJson = (res: ServerResponse, status: number, body: Json): void => {
    const payload = JSON.stringify(body);
    res.writeHead(status, { 'Content-Type': 'application/json; charset=utf-8' });
    res.end(payload);
  };

  const readBody = (req: IncomingMessage): Promise<{ ok: true; text: string } | { ok: false; status: number; error: string }> =>
    new Promise((resolve) => {
      const chunks: Buffer[] = [];
      let size = 0;
      let overflowed = false;
      req.on('data', (chunk: Buffer) => {
        if (overflowed) return; // drain, never buffer past the ceiling
        size += chunk.length;
        if (size > MAX_BODY_BYTES) {
          overflowed = true;
          chunks.length = 0;
          resolve({ ok: false, status: 413, error: 'request body exceeds the 1 MiB ceiling' });
          return;
        }
        chunks.push(chunk);
      });
      req.on('end', () => {
        if (!overflowed) resolve({ ok: true, text: Buffer.concat(chunks).toString('utf8') });
      });
      req.on('error', () => {
        if (!overflowed) resolve({ ok: false, status: 400, error: 'request body could not be read' });
      });
    });

  const tokenMatches = (presented: string | undefined): boolean => {
    if (presented === undefined || presented.length === 0) return false;
    const a = Buffer.from(presented);
    const b = Buffer.from(opts.token);
    return a.length === b.length && timingSafeEqual(a, b);
  };

  const server = createServer((req, res) => {
    void handleRequest(req, res).catch((err: unknown) => {
      emit('session.http.error', { message: (err as Error).message.slice(0, 200) });
      if (process.env.LCO_DEBUG_HTTP === '1') {
        console.error('lco clarify http error:', err, 'url:', JSON.stringify(req.url), 'host:', req.headers.host);
      }
      if (!res.headersSent) {
        securityHeaders(res);
        sendJson(res, 500, { ok: false, error: 'internal server error' });
      } else {
        res.end();
      }
    });
  });

  async function handleRequest(req: IncomingMessage, res: ServerResponse): Promise<void> {
    // Malformed request targets (e.g. '//') must yield a clean 400, never a 500.
    let path: string;
    try {
      path = new URL(req.url ?? '/', 'http://127.0.0.1').pathname;
    } catch {
      securityHeaders(res);
      sendJson(res, 400, { ok: false, error: 'malformed request target' });
      return;
    }
    const method = req.method ?? 'GET';

    // --- guard 1: Host (DNS rebinding) — every request, no exceptions -------
    const host = (req.headers.host ?? '').toLowerCase();
    const legalHosts = new Set([`127.0.0.1:${serverPort}`, `localhost:${serverPort}`, `[::1]:${serverPort}`]);
    if (!legalHosts.has(host)) {
      securityHeaders(res);
      sendJson(res, 403, { ok: false, error: 'rejected: unrecognized Host header (this server is loopback-only)' });
      return;
    }

    // --- static: GET only, exact-name allowlist ------------------------------
    if (path === '/' || path === '/index.html') {
      if (method !== 'GET' && method !== 'HEAD') {
        securityHeaders(res);
        sendJson(res, 405, { ok: false, error: 'static content is read-only' });
        return;
      }
      securityHeaders(res, { 'Content-Type': 'text/html; charset=utf-8' });
      res.end(method === 'HEAD' ? undefined : opts.assets.html);
      return;
    }
    if (path.startsWith('/assets/')) {
      const name = path.slice('/assets/'.length);
      const asset = opts.assets.files.get(name); // exact-name allowlist: no traversal, no fs
      if (method !== 'GET' && method !== 'HEAD') {
        securityHeaders(res);
        sendJson(res, 405, { ok: false, error: 'static content is read-only' });
        return;
      }
      if (asset === undefined) {
        securityHeaders(res);
        sendJson(res, 404, { ok: false, error: 'no such asset' });
        return;
      }
      res.writeHead(200, {
        'Content-Type': `${asset.type}; charset=utf-8`,
        'Content-Security-Policy': CSP,
        'X-Content-Type-Options': 'nosniff',
        'Referrer-Policy': 'no-referrer',
        'Cross-Origin-Resource-Policy': 'same-origin',
        'Cross-Origin-Opener-Policy': 'same-origin',
        'Cache-Control': 'no-store',
      });
      res.end(method === 'HEAD' ? undefined : asset.content);
      return;
    }

    // --- API: everything under /api/<sessionId>/... --------------------------
    const apiMatch = /^\/api\/([A-Za-z0-9_-]+)\/([a-z/-]+)$/.exec(path);
    if (apiMatch === null) {
      securityHeaders(res);
      sendJson(res, 404, { ok: false, error: 'no such endpoint' });
      return;
    }
    const [, sessionId, op] = apiMatch;
    const KNOWN_OPS = new Set(['session', 'round/apply', 'review/apply-changes', 'approve', 'cancel']);
    if (!KNOWN_OPS.has(op)) {
      securityHeaders(res);
      sendJson(res, 404, { ok: false, error: 'no such endpoint' });
      return;
    }
    if (sessionId !== opts.sessionId) {
      securityHeaders(res);
      sendJson(res, 404, { ok: false, error: 'no such session' });
      return;
    }

    // --- guard 2: token (all API access) --------------------------------------
    if (!tokenMatches(req.headers['x-lco-session'] as string | undefined)) {
      securityHeaders(res);
      sendJson(res, 401, { ok: false, error: 'missing or invalid session token' });
      return;
    }

    // --- guard 3: Origin (when the browser sends one) -------------------------
    const origin = req.headers.origin;
    if (origin !== undefined && origin !== '' && origin !== `http://127.0.0.1:${serverPort}` && origin !== `http://localhost:${serverPort}`) {
      securityHeaders(res);
      sendJson(res, 403, { ok: false, error: 'rejected: cross-origin request' });
      return;
    }

    // --- guard 4: Sec-Fetch-Site (Fetch Metadata) -----------------------------
    const fetchSite = req.headers['sec-fetch-site'];
    if (fetchSite !== undefined && fetchSite !== 'same-origin' && fetchSite !== 'none') {
      securityHeaders(res);
      sendJson(res, 403, { ok: false, error: 'rejected: cross-site request' });
      return;
    }

    lastActivity = opts.nowMs?.() ?? Date.now();

    if (op === 'session') {
      if (method !== 'GET') {
        securityHeaders(res);
        sendJson(res, 405, { ok: false, error: 'reading the session is GET-only (mutations are POST)' });
        return;
      }
      securityHeaders(res);
      sendJson(res, 200, { ok: true, session: snapshotBefore() });
      return;
    }

    // everything else is a mutation: POST + JSON only
    if (method !== 'POST') {
      securityHeaders(res);
      sendJson(res, 405, { ok: false, error: `${op} is POST-only` });
      return;
    }
    const contentType = (req.headers['content-type'] ?? '').split(';')[0]!.trim();
    if (contentType !== 'application/json') {
      securityHeaders(res);
      sendJson(res, 415, { ok: false, error: 'mutations require Content-Type: application/json' });
      return;
    }
    const body = await readBody(req);
    if (!body.ok) {
      securityHeaders(res);
      sendJson(res, body.status, { ok: false, error: body.error });
      return;
    }
    let raw: unknown;
    try {
      raw = JSON.parse(body.text);
    } catch {
      securityHeaders(res);
      sendJson(res, 400, { ok: false, error: 'request body is not valid JSON' });
      return;
    }

    const before = snapshotBefore();

    if (op === 'round/apply') {
      const parsed = ApplyRoundRequestSchema.safeParse(raw);
      if (!parsed.success) {
        securityHeaders(res);
        sendJson(res, 422, { ok: false, error: `invalid answers submission: ${parsed.error.issues[0]?.path.join('.') ?? '<root>'} ${parsed.error.issues[0]?.message ?? ''}` });
        return;
      }
      if (before.state !== 'CLARIFICATION_REQUIRED') {
        securityHeaders(res);
        sendJson(res, 409, { ok: false, error: `answers cannot be applied in state '${before.state}'` });
        return;
      }
      emit('answers.submitted', { count: parsed.data.answers.length });
      const result = await opts.session.submitAnswers(parsed.data.answers as ClarificationAnswer[]);
      const after = snapshotBefore();
      emitDelta(before, after);
      if (!result.ok) {
        securityHeaders(res);
        sendJson(res, 422, { ok: false, error: result.error, session: after });
        return;
      }
      securityHeaders(res);
      sendJson(res, 200, { ok: true, session: after });
      return;
    }

    if (op === 'review/apply-changes') {
      const parsed = ReviewChangeSetSchema.safeParse(raw);
      if (!parsed.success) {
        securityHeaders(res);
        sendJson(res, 422, { ok: false, error: `invalid change set: ${parsed.error.issues[0]?.path.join('.') ?? '<root>'} ${parsed.error.issues[0]?.message ?? ''}` });
        return;
      }
      if (before.state !== 'FINAL_REVIEW' && before.state !== 'APPROVED') {
        securityHeaders(res);
        sendJson(res, 409, { ok: false, error: `changes cannot be applied in state '${before.state}'` });
        return;
      }
      const result = await opts.session.applyChangeSet(parsed.data);
      const after = snapshotBefore();
      if (!result.ok) {
        const stale =
          result.error.includes('review changed underneath') ||
          result.error.includes('changed since you selected') ||
          result.error.includes('does not exist in the current review');
        securityHeaders(res);
        sendJson(res, stale ? 409 : 422, { ok: false, error: result.error, session: after });
        return;
      }
      emit('changes.applied', { count: parsed.data.changes.length, reviewVersion: after.review?.reviewVersion ?? 0 });
      emitDelta(before, after);
      securityHeaders(res);
      sendJson(res, 200, { ok: true, session: after });
      return;
    }

    if (op === 'approve') {
      const parsed = ApproveRequestSchema.safeParse(raw);
      if (!parsed.success) {
        securityHeaders(res);
        sendJson(res, 422, { ok: false, error: `invalid approval request: ${parsed.error.issues[0]?.message ?? ''}` });
        return;
      }
      if (before.state !== 'FINAL_REVIEW') {
        securityHeaders(res);
        sendJson(res, 409, { ok: false, error: `approval is unavailable in state '${before.state}'` });
        return;
      }
      const result = opts.session.approve({ pendingChangeIds: parsed.data.pendingChangeIds });
      const after = snapshotBefore();
      if (!result.ok) {
        securityHeaders(res);
        sendJson(res, 422, { ok: false, error: result.error, session: after });
        return;
      }
      emit('spec.approved', { revision: after.approvedRevision ?? 0 });
      securityHeaders(res);
      sendJson(res, 200, { ok: true, session: after });
      return;
    }

    if (op === 'cancel') {
      const parsed = CancelRequestSchema.safeParse(raw);
      if (!parsed.success) {
        securityHeaders(res);
        sendJson(res, 422, { ok: false, error: 'cancel takes an empty JSON object' });
        return;
      }
      opts.session.cancel('cancelled from the browser');
      const after = snapshotBefore();
      emit('session.cancelled', {});
      securityHeaders(res);
      sendJson(res, 200, { ok: true, session: after });
      return;
    }

    securityHeaders(res);
    sendJson(res, 404, { ok: false, error: 'no such endpoint' });
  }

  // bind: loopback ONLY, dynamic port. The address assertion below is the
  // test-enforced guarantee that this can never be a LAN listener.
  await new Promise<void>((resolve, reject) => {
    server.once('error', reject);
    server.listen(0, '127.0.0.1', () => resolve());
  });
  const address = server.address();
  if (address === null || typeof address === 'string') {
    server.close();
    throw new Error('clarification server failed to bind to a loopback port');
  }
  const serverPort = address.port;

  // initial round runs at startup; `started` resolves when it finishes
  const started = (async () => {
    emit('session.started', {});
    try {
      const before = snapshotBefore();
      await opts.session.runInitialRound();
      emitDelta(before, snapshotBefore());
    } catch (err) {
      emit('session.http.error', { message: `initial round: ${(err as Error).message.slice(0, 200)}` });
    }
  })();

  // inactivity shutdown: no authenticated activity for the window → cancel + close
  const sweepEvery = Math.min(inactivityMs, 30_000);
  const sweep = (): void => {
    if (closed) return;
    const now = opts.nowMs?.() ?? Date.now();
    if (lastActivity !== Number.MAX_SAFE_INTEGER && now - lastActivity > inactivityMs) {
      emit('session.cancelled', { reason: 'inactivity' });
      opts.session.cancel('session inactive');
      void close();
      return;
    }
    inactivityTimer = setTimeout(sweep, sweepEvery);
    inactivityTimer.unref?.();
  };
  inactivityTimer = setTimeout(sweep, sweepEvery);
  inactivityTimer.unref?.();

  async function close(): Promise<void> {
    if (closed) return;
    closed = true;
    if (inactivityTimer !== undefined) clearTimeout(inactivityTimer);
    server.closeAllConnections?.();
    await new Promise<void>((resolve) => server.close(() => resolve()));
  }

  return {
    server,
    address: '127.0.0.1',
    port: serverPort,
    origin: `http://127.0.0.1:${serverPort}`,
    sessionUrl: sessionUrl('127.0.0.1', serverPort, opts.token),
    token: opts.token,
    started,
    close,
  };
}
