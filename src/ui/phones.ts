import type { PairedPhone } from '../phonePairing.js';
import type { PhoneConnectionState } from '../phoneConnection.js';
import { escapeHtml as esc } from './markdown.js';
import { insertTrustedHtml, setTrustedHtml } from './trustedHtml.js';
import { icon } from './icons.js';

export interface PhonesState { connection: PhoneConnectionState; phones: PairedPhone[]; code: { expiresAt: number; usedBy: string | null } | null }
interface Code { code: string; address: string; expiresAt: number; qr: string }
export const PHONE = '<rect x="6" y="2.5" width="12" height="19" rx="2.5"/><path d="M11 18h2"/>';
const COPY = '<rect x="9" y="9" width="12" height="12" rx="2"/><path d="M5 15H4a1 1 0 0 1-1-1V4a1 1 0 0 1 1-1h10a1 1 0 0 1 1 1v1"/>';
const UNLINK = '<path d="M9 17H7A5 5 0 0 1 7 7h2"/><path d="M15 7h2a5 5 0 0 1 4 8"/><path d="M8 12h4"/><path d="m3 3 18 18"/>';
const DESKTOP = '<rect x="2" y="4" width="20" height="13" rx="2"/><path d="M8 21h8M12 17v4"/>';
const QR = '<rect x="3" y="3" width="7" height="7" rx="1"/><rect x="14" y="3" width="7" height="7" rx="1"/><rect x="3" y="14" width="7" height="7" rx="1"/><path d="M14 14h3v3h-3zM20 14v.01M14 20h.01M17 20h4v-3"/>';
const BELL = '<path d="M6 8a6 6 0 1 1 12 0c0 7 3 9 3 9H3s3-2 3-9"/><path d="M10.3 21a1.9 1.9 0 0 0 3.4 0"/>';
const CHECK = '<path d="m5 12 5 5 9-10"/>';
const PLUS = '<path d="M12 5v14M5 12h14"/>';
export const pairedCount = (value: number): string => `${value} ${value === 1 ? 'phone' : 'phones'} paired`;
export const phoneNavCountHtml = (value: number): string => value ? `<span class="badge p335-nav-count" data-phone-count>${value}<span class="p335-sr">, ${pairedCount(value)}</span></span>` : '';
const head = (id: string, label: string, side = ''): string => `<div class="p335-sec-head"><h3 id="${id}">${label}</h3>${side}</div>`;

export function phoneSettingsHtml({ connection: c, phones }: PhonesState): string {
  const desktop = c.ready
    ? `<div class="settings-row p335-row"><span class="p335-tile">${icon(DESKTOP)}</span><span class="grow">${esc(c.name)}<span class="hint">Phones reach it at <code>${esc(c.address ?? '')}</code> through Tailscale.</span></span><span class="p335-status"><span class="p335-dot"></span>Ready to pair</span></div>`
    : `<div class="p335-prereq" role="alert"><div><b>Tailscale isn't running on ${esc(c.name)}</b><p class="hint">Phones reach this desktop through Tailscale. Start it, signed in to the same account as your phone, then check again. Phones already paired reconnect by themselves.</p></div><button type="button" class="ghost" data-recheck>Check again</button></div>`;
  const rows = phones.map(p => `<li class="settings-row p335-row p335-phone"><span class="p335-tile">${icon(PHONE)}</span><span class="grow">${esc(p.name)}<span class="hint">${esc(p.model)} · Paired ${esc(new Date(p.pairedAt).toLocaleString())} · Last reached ${esc(new Date(p.lastReachedAt).toLocaleString())}</span><span class="hint"><span class="p335-push${p.pushRegistered ? '' : ' is-off'}">${icon(BELL)}${p.pushRegistered ? 'Registered for pushes' : 'Not registered for pushes'}</span></span></span><button type="button" class="ghost" data-remove="${esc(p.id)}" aria-label="Remove ${esc(p.name)}">${icon(UNLINK)}Remove</button></li>`).join('');
  return `<p class="p335-lead-line">Phones paired with ${esc(c.name)} start tickets here and watch them run.</p><section class="settings-section" aria-labelledby="desk-title">${head('desk-title', 'This desktop')}${desktop}</section><section class="settings-section" aria-labelledby="phones-title">${head('phones-title', 'Paired phones', phones.length ? `<span class="p335-head-count">${pairedCount(phones.length)}</span>` : '')}<div class="settings-row p335-row"><span class="grow">Pair a phone<span class="hint">Shows a code that works once and expires after 5 minutes. Each phone gets its own token you can remove here.</span></span><button type="button" class="primary" data-pair${c.ready ? '' : ' disabled title="Start Tailscale on this desktop first"'}>${icon(QR)}Pair a phone</button></div>${phones.length ? `<ul class="p335-list" aria-label="Paired phones">${rows}</ul>` : `<p class="p335-empty">${icon(PHONE)}<span>No phones paired yet. Pair one to start tickets from it and watch them run.</span></p>`}</section>`;
}
export function removePhoneDialogHtml(phone: PairedPhone, desktop: string): string {
  return `<div class="dialog-head"><h2 id="phone-dialog-title" tabindex="-1">Remove ${esc(phone.name)}?</h2></div><p class="p335-dlg-body" id="phone-dialog-desc">${esc(phone.name)} can no longer start tickets or watch sessions on ${esc(desktop)}. ${phone.pushRegistered ? 'Its push registration is deleted, so it gets no more pushes from this desktop.' : 'It has no push registration to delete.'} Starts it is holding won't send. To use it again, pair it with a new code.</p><div class="p335-actions is-end"><button type="button" class="ghost" data-keep>Cancel</button><button type="button" class="p335-danger" data-confirm-remove>${icon(UNLINK)}Remove phone</button></div>`;
}
export function pairingDialogHtml(code: Code): string {
  const copy = (field: string, label: string): string => `<button type="button" class="iconbtn p335-copy" data-copy-${field} aria-label="Copy ${label}" title="Copy ${label}">${icon(COPY)}</button>`;
  return `<div class="dialog-head"><h2 id="phone-dialog-title" tabindex="-1">Pair a phone</h2><button type="button" class="detail-close" data-cancel aria-label="Close">×</button></div><div class="p335-code"><div class="p335-qr"><img class="p335-qr-svg" width="168" height="168" src="${esc(code.qr)}" alt="Pairing QR code"></div><div class="p335-code-main"><p class="p335-lead">On your phone, choose <b>Scan pairing code</b>. Or choose <b>Enter code instead</b> and type both lines.</p><dl class="p335-fields"><div><dt>Desktop address</dt><dd><code class="p335-type">${esc(code.address)}</code>${copy('address', 'desktop address')}</dd></div><div><dt>Pairing code</dt><dd><code class="p335-type is-code">${esc(code.code)}</code>${copy('code', 'pairing code')}</dd></div></dl><p class="p335-timer" data-countdown role="timer" aria-live="off"></p></div></div><div class="p335-actions"><button type="button" class="ghost" data-new>New code</button><button type="button" class="ghost" data-cancel>Cancel</button></div>`;
}
async function request<T>(path: string, method = 'GET', body?: unknown): Promise<T> {
  const response = await fetch(`/api/phones${path}`, { method, headers: { 'Content-Type': 'application/json' }, ...(body === undefined ? {} : { body: JSON.stringify(body) }) });
  const result = await response.json() as T & { error?: string };
  if (!response.ok) throw new Error(result.error ?? 'Desktop operation unavailable.');
  return result;
}

/** #335 Round 4 A4: one Phones category, two synchronized counts, pairing/removal dialogs. */
export function mountPhoneSettings(root: HTMLElement, count: (value: number) => void, toast: (message: string) => void): void {
  let state: PhonesState | null = null;
  let code: Code | null = null;
  let lastHtml = '';
  let dialog: HTMLDialogElement | null = null;
  let busy = false;
  const close = (): void => { dialog?.close(); dialog?.remove(); dialog = null; code = null; root.querySelector<HTMLButtonElement>('[data-pair]')?.focus(); };
  const showDialog = (html: string): HTMLDialogElement => {
    dialog?.close(); dialog?.remove();
    dialog = document.createElement('dialog');
    dialog.className = 'dialog p335-dialog';
    dialog.setAttribute('aria-labelledby', 'phone-dialog-title');
    setTrustedHtml(dialog, html);
    root.append(dialog);
    dialog.showModal();
    return dialog;
  };
  const draw = (): void => {
    if (!state) return;
    const content = root.querySelector<HTMLElement>('[data-phone-content]')!;
    const html = phoneSettingsHtml(state);
    if (html !== lastHtml) { setTrustedHtml(content, html); lastHtml = html; }
    count(state.phones.length);
  };
  const refresh = async (force = false): Promise<void> => {
    const next = await request<PhonesState>(force ? '?refresh=1' : '');
    if (!root.isConnected) return;
    state = next; draw();
    if (code && dialog) {
      const paired = next.code?.expiresAt === code.expiresAt ? next.phones.find(phone => phone.id === next.code?.usedBy) : undefined;
      if (paired) {
        const active = dialog;
        setTrustedHtml(active, `<div class="dialog-head"><h2 id="phone-dialog-title" tabindex="-1">Pair a phone</h2><button type="button" class="detail-close" data-done aria-label="Close">×</button></div><div class="p335-done" role="status"><span class="p335-done-mark">${icon(CHECK)}</span><div><h3 class="p335-done-title">Paired with ${esc(paired.name)}</h3><p class="hint">Code <code class="p335-used">${esc(code.code)}</code> was used at ${esc(new Date(paired.pairedAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }))} and no longer works. ${esc(paired.name)} is in Paired phones.</p></div></div><div class="p335-actions"><button type="button" class="primary" data-another>${icon(PLUS)}Pair another phone</button><button type="button" class="ghost" data-done>Done</button></div>`);
        code = null;
        active.querySelectorAll('[data-done]').forEach(button => button.addEventListener('click', close));
        active.querySelector('[data-another]')?.addEventListener('click', () => { void newCode().catch(fail); });
      }
    }
  };
  const fail = (error: unknown): void => toast(error instanceof Error ? error.message : String(error));
  const newCode = async (): Promise<void> => {
    if (busy) return;
    busy = true;
    try {
      code = await request<Code>('/code', 'POST');
      if (!root.isConnected) return;
      const active = showDialog(pairingDialogHtml(code));
      const current = code;
      active.querySelector('[data-copy-address]')?.addEventListener('click', () => { void navigator.clipboard.writeText(current.address).catch(fail); });
      active.querySelector('[data-copy-code]')?.addEventListener('click', () => { void navigator.clipboard.writeText(current.code).catch(fail); });
      active.querySelector('[data-new]')?.addEventListener('click', () => { void newCode().catch(fail); });
      const cancel = (): void => { code = null; void request('/code', 'DELETE').catch(fail); close(); };
      active.querySelectorAll('[data-cancel]').forEach(button => button.addEventListener('click', cancel));
      active.addEventListener('cancel', event => { event.preventDefault(); cancel(); });
      const tick = (): void => {
        if (!active.isConnected || code !== current) return;
        const seconds = Math.max(0, Math.ceil((current.expiresAt - Date.now()) / 1000));
        const expires = new Date(current.expiresAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
        active.querySelector('[data-countdown]')!.textContent = seconds ? `Works once · expires in ${Math.floor(seconds / 60)}:${String(seconds % 60).padStart(2, '0')} (at ${expires})` : `Expired at ${expires}. This code no longer works.`;
        if (!seconds) {
          active.querySelector('.p335-code')!.classList.add('is-expired');
          if (!active.querySelector('.p335-qr-over')) insertTrustedHtml(active.querySelector('.p335-qr')!, 'beforeend', '<span class="p335-qr-over" aria-hidden="true">Expired</span>');
          active.querySelector('.is-code')!.classList.add('is-expired');
          active.querySelector('[data-copy-code]')?.remove();
          active.querySelector('[data-new]')!.className = 'primary';
          active.querySelectorAll('[data-cancel]').forEach(button => { if (!button.hasAttribute('aria-label')) button.textContent = 'Close'; });
          active.querySelector('[data-new]')!.textContent = 'Show a new code';
        }
        setTimeout(tick, 1000);
      };
      tick();
    } finally { busy = false; }
  };
  setTrustedHtml(root, '<div data-phone-content><p role="status">Loading…</p></div>');
  root.addEventListener('click', event => {
    const target = event.target instanceof Element ? event.target.closest<HTMLElement>('button') : null;
    if (!target) return;
    if (target.hasAttribute('data-pair')) void newCode().catch(fail);
    if (target.hasAttribute('data-recheck')) void refresh(true).catch(fail);
    const phone = state?.phones.find(item => item.id === target.dataset['remove']);
    if (phone) {
      const active = showDialog(removePhoneDialogHtml(phone, state!.connection.name));
      active.classList.add('is-small');
      active.setAttribute('role', 'alertdialog');
      active.setAttribute('aria-describedby', 'phone-dialog-desc');
      active.querySelector('[data-keep]')?.addEventListener('click', close);
      active.querySelector<HTMLButtonElement>('[data-confirm-remove]')?.addEventListener('click', event => {
        (event.currentTarget as HTMLButtonElement).disabled = true;
        void request('/revoke', 'POST', { id: phone.id }).then(async () => { close(); await refresh(); toast(`Removed ${phone.name}.`); }).catch(fail);
      });
    }
  });
  const poll = async (): Promise<void> => {
    if (!root.isConnected) return;
    try { await refresh(); } catch (error) { fail(error); }
    if (root.isConnected) setTimeout(() => { void poll(); }, 2000);
  };
  void poll();
}
