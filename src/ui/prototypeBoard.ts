import type { Prototype, Ticket, WayfinderMap } from '../types.js';
import { prototypeFileUrl, prototypePageUrl, prototypeShotUrl } from '../prototypes.js';
import { escapeHtml } from './markdown.js';
import { canvasEntryAttrs } from './canvasEntry.js';
import { bone, boneButton } from './skeleton.js';
import { canvasLinksHtml, previewUrl, verdictGist } from './prototypeTile.js';

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
const DISPOSITION_LABEL = new Map([['keep', 'Kept'], ['change', 'Changed'], ['combine', 'Combined']]);
const IMAGE_FILE = /\.(?:avif|gif|jpe?g|png|webp)$/i;
const HTML_FILE = /\.html?$/i;
const VARIANT_DIRECTORY = /(?:^|\/)(?:(?:assets\/)?(?:protos?|variants?|screenshots?|thumbnails?)(?:\/|[-_])|(?:variant|direction|option|after)[-_])/i;

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
  const canvasDir = prototype.canvases?.includes(prototype.preview ?? '') === true
    ? prototype.preview?.replace(/index\.html$/i, '') ?? '' : '';
  const files = [
    ...prototype.files.filter((file) => IMAGE_FILE.test(file) && VARIANT_DIRECTORY.test(file)),
    ...prototype.openable.filter((file) => HTML_FILE.test(file) && file !== prototype.preview && VARIANT_DIRECTORY.test(file)),
  ].filter((file) => canvasDir === '' || file.startsWith(canvasDir));
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
  const tickets = map.tickets;
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
  // A later round approval supersedes an earlier one; its source options do not count as picks.
  for (const line of [...lines].reverse()) {
    const approved = /^\s*\**([A-Z]{1,2})\**\s*,\s*Round\s+\d+\s*,\s+is\s+approved\b/i.exec(line);
    if (approved !== null && variantIds.includes(approved[1] ?? '')) return [approved[1] ?? ''];
  }
  for (const line of lines) {
    const named = [...line.matchAll(/\b(?:answer|decision|winner)\s+(?:is\s+)?\**(?:direction|variant|option)\s+\**([A-Z]{1,2})\b/gi)].map((match) => match[1] ?? '');
    const ids = variantIds.filter((id) => named.includes(id));
    if (ids.length > 0) return ids;
  }
  for (const line of lines) {
    const match = /\b(?:use|selected|picked|chose|choose|ship|shipped)\s+(?:\*\*)?(?:(?:option|direction|variant)\s+)?([A-Z]{1,2}(?:\s*(?:\+|&|and)\s*[A-Z]{1,2})*)\b/i.exec(line);
    if (!match) continue;
    const ids = idsIn(match[1] ?? '', variantIds);
    if (ids.length > 0) return ids;
  }
  return [];
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
      page: variant.page === null ? null : prototypePageUrl(repo, prototype.branch, variant.page, prototype.sha),
    }));
  }
  return prototypeVariants(prototype).map((variant) => ({
    id: variant.id,
    title: variant.title,
    image: variant.imageFile === null ? null : prototypeFileUrl(repo, prototype.branch, variant.imageFile, prototype.sha),
    page: variant.pageFile === null ? null : prototypeFileUrl(repo, prototype.branch, variant.pageFile, prototype.sha),
  }));
}

function variantFrame(variant: BoardVariant, phone: { width: number; height: number } | null = null): string {
  const livePage = (hidden: boolean): string =>
    variant.page === null
      ? ''
      : `${phone ? `<span class="chosen-phone" style="aspect-ratio:${String(phone.width)}/${String(phone.height)}">` : ''}<iframe class="decision-variant-page" name="wayfinder-preview" src="${escapeHtml(variant.page)}" sandbox="allow-scripts" loading="lazy" tabindex="-1" aria-hidden="true" title="" width="${phone?.width ?? 1280}" height="${phone?.height ?? 800}"${phone ? ` style="width:${String(phone.width)}px;height:${String(phone.height)}px"` : ''}${hidden ? ' hidden' : ''}></iframe>${phone ? '</span>' : ''}`;
  const picture = variant.image !== null
    ? `<img class="decision-variant-image" src="${escapeHtml(variant.image)}" alt="" loading="lazy" />${livePage(true)}<span class="decision-variant-fallback" hidden>Preview image unavailable</span>`
    : variant.page !== null
      ? livePage(false)
      : '<span class="decision-variant-fallback">Preview image unavailable</span>';
  return `<span class="wf-frame proto-thumb${variant.image === null && variant.page === null ? ' is-empty' : ''}${phone ? ' is-phone' : ''}"${phone ? ` data-phone-width="${String(phone.width)}" data-phone-height="${String(phone.height)}"` : ''}>${picture}<span class="tag">${escapeHtml(variant.id)}</span></span>`;
}

/** Explicitly approved items on the most recent round with a recorded final choice. */
function catalogPicks(prototype: Prototype): Array<{ page: NonNullable<Prototype['canvasPages']>[number]; item: NonNullable<Prototype['canvasPages']>[number]['items'][number] }> {
  const named = [...(prototype.verdict ?? '').matchAll(/^\s*-\s+\*\*[^:\n]+:\s*([A-Za-z][A-Za-z0-9-]*)\b[^\n]*\bKeep\b/gm)]
    .flatMap((match) => {
      const found = (prototype.canvasPages ?? []).flatMap((page) => page.items.filter((item) => item.id === match[1] && item.disposition === 'keep').map((item) => ({ page, item })));
      return found.length === 1 ? found : [];
    });
  if (named.length > 0) return named;
  const candidates = (prototype.canvasPages ?? []).flatMap((page) => page.items.flatMap((item) => {
    const approved = item.disposition === 'keep' && item.feedback !== null && !/\b(?:not\s+(?:approved|chosen|picked|the\s+final\s+pick)|rejected|no\s+longer\s+(?:approved|chosen|the\s+final\s+pick))\b/i.test(item.feedback);
    return approved && page.items.filter((candidate) => candidate.id === item.id).length === 1 ? [{ page, item }] : [];
  }));
  const verdictIds = pickedVariantIds(prototype.verdict ?? '', [...new Set((prototype.canvasPages ?? []).flatMap((page) => page.items.map((item) => item.id)))]);
  if (candidates.length > 0 && verdictIds.length > 0 && verdictIds.some((id) => !candidates.some(({ item }) => item.id === id))) return [];
  if (candidates.length === 0) {
    // A ticket can name the exact round and item even when the canvas uses older feedback wording.
    // Match only a unique page/item pair; repeated IDs within a round remain unknown.
    const match = /\b(?:selected|chose|picked)\s+(?:\*\*)?round\s+(\d+)\s+(?:option\s+)?([A-Z][A-Z0-9-]*)\b/i.exec(prototype.verdict ?? '');
    if (match) {
      const found = (prototype.canvasPages ?? []).flatMap((page) => page.round === Number(match[1])
        ? page.items.filter((item) => item.id === match[2] && item.disposition !== 'change' && item.disposition !== 'combine' && !/^\s*not chosen\b/i.test(item.feedback ?? '')).map((item) => ({ page, item })) : []);
      if (found.length === 1) return found;
    }
    const direction = /\bchosen\s+direction\s+\**([A-Z][A-Z0-9-]*)\b/i.exec(prototype.verdict ?? '');
    if (direction) {
      const found = (prototype.canvasPages ?? []).flatMap((page) => page.items.filter((item) => item.id === direction[1] && item.disposition === 'keep').map((item) => ({ page, item })));
      if (found.length === 1) return found;
    }
  }
  const rounds = candidates.map(({ page }) => typeof page.round === 'number' ? page.round : -1);
  const latest = Math.max(...rounds);
  const latestPicks = candidates.filter(({ page }) => (typeof page.round === 'number' ? page.round : -1) === latest);
  return latestPicks.filter(({ item }) => latestPicks.filter((pick) => pick.item.id === item.id).length === 1);
}

function catalogHistory(repo: string, prototype: Prototype, title: string, picks: ReturnType<typeof catalogPicks>): string {
  const pages = prototype.canvasPages ?? [];
  const canvasDir = prototype.preview?.replace(/index\.html$/i, '') ?? '';
  const itemLink = (page: typeof pages[number], item: typeof page.items[number]): string => {
    const file = item.src === null ? null : prototypePageUrl(repo, prototype.branch, `${canvasDir}${item.src}`, prototype.sha);
    const url = previewUrl(repo, prototype) ?? prototype.url;
    const isPick = picks.some((pick) => pick.page.id === page.id && pick.item.id === item.id);
    const phone = item.width && item.height && item.height > item.width ? { width: item.width, height: item.height } : null;
    const frame = variantFrame({ id: item.id, title: item.name, page: file, image: null }, phone);
    const outcome = isPick ? 'Chosen' : /^\s*not chosen\b/i.test(item.feedback ?? '') ? 'Not chosen' : DISPOSITION_LABEL.get(item.disposition ?? '') ?? 'No outcome recorded';
    const name = item.name.startsWith(`${item.id} · `) ? item.name.slice(item.id.length + 3) : item.name;
    return `<a class="wf-var decision-variant${isPick ? ' is-picked' : ''}" data-proto-item="${escapeHtml(item.id)}" data-proto-item-page="${escapeHtml(page.id)}" href="${escapeHtml(url)}" ${canvasEntryAttrs(repo, prototype, title, file, null, { page: page.id, variant: item.id })} aria-label="Open ${escapeHtml(item.name)} on ${escapeHtml(page.title)}">${frame}<span class="lbl">${escapeHtml(item.id)} · ${escapeHtml(name)}</span><span>${escapeHtml(outcome)}</span></a>`;
  };
  const hero = picks[0];
  if (!hero) return '';
  const groups = new Map<string, typeof pages>();
  for (const page of pages) {
    const key = page.round === null ? page.title : `Round ${String(page.round)}`;
    groups.set(key, [...(groups.get(key) ?? []), page]);
  }
  const rounds = [...groups.entries()].sort(([, a], [, b]) => (typeof a[0]?.round === 'number' ? a[0].round : 0) - (typeof b[0]?.round === 'number' ? b[0].round : 0));
  const buttons = rounds.map(([label], index) => `<button type="button" class="seg" data-proto-round="${String(index)}" aria-pressed="false">${escapeHtml(label)}</button>`).join('');
  const panels = rounds.map(([, roundPages], index) => {
    const pageButtons = roundPages.length > 1 ? `<div class="segmented" role="group" aria-label="Canvas pages">${roundPages.map((page, pageIndex) => `<button type="button" class="seg" data-proto-page="${String(pageIndex)}" aria-pressed="${String(pageIndex === 0)}">${escapeHtml(page.title)}</button>`).join('')}</div>` : '';
    const pagePanels = roundPages.map((page, pageIndex) => `<div data-proto-page-panel="${String(pageIndex)}"${pageIndex ? ' hidden' : ''}><p class="eyebrow">${escapeHtml(page.title)}</p><div class="wf-strip" role="list">${page.items.slice(0, 4).map((item) => itemLink(page, item)).join('')}</div>${page.items.length > 4 ? `<div class="wf-strip" data-proto-more-panel hidden>${page.items.slice(4).map((item) => itemLink(page, item)).join('')}</div><button type="button" class="ghost" data-proto-more="${String(page.items.length - 4)}" aria-expanded="false">Show ${String(page.items.length - 4)} more</button>` : ''}</div>`).join('');
    return `<div data-proto-round-panel="${String(index)}" hidden>${pageButtons}${pagePanels}</div>`;
  }).join('');
  const heroes = picks.map(({ page, item }, index) => {
    const round = page.round === null ? page.title : `Round ${String(page.round)} · ${page.title}`;
    const summary = item.feedback?.split(/(?<=[.!?])\s/)[0] ?? '';
    const itemName = item.name.startsWith(`${item.id} · `) ? item.name.slice(item.id.length + 3) : item.name;
    const file = item.src === null ? null : prototypePageUrl(repo, prototype.branch, `${canvasDir}${item.src}`, prototype.sha);
    const canvas = previewUrl(repo, prototype) ?? prototype.url;
    const open = `<a class="primary" href="${escapeHtml(canvas)}" ${canvasEntryAttrs(repo, prototype, title, file, null, { page: page.id, variant: item.id })}><span data-icon="play" aria-hidden="true"></span>Open ${escapeHtml(item.id)}</a>`;
    const sources = item.basedOn.map((id) => {
      const matches = pages.flatMap((sourcePage) => sourcePage.items.filter((source) => source.id === id && sourcePage.id !== page.id).map(() => sourcePage));
      return matches.length === 1 ? `<button type="button" class="link" data-proto-source="${escapeHtml(id)}" data-proto-source-page="${escapeHtml(matches[0]!.id)}">${escapeHtml(id)}</button>` : escapeHtml(id);
    });
    return `<div class="chosen-canvas-main" data-proto-hero-panel="${String(index)}"${index ? ' hidden' : ''}>${itemLink(page, item)}<div><span class="eyebrow">Chosen · ${escapeHtml(round)}</span><h3>${escapeHtml(item.id)} · ${escapeHtml(itemName)}</h3>${summary ? `<p>${escapeHtml(summary)}</p>` : ''}${sources.length ? `<p>Built from ${sources.join(', ')}</p>` : ''}${open}</div></div>`;
  }).join('');
  const chooser = picks.length > 1 ? `<div class="segmented" role="group" aria-label="Chosen items">${picks.map(({ item }, index) => `<button type="button" class="seg" data-proto-hero="${String(index)}" aria-pressed="${String(index === 0)}">${escapeHtml(item.id)} · ${escapeHtml(item.name)}</button>`).join('')}</div>` : '';
  return `<div class="chosen-canvas">${heroes}${chooser}<div class="chosen-canvas-history"><span>How it got here</span><div class="segmented" role="group" aria-label="Canvas rounds">${buttons}</div>${panels}</div></div>`;
}

function cardHtml(repo: string, map: WayfinderMap, prototype: Prototype): string {
  const ticket = map.tickets.find((candidate) => candidate.number === prototype.ticketNumber);
  const decision = prototypeCardState(map, prototype);
  const variants = boardVariants(repo, prototype);
  const picks = decision.state === 'decided' ? catalogPicks(prototype) : [];
  const selected = decision.state !== 'decided'
    ? []
    : picks.length > 0
      ? [...new Set(picks.map(({ item }) => item.id))]
    : (prototype.canvasPages?.length ?? 0) > 0
      ? []
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
  const variantList = variants.map((variant) => ({ id: variant.id, name: variant.title }));
  const variantHtml = variants
    .map((variant) => {
      const isPicked = selected.includes(variant.id);
      const stateClass = isPicked ? ' is-picked' : selected.length > 0 ? ' is-dim' : '';
      const title = variants.length === 1 && variant.title.startsWith('Variant ') ? ticketTitle : variant.title;
      const href = variant.page ?? variant.image ?? canvas;
      const marker = isPicked ? '<span data-icon="check" aria-hidden="true"></span><span class="sr-only">Picked winner:</span>' : '';
      return `<a class="wf-var decision-variant${stateClass}" role="listitem" href="${escapeHtml(href)}" ${canvasEntryAttrs(repo, prototype, ticketTitle, variant.page, variant.page ? null : variant.image, { pick: decision.pickTicket?.number ?? null, variant: variant.id, variants: variantList })} aria-label="Open variant ${escapeHtml(variant.id)}: ${escapeHtml(title)}${isPicked ? ' (picked)' : ''}">${variantFrame(variant)}<span class="lbl">${marker}${escapeHtml(`${variant.id} · ${title}`)}</span></a>`;
    })
    .join('');
  const pickAction = decision.pickTicket === null
    ? ''
    : `<button type="button" class="ghost" data-jump="${String(decision.pickTicket.number)}">Pick in #${String(decision.pickTicket.number)}</button>`;
  const accent = decision.state === 'waiting' ? '--state-claimed' : decision.state === 'building' ? '--state-blocked' : '--state-done';
  return `<section class="wf-node wf-proto is-${decision.state}" style="--accent: var(${accent})">
    <div class="h">${status}<button type="button" class="wf-proto-title" data-jump="${String(prototype.ticketNumber)}" title="Open #${String(prototype.ticketNumber)} on the map">#${String(prototype.ticketNumber)} ${escapeHtml(ticketTitle)}</button>
      ${date === '' ? '' : `<time class="when" datetime="${escapeHtml(prototype.updatedAt ?? '')}">${escapeHtml(date)}</time>`}
      <span class="acts">${pickAction}<a class="${decision.state === 'waiting' ? 'primary' : 'ghost'}" href="${escapeHtml(canvas)}" ${canvasEntryAttrs(repo, prototype, ticketTitle, null, null, { pick: decision.pickTicket?.number ?? null, variants: variantList })} aria-label="Open the #${String(prototype.ticketNumber)} prototype canvas"><span data-icon="play" aria-hidden="true"></span>Canvas</a></span></div>
    <p class="gist">${escapeHtml(summary)}</p>
    ${canvasLinksHtml(repo, prototype)}
    ${picks.length ? catalogHistory(repo, prototype, ticketTitle, picks) : `<div class="wf-strip" role="list" aria-label="Variants for #${String(prototype.ticketNumber)}">${variantHtml}</div>`}
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

/** Toggle a round without disturbing another prototype card. */
export function togglePrototypeRound(round: HTMLButtonElement): void {
  const history = round.closest<HTMLElement>('.chosen-canvas-history');
  if (history === null) return;
  const index = round.dataset['protoRound'];
  const wasOpen = round.getAttribute('aria-pressed') === 'true';
  history.querySelectorAll<HTMLButtonElement>('[data-proto-round]').forEach((button) => button.setAttribute('aria-pressed', String(!wasOpen && button === round)));
  history.querySelectorAll<HTMLElement>('[data-proto-round-panel]').forEach((panel) => { panel.hidden = wasOpen || panel.dataset['protoRoundPanel'] !== index; });
}

export function selectPrototypePage(button: HTMLButtonElement): void {
  const round = button.closest<HTMLElement>('[data-proto-round-panel]');
  if (round === null) return;
  const index = button.dataset['protoPage'];
  round.querySelectorAll<HTMLButtonElement>('[data-proto-page]').forEach((item) => item.setAttribute('aria-pressed', String(item === button)));
  round.querySelectorAll<HTMLElement>('[data-proto-page-panel]').forEach((panel) => { panel.hidden = panel.dataset['protoPagePanel'] !== index; });
}

export function selectPrototypeHero(button: HTMLButtonElement): void {
  const card = button.closest<HTMLElement>('.chosen-canvas');
  if (card === null) return;
  const index = button.dataset['protoHero'];
  card.querySelectorAll<HTMLButtonElement>('[data-proto-hero]').forEach((item) => item.setAttribute('aria-pressed', String(item === button)));
  card.querySelectorAll<HTMLElement>('[data-proto-hero-panel]').forEach((panel) => { panel.hidden = panel.dataset['protoHeroPanel'] !== index; });
}

export function togglePrototypeMore(button: HTMLButtonElement): void {
  const panel = button.parentElement?.querySelector<HTMLElement>('[data-proto-more-panel]');
  if (!panel) return;
  panel.hidden = !panel.hidden;
  button.setAttribute('aria-expanded', String(!panel.hidden));
  button.textContent = panel.hidden ? `Show ${button.dataset['protoMore'] ?? ''} more` : 'Hide';
}

export function revealPrototypeSource(button: HTMLButtonElement): void {
  const card = button.closest<HTMLElement>('.chosen-canvas');
  if (!card) return;
  const target = [...card.querySelectorAll<HTMLElement>('[data-proto-item]')].find((item) => item.dataset['protoItem'] === button.dataset['protoSource'] && item.dataset['protoItemPage'] === button.dataset['protoSourcePage'] && item.closest('[data-proto-round-panel]'));
  const round = target?.closest<HTMLElement>('[data-proto-round-panel]');
  const page = target?.closest<HTMLElement>('[data-proto-page-panel]');
  if (!target || !round || !page) return;
  const roundButton = [...card.querySelectorAll<HTMLButtonElement>('[data-proto-round]')].find((item) => item.dataset['protoRound'] === round.dataset['protoRoundPanel']);
  if (roundButton?.getAttribute('aria-pressed') !== 'true' && roundButton) togglePrototypeRound(roundButton);
  const pageButton = [...round.querySelectorAll<HTMLButtonElement>('[data-proto-page]')].find((item) => item.dataset['protoPage'] === page.dataset['protoPagePanel']);
  if (pageButton) selectPrototypePage(pageButton);
  const more = target.closest<HTMLElement>('[data-proto-more-panel]');
  const moreButton = more?.parentElement?.querySelector<HTMLButtonElement>('[data-proto-more]');
  if (more?.hidden && moreButton) togglePrototypeMore(moreButton);
  card.querySelectorAll('.is-led').forEach((item) => item.classList.remove('is-led'));
  target.classList.add('is-led');
  target.scrollIntoView({ block: 'nearest' });
}

const PROTOTYPE_CARD_SKELETON = `<section class="wf-node wf-proto is-skeleton">
    <div class="h"><span class="chip">${bone('110px')}</span><span class="wf-proto-title">${bone('50%')}</span><span class="acts">${boneButton('84px')}</span></div>
    <p class="gist">${bone('80%')}</p>
    <div class="wf-strip">${`<span class="wf-var"><span class="wf-frame"></span><span class="lbl">${bone('60%')}</span></span>`.repeat(4)}</div>
  </section>`;

/** Prototypes before the branch list arrives: two cards in the loaded board's frame. */
export function prototypeBoardLoadingHtml(): string {
  return `<div class="wf-board-page is-loading" role="status" aria-live="polite" aria-label="Looking for prototype branches"><div class="wf-board" aria-hidden="true">${PROTOTYPE_CARD_SKELETON.repeat(2)}</div></div>`;
}

export function prototypeBoardErrorHtml(message: string): string {
  return `<div class="empty decision-board-status" role="alert"><strong>Could not read the prototypes</strong><p>${escapeHtml(message)}</p><button type="button" class="ghost" data-prototype-retry><span data-icon="refresh" aria-hidden="true"></span>Try again</button></div>`;
}
