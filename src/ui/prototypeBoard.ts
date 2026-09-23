import type { Prototype, Ticket, WayfinderMap } from '../types.js';
import { prototypeFileUrl } from '../prototypes.js';
import { escapeHtml } from './markdown.js';
import { previewUrl, verdictGist } from './prototypeTile.js';

export type PrototypeDecisionState = 'waiting' | 'building' | 'decided';

export interface PrototypeVariant {
  id: string;
  title: string;
  imageFile: string | null;
  pageFile: string | null;
}

export interface PrototypeCardState {
  state: PrototypeDecisionState;
  pickTicket: Ticket | null;
}

const STATUS_ORDER: Record<PrototypeDecisionState, number> = { waiting: 0, building: 1, decided: 2 };
const IMAGE_FILE = /\.(?:avif|gif|jpe?g|png|webp)$/i;
const HTML_FILE = /\.html?$/i;
const VARIANT_DIRECTORY = /(?:^|\/)(?:(?:assets\/)?(?:protos?|variants?|screenshots?|thumbnails?)(?:\/|[-_])|(?:variant|direction|option|after)[-_])/i;
const ACTION_LINE = /\b(?:pick(?:ed)?|choose|chose|chosen|select(?:ed)?|ship(?:ped)?|use|uses|using|winner|winning|decision|decided|confirmed|mix(?:ed)?)\b/i;

function basename(file: string): string {
  return file.split('/').at(-1)?.replace(/\.[^.]+$/, '') ?? file;
}

function sentenceCase(value: string): string {
  const words = value.replace(/[-_]+/g, ' ').trim();
  return words.length === 0 ? '' : `${words[0]?.toUpperCase() ?? ''}${words.slice(1)}`;
}

function fileVariant(file: string, index: number, ticketNumber: number): PrototypeVariant | null {
  const name = basename(file);
  let stem = name;
  const numberPrefix = /^(\d+)[-_](.+)$/.exec(stem);
  if (numberPrefix !== null) {
    if (Number(numberPrefix[1]) !== ticketNumber) return null;
    stem = numberPrefix[2] ?? stem;
  }

  const prefixed = /^(?:variant|direction|option|after)[-_]([a-z]{1,2})(?:[-_](.+))?$/i.exec(stem);
  const simple = /^([a-z]{1,2})(?:[-_](.+))?$/i.exec(stem);
  const parsed = prefixed ?? simple;
  const fallbackId = String.fromCharCode(65 + (index % 26));
  const id = (parsed?.[1] ?? fallbackId).toUpperCase();
  const suffix = parsed?.[2] ?? '';
  const title = suffix === '' ? `Variant ${id}` : sentenceCase(suffix);
  return {
    id,
    title,
    imageFile: IMAGE_FILE.test(file) ? file : null,
    pageFile: HTML_FILE.test(file) ? file : null,
  };
}

export function prototypeVariants(prototype: Prototype): PrototypeVariant[] {
  const files = [
    ...prototype.files.filter((file) => IMAGE_FILE.test(file) && VARIANT_DIRECTORY.test(file)),
    ...prototype.openable.filter((file) => HTML_FILE.test(file) && file !== prototype.preview && VARIANT_DIRECTORY.test(file)),
  ];
  const variants = new Map<string, PrototypeVariant>();
  files.forEach((file, index) => {
    const candidate = fileVariant(file, index, prototype.ticketNumber);
    if (candidate === null) return;
    const existing = variants.get(candidate.id);
    if (existing === undefined) {
      variants.set(candidate.id, candidate);
      return;
    }
    variants.set(candidate.id, {
      id: candidate.id,
      title: existing.title.startsWith('Variant ') && !candidate.title.startsWith('Variant ') ? candidate.title : existing.title,
      imageFile: existing.imageFile ?? candidate.imageFile,
      pageFile: existing.pageFile ?? candidate.pageFile,
    });
  });

  if (variants.size === 0) return [{ id: 'A', title: 'Preview', imageFile: null, pageFile: null }];
  return [...variants.values()].sort((a, b) => a.id.localeCompare(b.id, undefined, { numeric: true }));
}

export function prototypeCardState(map: WayfinderMap, prototype: Prototype): PrototypeCardState {
  const ownTicket = map.tickets.find((ticket) => ticket.number === prototype.ticketNumber);
  const tickets = [...map.tickets, ...map.outside];
  const pickTicket = tickets.find(
    (candidate) =>
      candidate.type === 'grilling' &&
      candidate.open &&
      (candidate.blockedBy.includes(prototype.ticketNumber) ||
        ownTicket?.blockedBy.includes(candidate.number) === true ||
        ownTicket?.openBlockers.includes(candidate.number) === true),
  ) ?? null;
  if (pickTicket !== null) return { state: 'waiting', pickTicket };
  return { state: ownTicket?.open === false || (ownTicket === undefined && prototype.verdict !== null) ? 'decided' : 'building', pickTicket: null };
}

export function pickedVariantIds(verdict: string, variantIds: readonly string[]): string[] {
  const lines = verdict.split(/\r?\n/).filter((line) => ACTION_LINE.test(line));
  const joinedIds = new Set<string>();
  for (const line of lines) {
    const compact = line.replace(/\b([a-z])\s*(?:\+|&|and)\s*([a-z])\b/gi, '$1$2');
    for (const id of variantIds) {
      if (id.length > 1 && new RegExp(`\\b${id.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}\\b`, 'i').test(compact)) joinedIds.add(id);
    }
  }
  if (joinedIds.size > 0) return [...joinedIds];

  const selected = new Set<string>();
  for (const line of lines) {
    for (const id of variantIds) {
      if (new RegExp(`\\b${id.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}\\b`, 'i').test(line)) selected.add(id);
    }
  }
  return [...selected];
}

function dateLabel(updatedAt: string | null): string {
  if (updatedAt === null) return '';
  const date = new Date(updatedAt);
  return Number.isNaN(date.getTime()) ? '' : date.toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' });
}

function variantLink(repo: string, prototype: Prototype, variant: PrototypeVariant): string {
  const file = variant.imageFile ?? variant.pageFile;
  return file === null ? previewUrl(repo, prototype) ?? prototype.url : prototypeFileUrl(repo, prototype.branch, file);
}

function variantThumbnail(repo: string, prototype: Prototype, variant: PrototypeVariant): string {
  const image = variant.imageFile === null ? '' : prototypeFileUrl(repo, prototype.branch, variant.imageFile);
  const page = variant.pageFile === null ? '' : prototypeFileUrl(repo, prototype.branch, variant.pageFile);
  const href = variantLink(repo, prototype, variant);
  const label = `Open variant ${variant.id}: ${variant.title}`;
  const content = image !== ''
    ? `<img class="decision-variant-image" src="${escapeHtml(image)}" alt="" loading="lazy" />${page === '' ? '' : `<iframe class="decision-variant-page" src="${escapeHtml(page)}" sandbox="allow-scripts" loading="lazy" tabindex="-1" aria-hidden="true" title="" width="1280" height="800" hidden></iframe>`}<span class="decision-variant-fallback" hidden>Preview image unavailable</span>`
    : page !== ''
      ? `<iframe src="${escapeHtml(page)}" sandbox="allow-scripts" loading="lazy" tabindex="-1" aria-hidden="true" title="" width="1280" height="800"></iframe>`
      : '<span class="decision-variant-fallback">Preview image unavailable</span>';
  return `<a class="proto-thumb decision-variant-thumb${image === '' && page === '' ? ' is-empty' : ''}" href="${escapeHtml(href)}" target="_blank" rel="noreferrer" aria-label="${escapeHtml(label)}">${content}<span class="proto-open">Open variant</span></a>`;
}

function cardHtml(repo: string, map: WayfinderMap, prototype: Prototype): string {
  const ticket = map.tickets.find((candidate) => candidate.number === prototype.ticketNumber);
  const decision = prototypeCardState(map, prototype);
  const variants = prototypeVariants(prototype);
  const selected = decision.state === 'decided'
    ? pickedVariantIds(prototype.verdict ?? '', variants.map((variant) => variant.id))
    : [];
  const statusText = decision.state === 'waiting' ? 'Waiting on your pick' : decision.state === 'building' ? 'Being built' : 'Decided';
  const summarySource = prototype.verdict ?? ticket?.body ?? '';
  const summary = verdictGist(summarySource) || (decision.state === 'building' ? 'This prototype is still being built.' : 'Prototype decision recorded.');
  const date = dateLabel(prototype.updatedAt);
  const canvas = previewUrl(repo, prototype) ?? prototype.url;
  const variantHtml = variants
    .map((variant) => {
      const isPicked = selected.includes(variant.id);
      const isDim = selected.length > 0 && !isPicked;
      const stateClass = isPicked ? ' is-picked' : isDim ? ' is-dim' : '';
      const marker = isPicked ? '<span class="decision-variant-check" aria-hidden="true">✓</span><span class="sr-only">Picked winner:</span>' : '';
      return `<div class="decision-variant${stateClass}" role="listitem">${variantThumbnail(repo, prototype, variant)}<span class="decision-variant-label">${marker}<span>${escapeHtml(`${variant.id} · ${variant.title}`)}</span></span></div>`;
    })
    .join('');
  const pickAction = decision.pickTicket === null
    ? ''
    : `<button type="button" class="ghost" data-jump="${String(decision.pickTicket.number)}">Pick in #${String(decision.pickTicket.number)}</button>`;
  const ticketTitle = ticket?.title ?? prototype.branch;
  const heading = ticket === undefined
    ? `<h2>#${String(prototype.ticketNumber)} ${escapeHtml(ticketTitle)}</h2>`
    : `<h2><button type="button" class="linkish" data-jump="${String(prototype.ticketNumber)}">#${String(prototype.ticketNumber)} ${escapeHtml(ticketTitle)}</button></h2>`;
  return `<article class="decision-card is-${decision.state}">
    <header class="decision-card-header">
      <div class="decision-card-title"><span class="decision-status is-${decision.state}">${escapeHtml(statusText)}</span>${heading}</div>
      ${date === '' ? '' : `<time class="decision-date" datetime="${escapeHtml(prototype.updatedAt ?? '')}">${escapeHtml(date)}</time>`}
      <div class="decision-card-actions">${pickAction}<a class="${decision.state === 'waiting' ? 'primary' : 'ghost'}" href="${escapeHtml(canvas)}" target="_blank" rel="noreferrer" aria-label="Open the #${String(prototype.ticketNumber)} prototype canvas"><span data-icon="play" aria-hidden="true"></span>Canvas</a></div>
    </header>
    <p class="decision-summary">${escapeHtml(summary)}</p>
    <div class="decision-variant-strip" role="list" aria-label="Variants for #${String(prototype.ticketNumber)}">${variantHtml}</div>
  </article>`;
}

export function sortPrototypeCards(map: WayfinderMap, prototypes: readonly Prototype[]): Prototype[] {
  return [...prototypes].sort((a, b) => {
    const stateDifference = STATUS_ORDER[prototypeCardState(map, a).state] - STATUS_ORDER[prototypeCardState(map, b).state];
    return stateDifference || (b.updatedAt ?? '').localeCompare(a.updatedAt ?? '') || a.ticketNumber - b.ticketNumber;
  });
}

export function prototypeBoardHtml(repo: string, map: WayfinderMap, prototypes: readonly Prototype[]): string {
  if (prototypes.length === 0) {
    return `<div class="decision-board-empty"><p class="eyebrow">Prototypes · map #${String(map.number)}</p><h1>No prototypes yet</h1><p>When a prototype ticket on this map pushes its prototype branch, its canvas shows up here.</p></div>`;
  }
  return `<div class="decision-board-sheet"><p class="eyebrow">${String(prototypes.length)} prototype${prototypes.length === 1 ? '' : 's'} · map #${String(map.number)}</p><div class="decision-board">${sortPrototypeCards(map, prototypes)
    .map((prototype) => cardHtml(repo, map, prototype))
    .join('')}</div></div>`;
}

export function prototypeBoardLoadingHtml(): string {
  return '<p class="empty decision-board-status" role="status" aria-live="polite">Looking for prototype branches…</p>';
}

export function prototypeBoardErrorHtml(message: string): string {
  return `<div class="empty decision-board-status" role="alert"><strong>Could not read the prototypes</strong><p>${escapeHtml(message)}</p><button type="button" class="ghost" data-prototype-retry><span data-icon="refresh" aria-hidden="true"></span>Try again</button></div>`;
}
