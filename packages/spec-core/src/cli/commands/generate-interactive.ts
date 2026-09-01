import { spawn } from 'node:child_process';
import { randomUUID } from 'node:crypto';
import { existsSync } from 'node:fs';
import { join } from 'node:path';
import type { LlmAdapter } from '../../eval/llm/adapter';
import type { RunBudgetSpec } from '../../eval/budget';
import type { ResolvedProfile } from '../../config/llm-config';
import { normalizeIntent, resolveGenerationRuntime } from './generate';
import { createClarifySession } from '../../clarify/session/orchestrator';
import type { SessionSnapshot } from '../../clarify/session/orchestrator';
import type { SessionEvent } from '../../server/http';
import { startClarifyServer } from '../../server/http';
import { generateSessionToken } from '../../server/tokens';
import { loadWorkspaceAssets } from '../../server/assets';
import type { StaticAssets } from '../../server/http';

/**
 * §5/§43 — `lco generate <dir> --intent … --interactive [--no-open]`: the
 * browser clarification workspace as an EXPLICIT opt-in. Headless generation
 * and `--answers` remain untouched; this command adds the interactive loop.
 *
 * Flow: the same gates as headless generate (intent preflight, no-clobber
 * BEFORE anything paid, shared runtime resolution), then a loopback-only
 * server hosting the canonical session, the browser opened when supported
 * (URL always printed as fallback), and the CLI process waits — the SESSION
 * is authoritative; SIGINT (wired at the CLI boundary) cancels it and NOTHING
 * is written. Only explicit approval in the browser persists artifacts
 * (spec/ + approvals/ + answers export) through the same atomic writers.
 *
 * Exit codes: 0 approved; 1 cancelled/failed (nothing written); 2 usage or
 * environment error (thrown to the CLI boundary).
 */

export interface GenerateInteractiveOptions {
  intent: string;
  variant: 'single' | 'council';
  profile: 'p-mini' | 'p-standard';
  nowIso: () => string;
  nowMs: () => number;
  llm?: LlmAdapter;
  llmProfile?: { name: string; resolved: ResolvedProfile };
  budget?: RunBudgetSpec;
  /** Suppress opening the browser (URL still printed). */
  noOpen?: boolean;
  /** Fired when the server is up (the CLI prints/opens; tests drive the API). */
  onReady?: (info: { origin: string; sessionUrl: string; token: string; sessionId: string }) => void;
  /** Structured session-event lines for terminal observability (§37). */
  onEvent?: (line: string) => void;
  /** Asset injection (tests/library); default loads the packaged workspace. */
  assets?: StaticAssets;
  /** Immediate line printer (the URL must appear while the session runs). */
  onLine?: (line: string) => void;
}

export interface GenerateInteractiveResult {
  /** 0 approved; 1 cancelled or failed (nothing written). */
  code: number;
  output: string;
}

const EVENT_LINES: Partial<Record<SessionEvent['type'], string>> = {
  'session.started': 'interactive session started',
  'questions.presented': 'questions presented',
  'answers.submitted': 'answers submitted',
  'clarification.discovered': 'new clarification discovered',
  'review.generated': 'behavior review generated',
  'changes.applied': 'review changes applied',
  'spec.approved': 'specification approved',
  'session.cancelled': 'session cancelled',
  'session.failed': 'session failed',
};

export async function cmdGenerateInteractive(
  dir: string,
  opts: GenerateInteractiveOptions,
): Promise<GenerateInteractiveResult> {
  // --- 0. intent preflight (UX-004: before ANYTHING paid) ----------------------
  const normalized = normalizeIntent(opts.intent);
  if (!normalized.ok) {
    throw new Error(`invalid intent: ${normalized.error}`);
  }
  const intent = normalized.intent;

  // --- 1. no-clobber BEFORE llm resolution (a bad invocation costs nothing) ----
  // (createClarifySession re-checks under its own precondition too.)
  if (existsSync(join(dir, 'spec'))) {
    throw new Error(`refusing to start: ${join(dir, 'spec')} already exists — remove it first or choose another directory`);
  }

  // --- shared gates (profile agreement, budget, fail-closed llm) ---------------
  const { topology, llm } = resolveGenerationRuntime(opts);

  const sessionId = `s-${randomUUID().slice(0, 8)}`;
  const session = createClarifySession({
    intent,
    profile: opts.profile,
    variant: opts.variant,
    topology,
    nowIso: opts.nowIso,
    nowMs: opts.nowMs,
    sessionId,
    dir,
    llm,
    enrich: true,
    budget: opts.budget,
  });

  const assets = opts.assets ?? loadWorkspaceAssets(sessionId);
  const handle = await startClarifyServer({
    session,
    sessionId,
    token: generateSessionToken(),
    assets,
    nowMs: opts.nowMs,
    onEvent: (event) => {
      const line = EVENT_LINES[event.type];
      if (line !== undefined) {
        opts.onEvent?.(line);
      }
    },
  });

  // Printed IMMEDIATELY (the owner needs the URL while the session runs);
  // repeated in the final output for scrollback.
  const announce: string[] = [
    `interactive clarification workspace: ${handle.sessionUrl}`,
    `session ${sessionId} — open the URL above in a browser; the token lives in the URL fragment and is never sent to the server`,
    opts.noOpen === true ? '(browser opening suppressed — open the URL above manually)' : '(opening your browser…)',
  ];
  for (const line of announce) {
    opts.onLine?.(line);
  }
  const lines = [...announce];

  opts.onReady?.({ origin: handle.origin, sessionUrl: handle.sessionUrl, token: handle.token, sessionId });
  if (opts.noOpen !== true) {
    openBrowser(handle.sessionUrl);
  }

  // --- wait for the authoritative session to end --------------------------------
  // The browser drives every transition; inactivity cancels server-side; the
  // CLI boundary's SIGINT handler cancels the session directly. The poll
  // reads ONLY the session snapshot (the server is not the source of truth
  // for state, the session is).
  const terminal = await waitForTerminal(session);
  await handle.close();

  if (terminal.state === 'APPROVED') {
    lines.push(
      `specification approved (revision ${terminal.snapshot.approvedRevision ?? 1}) — spec/, approvals/ and clarify-answers.json written under ${dir}`,
      `prompt protocol: ${terminal.snapshot.promptProtocol}`,
      usageLine(terminal.snapshot.usage),
    );
    return { code: 0, output: lines.join('\n') };
  }
  if (terminal.state === 'CANCELLED') {
    lines.push('session cancelled — nothing was written; start again or use the headless --answers flow');
    return { code: 1, output: lines.join('\n') };
  }
  lines.push(
    'the session could not continue — LCO stopped rather than guess; nothing was written:',
    ...(terminal.snapshot.failure?.reason ?? ['unknown failure']).map((r) => `  - ${r}`),
  );
  return { code: 1, output: lines.join('\n') };
}

/** Poll the authoritative snapshot until it reaches a terminal state. */
async function waitForTerminal(session: {
  snapshot(): SessionSnapshot;
}): Promise<{ state: 'APPROVED' | 'CANCELLED' | 'FAILED'; snapshot: SessionSnapshot }> {
  for (;;) {
    const snapshot = session.snapshot();
    if (snapshot.state === 'APPROVED' || snapshot.state === 'CANCELLED' || snapshot.state === 'FAILED') {
      return { state: snapshot.state, snapshot };
    }
    await new Promise((resolve) => setTimeout(resolve, 150));
  }
}

function usageLine(u: SessionSnapshot['usage']): string {
  const base = `session usage: ${u.calls} LLM call(s) / ${u.attempts} attempt(s), ${u.promptBytes} prompt bytes`;
  return u.usageKnown ? `${base}, ${u.in} in / ${u.out} out tokens` : `${base}, tokens unknown (provider reported no usage — unknown is not zero)`;
}

/** Best-effort browser open (never fatal; the URL is always printed). */
function openBrowser(url: string): void {
  try {
    const command = process.platform === 'darwin' ? 'open' : process.platform === 'win32' ? 'cmd' : 'xdg-open';
    const args = process.platform === 'win32' ? ['/c', 'start', '', url] : [url];
    const child = spawn(command, args, { detached: true, stdio: 'ignore' });
    child.on('error', () => {
      // no opener on this machine — the printed URL is the fallback
    });
    child.unref();
  } catch {
    // never fatal
  }
}
