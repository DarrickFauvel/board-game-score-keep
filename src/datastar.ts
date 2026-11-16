import type { Request, Response } from 'express';
import { ServerSentEventGenerator } from '@starfederation/datastar-sdk';

/**
 * Datastar replies. Forms that save instantly post with Datastar
 * (`@post(url, {contentType: 'form'})`) and get a short event stream back:
 * a mark that flashes the field green, a toast, or patched HTML. The same
 * routes still answer an ordinary form post with a redirect, so every form
 * keeps working without JavaScript.
 */

export type Sse = ServerSentEventGenerator;

/** Whether the request came from Datastar rather than a plain form post. */
export const isDatastar = (req: Request) => req.get('datastar-request') === 'true';

/** Answer a Datastar request with a stream of patches, then close it. */
export function reply(req: Request, res: Response, fn: (sse: Sse) => void | Promise<void>) {
  return ServerSentEventGenerator.stream(req, res, async (sse) => { await fn(sse); });
}

export const escapeText = (s: string) => s.replace(/[&<>"']/g, (c) => (
  { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]!
));

/** Tells screen readers what happened; the visual cue is the field flash or toast. */
function announce(sse: Sse, message: string) {
  sse.patchElements(escapeText(message), { selector: '#status-announcer', mode: 'inner' });
}

/**
 * The field saved: its mark is replaced (not morphed), so the green flash
 * replays on every save. `mark` is the id of the field's `.autosave__mark`.
 */
export function saved(sse: Sse, mark: string, message = 'Saved') {
  sse.patchElements(
    `<span id="${mark}" class="autosave__mark" data-state="saved" aria-hidden="true"></span>`,
    { mode: 'replace' },
  );
  announce(sse, message);
}

/** The field didn't save: a red ring stays on it with the reason underneath. */
export function invalid(sse: Sse, mark: string, message: string) {
  sse.patchElements(
    `<span id="${mark}" class="autosave__mark" data-state="error" aria-hidden="true"></span>`,
    { mode: 'replace' },
  );
  sse.patchElements(
    `<span id="${mark}-error" class="form-error" role="alert">${escapeText(message)}</span>`,
  );
}

/** Clears a field's earlier error once it saves. */
export function clearError(sse: Sse, mark: string) {
  sse.patchElements(`<span id="${mark}-error" class="form-error"></span>`);
}

/** A toast, for things not tied to one field (a guest hidden, an error). */
export function toast(sse: Sse, message: string, kind: 'success' | 'error' = 'success') {
  sse.patchElements(toastHtml(message, kind), { selector: '#toasts', mode: 'append' });
}

/** Toast markup, shared with the layout's after-redirect toast. Removes itself. */
export function toastHtml(message: string, kind: 'success' | 'error' = 'success') {
  return `<div class="toast toast--${kind}" role="${kind === 'error' ? 'alert' : 'status'}"`
    + ` data-init="setTimeout(() => el.remove(), ${kind === 'error' ? 6000 : 3500})">${escapeText(message)}</div>`;
}

/* ─── After-redirect toasts ──────────────────────────────────────────────
   A plain post that redirects (delete a game → Games) can't stream, so it
   leaves a short-lived cookie that the next page shows as a toast. */

export const FLASH_COOKIE = 'flash';

export function flash(res: Response, message: string) {
  res.cookie(FLASH_COOKIE, message, { httpOnly: true, sameSite: 'lax', maxAge: 60_000, secure: process.env.NODE_ENV === 'production' });
}

/** Reads and clears the flash, so it shows once. */
export function takeFlash(req: Request, res: Response): string | null {
  const message = req.cookies?.[FLASH_COOKIE] as string | undefined;
  if (!message) return null;
  res.clearCookie(FLASH_COOKIE);
  return message.slice(0, 200);
}
