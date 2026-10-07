// @vitest-environment happy-dom
import { describe, expect, it } from 'vitest';
import { escapeHtml } from './markdown.js';
import { insertTrustedHtml, setTrustedHtml } from './trustedHtml.js';

describe('trusted HTML sinks', () => {
  it('preserves markup, attributes, and escaped text when replacing content', () => {
    const host = document.createElement('div');
    host.textContent = 'Old content';
    const text = '<img src=x onerror=alert(1)> & "quoted"';
    setTrustedHtml(host, `<button type="button" data-ticket="11">${escapeHtml(text)}</button>`);
    const button = host.querySelector('button');
    expect(host.children).toHaveLength(1);
    expect(button?.textContent).toBe(text);
    expect(button?.getAttribute('data-ticket')).toBe('11');
    expect(host.querySelector('img')).toBeNull();
    setTrustedHtml(host, '');
    expect(host.childNodes).toHaveLength(0);
  });

  it.each(['beforebegin', 'afterbegin', 'beforeend', 'afterend'] as const)('inserts at %s without replacing existing nodes', (position) => {
    const parent = document.createElement('div');
    const host = document.createElement('section');
    const existing = document.createElement('button');
    host.append(existing);
    parent.append(host);
    insertTrustedHtml(host, position, '<span data-inserted>Inserted</span>');
    const inserted = parent.querySelector('[data-inserted]');
    expect(inserted?.textContent).toBe('Inserted');
    expect(host.querySelector('button')).toBe(existing);
    if (position === 'beforebegin') expect(host.previousElementSibling).toBe(inserted);
    if (position === 'afterend') expect(host.nextElementSibling).toBe(inserted);
    if (position === 'afterbegin') expect(host.firstElementChild).toBe(inserted);
    if (position === 'beforeend') expect(host.lastElementChild).toBe(inserted);
  });
});
