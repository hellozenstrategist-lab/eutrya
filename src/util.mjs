import { createHash, randomUUID } from 'node:crypto';

export function canonical(value) {
  if (value === undefined) throw new Error('Undefined is not serializable');
  if (value === null || typeof value !== 'object') return JSON.stringify(value);
  if (Array.isArray(value)) return `[${value.map(canonical).join(',')}]`;
  return `{${Object.keys(value).sort().map(k => `${JSON.stringify(k)}:${canonical(value[k])}`).join(',')}}`;
}
export const digest = value => createHash('sha256').update(canonical(value)).digest('hex');
export const textHash = text => createHash('sha256').update(text).digest('hex');
export const uid = () => randomUUID();
export const clip = (s, n = 6000) => {
  const t = typeof s === 'string' ? s : JSON.stringify(s);
  return t.length > n ? `${t.slice(0, n)}\n[truncated; use recall/read for the original]` : t;
};
export function insist(condition, message) { if (!condition) throw new Error(message); }
export function object(value, name) {
  insist(value !== null && typeof value === 'object' && !Array.isArray(value), `${name} must be an object`);
  return value;
}
export function string(value, name, max = 16000) {
  insist(typeof value === 'string' && value.length > 0 && value.length <= max, `${name} must be a nonempty string, at most ${max} characters`);
  return value;
}
export function finite(value, name, lo = 0, hi = Infinity) {
  insist(typeof value === 'number' && Number.isFinite(value) && value >= lo && value <= hi, `${name} must be between ${lo} and ${hi}`);
  return value;
}
export function integer(value, name, lo, hi) {
  finite(value, name, lo, hi); insist(Number.isInteger(value), `${name} must be an integer`); return value;
}
export function keys(value, allowed, name) {
  insist(Object.keys(value).every(k => allowed.includes(k)), `${name} contains unsupported fields`);
}
export function abortError() { return new DOMException('Stopped by operator', 'AbortError'); }
export function throwIfAborted(signal) { if (signal?.aborted) throw abortError(); }
export class Replan extends Error {}
export class UncertainEffect extends Error {}
export class BudgetError extends Error {}
export class TimeoutError extends Error {}
export function safeTerminal(text) {
  // Prevent model/file output from emitting terminal escapes, OSC hyperlinks, or control sequences.
  return String(text).replace(/\x1b\][^\x07]*(?:\x07|\x1b\\)/g, '')
    .replace(/\x1b\[[0-?]*[ -/]*[@-~]/g, '').replace(/[\x00-\x08\x0b-\x1f\x7f-\x9f]/g, '');
}
export function redactor(env = process.env) {
  const secrets = Object.entries(env).filter(([k, v]) => /(?:KEY|TOKEN|SECRET|PASSWORD)/i.test(k) && v && v.length >= 8).map(([, v]) => v);
  return value => {
    let s = typeof value === 'string' ? value : JSON.stringify(value);
    for (const secret of secrets) s = s.split(secret).join('[REDACTED]');
    return typeof value === 'string' ? s : JSON.parse(s);
  };
}
export async function deadline(fn, milliseconds, parent) {
  throwIfAborted(parent);
  const controller = new AbortController();
  const signal = parent ? AbortSignal.any([parent, controller.signal]) : controller.signal;
  let timer, listener;
  const stopped = new Promise((_, reject) => {
    timer = setTimeout(() => { controller.abort(); reject(new TimeoutError(`Provider timeout after ${milliseconds}ms; no automatic timeout retry`)); }, milliseconds);
    if (parent) {
      listener = () => { controller.abort(); reject(abortError()); };
      parent.addEventListener('abort', listener, { once: true });
    }
  });
  try { return await Promise.race([Promise.resolve().then(() => fn(signal)), stopped]); }
  finally { clearTimeout(timer); if (listener) parent.removeEventListener('abort', listener); }
}
export function usageOf(raw = {}) {
  const read = (...values) => values.find(v => typeof v === 'number' && Number.isFinite(v) && v >= 0) ?? null;
  return {
    inputTokens: read(raw.inputTokens, raw.prompt_tokens),
    outputTokens: read(raw.outputTokens, raw.completion_tokens),
    costUsd: read(raw.costUsd, raw.cost)
  };
}

export function htmlToText(html) {
  if (typeof html !== 'string') return '';
  return html
    .replace(/<script\b[^<]*(?:(?!<\/script>)<[^<]*)*<\/script>/gi, '')
    .replace(/<style\b[^<]*(?:(?!<\/style>)<[^<]*)*<\/style>/gi, '')
    .replace(/<svg\b[^<]*(?:(?!<\/svg>)<[^<]*)*<\/svg>/gi, '')
    .replace(/<!--[\s\S]*?-->/g, '')
    .replace(/<h[1-6][^>]*>(.*?)<\/h[1-6]>/gi, '\n\n# $1\n\n')
    .replace(/<li[^>]*>(.*?)<\/li>/gi, '\n- $1')
    .replace(/<p[^>]*>(.*?)<\/p>/gi, '\n\n$1\n\n')
    .replace(/<br\s*\/?>/gi, '\n')
    .replace(/<a\b[^>]*href=["\x27]([^"\x27]*)["\x27][^>]*>(.*?)<\/a>/gi, '$2 ($1)')
    .replace(/<[^>]+>/g, ' ')
    .replace(/&nbsp;/gi, ' ')
    .replace(/&amp;/gi, '&')
    .replace(/&lt;/gi, '<')
    .replace(/&gt;/gi, '>')
    .replace(/&quot;/gi, '"')
    .replace(/&#39;/gi, "\x27")
    .replace(/[ \t]+/g, ' ')
    .replace(/\n\s*\n\s*\n+/g, '\n\n')
    .trim();
}
