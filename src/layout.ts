import type { Ticket, WayfinderMap } from './types.js';

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
}

export interface LayoutEdge {
  from: number;
  to: number;
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

/**
 * Every card's dependencies, the issues off the map included. Laid out together, an issue off the
 * map lands in the column its dependencies put it in, like any card.
 */
export function graphTickets(map: Pick<WayfinderMap, 'tickets' | 'outside'>): GraphTicket[] {
  return [...map.tickets, ...map.outside.map((outside) => ({ number: outside.number, blockedBy: outside.waitsOn }))];
}
