import { layoutTickets } from '../layout.js';
import type { WayfinderMap } from '../types.js';
import { STATE_STYLE } from './chrome.js';

/** How tall a ticket's bar is, in the map's own layout units, so the graph reads as rows of slim cards. */
const BAR_HEIGHT = 44;
const PAD = 48;

/**
 * A map's ticket graph in miniature: every ticket where the map page puts it, as a slim bar in
 * its state's colour, with the dependency edges between them. The frontier glows.
 */
export function miniGraphSvg(map: WayfinderMap): string {
  if (map.tickets.length === 0) {
    return '<svg class="mini-graph" viewBox="0 0 320 170" aria-hidden="true"><rect class="mini-graph-ghost" x="85" y="53" width="150" height="64" rx="10"/><text class="mini-graph-ghost-label" x="160" y="90" text-anchor="middle">Destination</text></svg>';
  }
  const layout = layoutTickets(map.tickets);
  const byNumber = new Map(layout.nodes.map((node) => [node.number, node]));
  const states = new Map(map.tickets.map((ticket) => [ticket.number, ticket.state]));
  const barTop = (y: number, height: number): number => y + (height - BAR_HEIGHT) / 2;
  const edges = layout.edges
    .map((edge) => {
      const from = byNumber.get(edge.from);
      const to = byNumber.get(edge.to);
      if (from === undefined || to === undefined) return '';
      const x1 = from.x + from.width;
      const y1 = from.y + from.height / 2;
      const x2 = to.x;
      const y2 = to.y + to.height / 2;
      const mid = (x1 + x2) / 2;
      return `<path d="M${String(x1)} ${String(y1)}C${String(mid)} ${String(y1)} ${String(mid)} ${String(y2)} ${String(x2)} ${String(y2)}"/>`;
    })
    .join('');
  const nodes = layout.nodes
    .map((node) => {
      const state = states.get(node.number) ?? 'blocked';
      const variable = STATE_STYLE[state].variable;
      const fill = state === 'done' ? 'var(--surface-1)' : `color-mix(in srgb, var(${variable}) 30%, var(--surface-1))`;
      return `<rect class="${state === 'frontier' ? 'is-frontier' : ''}" x="${String(node.x)}" y="${String(barTop(node.y, node.height))}" width="${String(node.width)}" height="${String(BAR_HEIGHT)}" rx="12" style="fill:${fill};stroke:var(${variable})"/>`;
    })
    .join('');
  const viewBox = `${String(-PAD)} ${String(-PAD)} ${String(layout.width + PAD * 2)} ${String(layout.height + PAD * 2)}`;
  return `<svg class="mini-graph" viewBox="${viewBox}" preserveAspectRatio="xMidYMid meet" aria-hidden="true"><g class="mini-graph-edges">${edges}</g><g class="mini-graph-nodes">${nodes}</g></svg>`;
}
