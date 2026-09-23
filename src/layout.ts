import type { OutsideTicket, Ticket } from './types.js';

/** All the layout needs of a card: its number and what it waits on. */
export type GraphTicket = Pick<Ticket, 'number' | 'blockedBy'>;

export interface LayoutOptions {
  nodeWidth: number;
  nodeHeight: number;
  gapX: number;
  gapY: number;
  /** Tickets stacked in one column before a layer spills into the next column. */
  rowsPerColumn: number;
  padding: number;
}

export const DEFAULT_LAYOUT: LayoutOptions = {
  nodeWidth: 248,
  nodeHeight: 104,
  gapX: 56,
  gapY: 18,
  rowsPerColumn: 6,
  padding: 32,
};

export interface PositionedNode {
  number: number;
  x: number;
  y: number;
  width: number;
  height: number;
  /** Dependency depth. 0 means nothing in this map blocks it. */
  layer: number;
  /** Set on issues off the map, which sit in a band above or below it. */
  band?: 'top' | 'bottom';
}

export interface LayoutEdge {
  from: number;
  to: number;
  /** A link between a band and the map, drawn top to bottom rather than left to right. */
  vertical?: boolean;
}

export interface Layout {
  nodes: PositionedNode[];
  edges: LayoutEdge[];
  width: number;
  height: number;
  /** Count of nodes per layer, for the column rulers the UI draws. */
  layerSizes: number[];
}

/**
 * Dependency depth per ticket. A ticket sits one layer right of its deepest blocker,
 * counting only blockers that are on this map. Cycles stop at the first repeat, so a
 * broken dependency graph still lays out instead of hanging.
 */
export function assignLayers(tickets: readonly GraphTicket[]): Map<number, number> {
  const byNumber = new Map(tickets.map((ticket) => [ticket.number, ticket]));
  const layers = new Map<number, number>();

  const depthOf = (number: number, seen: ReadonlySet<number>): number => {
    const cached = layers.get(number);
    if (cached !== undefined) return cached;
    const ticket = byNumber.get(number);
    if (!ticket || seen.has(number)) return 0;

    const nextSeen = new Set(seen).add(number);
    let depth = 0;
    for (const blocker of ticket.blockedBy) {
      if (!byNumber.has(blocker)) continue;
      depth = Math.max(depth, depthOf(blocker, nextSeen) + 1);
    }
    layers.set(number, depth);
    return depth;
  };

  for (const ticket of tickets) depthOf(ticket.number, new Set());
  return layers;
}

/** Place tickets left to right by dependency depth, top to bottom in map order. */
export function layoutTickets(tickets: readonly GraphTicket[], options: LayoutOptions = DEFAULT_LAYOUT): Layout {
  const { nodeWidth, nodeHeight, gapX, gapY, rowsPerColumn, padding } = options;
  const layers = assignLayers(tickets);

  const byLayer = new Map<number, GraphTicket[]>();
  for (const ticket of tickets) {
    const layer = layers.get(ticket.number) ?? 0;
    const bucket = byLayer.get(layer) ?? [];
    bucket.push(ticket);
    byLayer.set(layer, bucket);
  }

  const sortedLayers = [...byLayer.keys()].sort((a, b) => a - b);
  const nodes: PositionedNode[] = [];
  const layerSizes: number[] = [];
  let column = 0;

  for (const layer of sortedLayers) {
    const bucket = byLayer.get(layer) ?? [];
    layerSizes.push(bucket.length);
    const columnsInLayer = Math.max(1, Math.ceil(bucket.length / rowsPerColumn));
    const perColumn = Math.ceil(bucket.length / columnsInLayer);

    bucket.forEach((ticket, index) => {
      const columnOffset = Math.floor(index / perColumn);
      const row = index % perColumn;
      nodes.push({
        number: ticket.number,
        x: padding + (column + columnOffset) * (nodeWidth + gapX),
        y: padding + row * (nodeHeight + gapY),
        width: nodeWidth,
        height: nodeHeight,
        layer,
      });
    });

    column += columnsInLayer;
  }

  const edges: LayoutEdge[] = [];
  const present = new Set(tickets.map((ticket) => ticket.number));
  for (const ticket of tickets) {
    for (const blocker of ticket.blockedBy) {
      if (present.has(blocker)) edges.push({ from: blocker, to: ticket.number });
    }
  }

  const width = nodes.reduce((max, node) => Math.max(max, node.x + node.width), 0) + padding;
  const height = nodes.reduce((max, node) => Math.max(max, node.y + node.height), 0) + padding;
  return { nodes, edges, width, height, layerSizes };
}

export interface Band {
  y: number;
  height: number;
}

export interface BandedLayout extends Layout {
  /** The strips above and below the map that hold issues off it, or null when a side is empty. */
  bands: { top: Band | null; bottom: Band | null };
}

/** Room at the head of a band for its label. */
const BAND_LABEL = 30;

/**
 * The map's own layout, with issues off the map kept out of its columns: the ones it waits on
 * in a band above, the ones waiting on it in a band below. Each band fills from the left, so its
 * cards are in view from the start, ordered by the column of the tickets they link to.
 */
export function layoutWithOutside(
  tickets: readonly Ticket[],
  outside: readonly Pick<OutsideTicket, 'number' | 'blocks' | 'waitsOn'>[],
  options: LayoutOptions = DEFAULT_LAYOUT,
): BandedLayout {
  const { nodeWidth, nodeHeight, gapX, gapY, padding } = options;
  const main = layoutTickets(tickets, options);
  const byNumber = new Map(main.nodes.map((node) => [node.number, node]));
  const linked = (numbers: readonly number[]): PositionedNode[] =>
    numbers.map((number) => byNumber.get(number)).filter((node): node is PositionedNode => node !== undefined);

  const top = outside.filter((item) => linked(item.blocks).length > 0);
  const bottom = outside.filter((item) => !top.includes(item) && linked(item.waitsOn).length > 0);
  const bandGap = gapY * 3;
  const bandHeight = BAND_LABEL + nodeHeight + bandGap;
  const topShift = top.length > 0 ? bandHeight : 0;
  const mainBottom = main.nodes.reduce((max, node) => Math.max(max, node.y + node.height), padding) + topShift;

  const row = (items: typeof outside, links: (item: (typeof outside)[number]) => number[], y: number, band: 'top' | 'bottom'): PositionedNode[] => {
    const anchored = items
      .map((item) => ({ item, anchor: Math.min(...linked(links(item)).map((node) => node.x)) }))
      .sort((a, b) => a.anchor - b.anchor || a.item.number - b.item.number);
    return anchored.map(({ item }, index) => ({
      number: item.number,
      x: padding + index * (nodeWidth + gapX),
      y,
      width: nodeWidth,
      height: nodeHeight,
      layer: -1,
      band,
    }));
  };

  const nodes = [
    ...row(top, (item) => item.blocks, padding + BAND_LABEL, 'top'),
    ...main.nodes.map((node) => ({ ...node, y: node.y + topShift })),
    ...row(bottom, (item) => item.waitsOn, mainBottom + bandGap + BAND_LABEL, 'bottom'),
  ];

  const edges: LayoutEdge[] = [...main.edges];
  for (const item of top) for (const target of linked(item.blocks)) edges.push({ from: item.number, to: target.number, vertical: true });
  for (const item of bottom) for (const source of linked(item.waitsOn)) edges.push({ from: source.number, to: item.number, vertical: true });

  const width = nodes.reduce((max, node) => Math.max(max, node.x + node.width), 0) + padding;
  const height = nodes.reduce((max, node) => Math.max(max, node.y + node.height), 0) + padding;
  return {
    nodes,
    edges,
    width,
    height,
    layerSizes: main.layerSizes,
    bands: {
      top: top.length > 0 ? { y: padding, height: BAND_LABEL + nodeHeight } : null,
      bottom: bottom.length > 0 ? { y: mainBottom + bandGap, height: BAND_LABEL + nodeHeight } : null,
    },
  };
}
