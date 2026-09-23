import type { Prototype, Ticket, WayfinderMap } from '../types.js';
import { prototypeFileUrl, prototypeShotUrl } from '../prototypes.js';
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

/** Lines that say what was picked; a line about what was *not* picked never names a winner. */
const REJECTED_LINE = /\bnot\s+(?:chosen|picked|selected|shipped)\b|\brejected\b/i;
/** The verdict's own answer: "**Answer:** C, goal first", "Verdict: A + B". */
const ANSWER_LINE = /^[\s>*_#-]*(?:answer|verdict|decision|picked|winner)\b[\s*_:]*/i;

function idPattern(id: string): RegExp {
  return new RegExp(`\\b${id.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}\\b`);
}

function idsIn(line: string, variantIds: readonly string[]): string[] {
  const compact = line.replace(/\b([A-Z])\s*(?:\+|&|and)\s*([A-Z])\b/g, '$1$2');
  const joined = variantIds.filter((id) => id.length > 1 && idPattern(id).test(compact));
  if (joined.length > 0) return joined;
  return variantIds.filter((id) => idPattern(id).test(line));
}

/**
 * The variants a verdict picked. The answer line wins when there is one, then an explicit
 * "direction D", then any line that says what was picked or shipped. Letters are matched as
 * capitals only, so "a" in prose never counts, and "C is not chosen" never makes C a winner.
 */
export function pickedVariantIds(verdict: string, variantIds: readonly string[]): string[] {
  const lines = verdict.split(/\r?\n/).filter((line) => !REJECTED_LINE.test(line));
  for (const line of lines) {
    if (!ANSWER_LINE.test(line)) continue;
    const answer = line.replace(ANSWER_LINE, '').split(/[.;]\s/)[0] ?? '';
    const ids = idsIn(answer, variantIds);
    if (ids.length > 0) return ids;
  }
  for (const line of lines) {
    const named = [...line.matchAll(/\b(?:direction|variant|option)\s+\**([A-Z]{1,2})\b/g)].map((match) => match[1] ?? '');
    const ids = variantIds.filter((id) => named.includes(id));
    if (ids.length > 0) return ids;
  }
  const selected = new Set<string>();
  for (const line of lines.filter((candidate) => ACTION_LINE.test(candidate))) {
    for (const id of idsIn(line, variantIds)) selected.add(id);
  }
  return [...selected];
}

function dateLabel(updatedAt: string | null): string {
  if (updatedAt === null) return '';
  const date = new Date(updatedAt);
  return Number.isNaN(date.getTime()) ? '' : date.toLocaleDateString(undefined, { month: 'short', day: 'numeric' });
}

/** A variant ready to draw: its letter and name, a picture to show, and where it opens. */
export interface BoardVariant {
  id: string;
  title: string;
  image: string | null;
  page: string | null;
}

/** The canvas's own variants when the server read them, otherwise ones guessed from the branch's files. */
export function boardVariants(repo: string, prototype: Prototype): BoardVariant[] {
  if (prototype.variants !== undefined && prototype.variants.length > 0) {
    return prototype.variants.map((variant) => ({
      id: variant.id,
      title: variant.title,
      image: variant.shot === null ? null : prototypeShotUrl(repo, variant.shot),
      page: variant.page === null ? null : prototypeFileUrl(repo, prototype.branch, variant.page),
    }));
  }
  return prototypeVariants(prototype).map((variant) => ({
    id: variant.id,
    title: variant.title,
    image: variant.imageFile === null ? null : prototypeFileUrl(repo, prototype.branch, variant.imageFile),
    page: variant.pageFile === null ? null : prototypeFileUrl(repo, prototype.branch, variant.pageFile),
  }));
}

function variantFrame(variant: BoardVariant): string {
  const livePage = (hidden: boolean): string =>
    variant.page === null
      ? ''
      : `<iframe class="decision-variant-page" src="${escapeHtml(variant.page)}" sandbox="allow-scripts" loading="lazy" tabindex="-1" aria-hidden="true" title="" width="1280" height="800"${hidden ? ' hidden' : ''}></iframe>`;
  const picture = variant.image !== null
    ? `<img class="decision-variant-image" src="${escapeHtml(variant.image)}" alt="" loading="lazy" />${livePage(true)}<span class="decision-variant-fallback" hidden>Preview image unavailable</span>`
    : variant.page !== null
      ? livePage(false)
      : '<span class="decision-variant-fallback">Preview image unavailable</span>';
  return `<span class="wf-frame proto-thumb${variant.image === null && variant.page === null ? ' is-empty' : ''}">${picture}<span class="tag">${escapeHtml(variant.id)}</span></span>`;
}

function cardHtml(repo: string, map: WayfinderMap, prototype: Prototype): string {
  const ticket = map.tickets.find((candidate) => candidate.number === prototype.ticketNumber);
  const decision = prototypeCardState(map, prototype);
  const variants = boardVariants(repo, prototype);
  const selected = decision.state !== 'decided'
    ? []
    : variants.length === 1
      ? [variants[0]?.id ?? '']
      : pickedVariantIds(prototype.verdict ?? '', variants.map((variant) => variant.id)).sort((a, b) => variants.findIndex((variant) => variant.id === a) - variants.findIndex((variant) => variant.id === b));
  const ticketTitle = ticket?.title ?? prototype.branch;
  const canvas = previewUrl(repo, prototype) ?? prototype.url;
  const status = decision.state === 'waiting'
    ? '<span class="chip" style="--accent: var(--state-claimed)"><span data-icon="hand" aria-hidden="true"></span>Waiting on your pick</span>'
    : decision.state === 'building'
      ? '<span class="chip" style="--accent: var(--state-blocked)"><span data-icon="refresh" aria-hidden="true"></span>Being built</span>'
      : `<span class="chip" style="--accent: var(--state-done)"><span data-icon="check" aria-hidden="true"></span>${selected.length === 0 ? 'Decided' : `Picked ${escapeHtml(selected.join(' + '))}`}</span>`;
  const summarySource = prototype.verdict ?? ticket?.body ?? '';
  const summary = verdictGist(summarySource) || (decision.state === 'building' ? 'This prototype is still being built.' : 'Prototype decision recorded.');
  const date = dateLabel(prototype.updatedAt);
  const variantHtml = variants
    .map((variant) => {
      const isPicked = selected.includes(variant.id);
      const stateClass = isPicked ? ' is-picked' : selected.length > 0 ? ' is-dim' : '';
      const title = variants.length === 1 && variant.title.startsWith('Variant ') ? ticketTitle : variant.title;
      const href = variant.page ?? variant.image ?? canvas;
      const marker = isPicked ? '<span data-icon="check" aria-hidden="true"></span><span class="sr-only">Picked winner:</span>' : '';
      return `<a class="wf-var decision-variant${stateClass}" role="listitem" href="${escapeHtml(href)}" target="_blank" rel="noreferrer" aria-label="Open variant ${escapeHtml(variant.id)}: ${escapeHtml(title)}${isPicked ? ' (picked)' : ''}">${variantFrame(variant)}<span class="lbl">${marker}${escapeHtml(`${variant.id} · ${title}`)}</span></a>`;
    })
    .join('');
  const pickAction = decision.pickTicket === null
    ? ''
    : `<button type="button" class="ghost" data-jump="${String(decision.pickTicket.number)}">Pick in #${String(decision.pickTicket.number)}</button>`;
  const accent = decision.state === 'waiting' ? '--state-claimed' : decision.state === 'building' ? '--state-blocked' : '--state-done';
  return `<section class="wf-node wf-proto is-${decision.state}" style="--accent: var(${accent})">
    <div class="h">${status}<button type="button" class="wf-proto-title" data-jump="${String(prototype.ticketNumber)}" title="Open #${String(prototype.ticketNumber)} on the map">#${String(prototype.ticketNumber)} ${escapeHtml(ticketTitle)}</button>
      ${date === '' ? '' : `<time class="when" datetime="${escapeHtml(prototype.updatedAt ?? '')}">${escapeHtml(date)}</time>`}
      <span class="acts">${pickAction}<a class="${decision.state === 'waiting' ? 'primary' : 'ghost'}" href="${escapeHtml(canvas)}" target="_blank" rel="noreferrer" aria-label="Open the #${String(prototype.ticketNumber)} prototype canvas"><span data-icon="play" aria-hidden="true"></span>Canvas</a></span></div>
    <p class="gist">${escapeHtml(summary)}</p>
    <div class="wf-strip" role="list" aria-label="Variants for #${String(prototype.ticketNumber)}">${variantHtml}</div>
  </section>`;
}

export function sortPrototypeCards(map: WayfinderMap, prototypes: readonly Prototype[]): Prototype[] {
  return [...prototypes].sort((a, b) => {
    const stateDifference = STATUS_ORDER[prototypeCardState(map, a).state] - STATUS_ORDER[prototypeCardState(map, b).state];
    return stateDifference || (b.updatedAt ?? '').localeCompare(a.updatedAt ?? '') || a.ticketNumber - b.ticketNumber;
  });
}

export function prototypeBoardHtml(repo: string, map: WayfinderMap, prototypes: readonly Prototype[]): string {
  if (prototypes.length === 0) {
    return `<div class="wf-board-page"><div class="wf-board-empty"><p class="eyebrow">Prototypes · map #${String(map.number)}</p><h1>No prototypes yet</h1><p>When a prototype ticket on this map pushes its prototype branch, its canvas shows up here.</p></div></div>`;
  }
  return `<div class="wf-board-page"><div class="wf-board">${sortPrototypeCards(map, prototypes)
    .map((prototype) => cardHtml(repo, map, prototype))
    .join('')}</div></div>`;
}

export function prototypeBoardLoadingHtml(): string {
  return '<p class="empty decision-board-status" role="status" aria-live="polite">Looking for prototype branches…</p>';
}

export function prototypeBoardErrorHtml(message: string): string {
  return `<div class="empty decision-board-status" role="alert"><strong>Could not read the prototypes</strong><p>${escapeHtml(message)}</p><button type="button" class="ghost" data-prototype-retry><span data-icon="refresh" aria-hidden="true"></span>Try again</button></div>`;
}
