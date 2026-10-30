import { objectAppLink } from './objectLinks.js';
import { parseHttpsObjectLink } from './httpsLinks.js';

const names = { repo: ['Repository', 'repository'], map: ['Map', 'map'], ticket: ['Ticket', 'ticket'], prototype: ['Prototype', 'prototype'] } as const;
const icons = {
  repo: 'M5 4.5A1.5 1.5 0 0 1 6.5 3H19v15H6.5A1.5 1.5 0 0 0 5 19.5zM5 19.5A1.5 1.5 0 0 0 6.5 21H19v-3',
  map: 'M8 6.5 16 11M8 17.5l8-4.5M8 6a2 2 0 1 0-4 0 2 2 0 0 0 4 0M20 12a2 2 0 1 0-4 0 2 2 0 0 0 4 0M8 18a2 2 0 1 0-4 0 2 2 0 0 0 4 0',
  ticket: 'M7 4h10a3 3 0 0 1 3 3v10a3 3 0 0 1-3 3H7a3 3 0 0 1-3-3V7a3 3 0 0 1 3-3zM8 9h8M8 13h5',
  prototype: 'M5 5h14a2 2 0 0 1 2 2v10a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V7a2 2 0 0 1 2-2zM3 9h18M8 13h3M8 16h6',
};

function prependIcon(document: Document, target: HTMLElement, drawing: string): void {
  const icon = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
  for (const [key, value] of Object.entries({ viewBox: '0 0 24 24', fill: 'none', stroke: 'currentColor', 'stroke-width': '1.8', 'stroke-linecap': 'round', 'stroke-linejoin': 'round', 'aria-hidden': 'true' })) icon.setAttribute(key, value);
  const path = document.createElementNS('http://www.w3.org/2000/svg', 'path');
  path.setAttribute('d', drawing);
  icon.append(path);
  target.prepend(icon);
}

/** The host reads URL metadata only; app lookup and authorization stay in Wayfinder. */
export function renderHttpsLanding(document: Document, url: string): void {
  const link = parseHttpsObjectLink(url);
  const title = document.getElementById('destination-title');
  const kind = document.getElementById('destination-kind');
  const context = document.getElementById('destination-context');
  const open = document.getElementById('open-wayfinder');
  const fallback = document.getElementById('destination-fallback');
  if (!title || !kind || !context || !open || !fallback) throw new Error('Missing landing page elements');
  open.hidden = true;
  open.removeAttribute('href');
  fallback.hidden = true;
  context.hidden = false;
  if (!link) {
    title.textContent = 'This link can’t be opened';
    kind.textContent = 'Link not recognized';
    kind.setAttribute('data-invalid', '');
    prependIcon(document, kind, 'M21 12a9 9 0 1 0-18 0 9 9 0 0 0 18 0M12 7.5v5.5M12 16.5v.01');
    context.textContent = 'It may have been cut off. Ask for the link again.';
    return;
  }
  const [label, noun] = names[link.kind];
  title.textContent = `Open this ${noun} in Wayfinder`;
  kind.textContent = label;
  kind.removeAttribute('data-invalid');
  prependIcon(document, kind, icons[link.kind]);
  const details: string[] = [];
  if (link.kind === 'prototype') {
    details.push(link.revision ? `Version ${link.revision.slice(0, 7)}` : 'Newest version');
    if (link.page) details.push(`page ${link.page}`);
    if (link.item) details.push(link.item);
  }
  context.textContent = details.join(' · ');
  context.hidden = details.length === 0;
  open.setAttribute('href', objectAppLink(link));
  open.hidden = false;
  fallback.hidden = false;
}
