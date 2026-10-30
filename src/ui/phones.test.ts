// @vitest-environment happy-dom
import { afterEach, expect, it, vi } from 'vitest';
import { mountPhoneSettings, pairingDialogHtml, phoneNavCountHtml, phoneSettingsHtml, removePhoneDialogHtml } from './phones.js';
import type { PhonesState } from './phones.js';
import { settingsNavigationHtml } from './settings.js';
import { setTrustedHtml } from './trustedHtml.js';

const phone = { id: 'phone-1', name: '<img src=x onerror=alert(1)>', model: 'Android', pairedAt: 1000, lastReachedAt: 1000, pushRegistered: false };
const state: PhonesState = { connection: { name: 'Desktop', ready: true, address: 'http://100.64.1.2:4479' }, phones: [phone], code: null };
afterEach(() => { document.body.replaceChildren(); vi.useRealTimers(); vi.unstubAllGlobals(); vi.restoreAllMocks(); });

it('keeps A4 counts synchronized, singular, and escaped without duplicate pairing controls', () => {
  const root = document.createElement('div');
  setTrustedHtml(root, phoneSettingsHtml(state));
  expect(root.querySelectorAll('[data-pair]')).toHaveLength(1);
  expect(root.querySelector('.p335-head-count')?.textContent).toBe('1 phone paired');
  expect(root.querySelectorAll('img')).toHaveLength(0);
  expect(root.textContent).toContain(phone.name);
  expect(root.textContent).toContain('Not registered for pushes');
  const nav = document.createElement('nav');
  setTrustedHtml(nav, settingsNavigationHtml('phones', false, 1));
  expect(nav.querySelector('[data-phone-count]')?.textContent).toBe('1, 1 phone paired');
  expect(nav.querySelectorAll('[data-settings-category="phones"]')).toHaveLength(1);
  expect(phoneNavCountHtml(0)).toBe('');
});

it('keeps prerequisite, empty and removal states consistent with A4 and actual push registration', () => {
  const offline = phoneSettingsHtml({ ...state, connection: { ...state.connection, ready: false, address: null }, phones: [] });
  expect(offline).toContain('No phones paired yet. Pair one to start tickets from it and watch them run.');
  expect(offline).toContain('data-pair disabled');
  expect(offline).not.toContain('Ready to pair');
  expect(removePhoneDialogHtml(phone, 'Desktop')).toContain('It has no push registration to delete.');
  expect(removePhoneDialogHtml({ ...phone, pushRegistered: true }, 'Desktop')).toContain('Its push registration is deleted');
  expect(removePhoneDialogHtml(phone, 'Desktop').indexOf('data-keep')).toBeLessThan(removePhoneDialogHtml(phone, 'Desktop').indexOf('data-confirm-remove'));
  expect(pairingDialogHtml({ code: 'ABCD-EFGH', address: state.connection.address!, qr: 'data:image/png;base64,', expiresAt: 1000 })).toContain('aria-label="Copy pairing code"');
});

it('cancels the real code on Escape and switches an expired code to the approved actions', async () => {
  vi.useFakeTimers();
  vi.setSystemTime(new Date(1000));
  const fetcher = vi.fn(async (url: string, options?: RequestInit) => new Response(JSON.stringify(url.endsWith('/code') && options?.method === 'POST'
    ? { code: 'ABCD-EFGH', address: state.connection.address, qr: 'data:image/png;base64,', expiresAt: 301_000 }
    : state), { status: 200 }));
  vi.stubGlobal('fetch', fetcher);
  const root = document.createElement('div'); document.body.append(root);
  mountPhoneSettings(root, vi.fn(), vi.fn());
  await vi.advanceTimersByTimeAsync(0);
  root.querySelector<HTMLButtonElement>('[data-pair]')!.click();
  await vi.advanceTimersByTimeAsync(0);
  const dialog = root.querySelector<HTMLDialogElement>('dialog')!;
  expect(dialog).not.toBeNull();
  await vi.advanceTimersByTimeAsync(300_000);
  expect(dialog.querySelector('[data-new]')?.textContent).toBe('Show a new code');
  expect(dialog.querySelector('.p335-actions [data-cancel]')?.textContent).toBe('Close');
  expect(dialog.querySelector('[data-copy-code]')).toBeNull();
  dialog.dispatchEvent(new Event('cancel', { cancelable: true }));
  await vi.advanceTimersByTimeAsync(0);
  expect(fetcher).toHaveBeenCalledWith('/api/phones/code', expect.objectContaining({ method: 'DELETE' }));
  expect(root.querySelector('dialog')).toBeNull();
});

it('reports pairing success only for the phone that consumed the displayed code', async () => {
  vi.useFakeTimers();
  vi.setSystemTime(new Date(1000));
  let current: PhonesState = { ...state, phones: [], code: null };
  vi.stubGlobal('fetch', vi.fn(async (url: string, options?: RequestInit) => new Response(JSON.stringify(url.endsWith('/code') && options?.method === 'POST'
    ? { code: 'ABCD-EFGH', address: state.connection.address, qr: 'data:image/png;base64,', expiresAt: 301_000 }
    : current), { status: 200 })));
  const root = document.createElement('div'); document.body.append(root);
  mountPhoneSettings(root, vi.fn(), vi.fn());
  await vi.advanceTimersByTimeAsync(0);
  root.querySelector<HTMLButtonElement>('[data-pair]')!.click();
  await vi.advanceTimersByTimeAsync(0);
  current = { ...state, code: { expiresAt: 301_000, usedBy: 'unrelated-phone' } };
  await vi.advanceTimersByTimeAsync(2000);
  expect(root.querySelector('[data-done]')).toBeNull();
  current = { ...state, code: { expiresAt: 301_000, usedBy: phone.id } };
  await vi.advanceTimersByTimeAsync(2000);
  expect(root.querySelector('.p335-done-title')?.textContent).toBe(`Paired with ${phone.name}`);
  expect(root.querySelector('[onerror]')).toBeNull();
  root.querySelector<HTMLButtonElement>('[data-done]')!.click();
  expect(root.querySelector('dialog')).toBeNull();
});
