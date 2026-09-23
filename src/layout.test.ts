import { describe, expect, it } from 'vitest';

import { DEFAULT_LAYOUT, assignLayers, layoutTickets, layoutWithOutside } from './layout.js';
import type { Ticket } from './types.js';

function ticket(number: number, blockedBy: number[] = []): Ticket {
  return {
    number,
    title: `Ticket ${String(number)}`,
    url: `https://github.com/owner/repo/issues/${String(number)}`,
    body: '',
    type: 'task',
    labels: [],
    open: true,
    assignee: null,
    blockedBy,
    openBlockers: blockedBy,
    state: blockedBy.length > 0 ? 'blocked' : 'frontier',
  };
}

describe('assignLayers', () => {
  it('puts an unblocked ticket in layer 0', () => {
    expect(assignLayers([ticket(1), ticket(2)])).toEqual(new Map([[1, 0], [2, 0]]));
  });

  it('pushes a ticket one layer past its deepest blocker', () => {
    const layers = assignLayers([ticket(1), ticket(2, [1]), ticket(3, [2, 1])]);
    expect(layers.get(3)).toBe(2);
  });

  it('ignores blockers that are not on this map', () => {
    expect(assignLayers([ticket(1, [99])]).get(1)).toBe(0);
  });

  it('does not hang on a dependency cycle', () => {
    const layers = assignLayers([ticket(1, [2]), ticket(2, [1])]);
    expect(layers.size).toBe(2);
  });
});

describe('layoutTickets', () => {
  it('places a layer as one column, in map order', () => {
    const { nodes } = layoutTickets([ticket(1), ticket(2)], DEFAULT_LAYOUT);
    expect(nodes[0]?.x).toBe(nodes[1]?.x);
    expect(nodes[1]?.y).toBeGreaterThan(nodes[0]?.y ?? 0);
  });

  it('moves a blocked ticket to the right of its blocker', () => {
    const { nodes } = layoutTickets([ticket(1), ticket(2, [1])], DEFAULT_LAYOUT);
    const [first, second] = nodes;
    expect(second?.x).toBeGreaterThan(first?.x ?? 0);
  });

  it('spills a tall layer into extra columns, using as few as it can', () => {
    const many = Array.from({ length: 8 }, (_, index) => ticket(index + 1));
    const { nodes } = layoutTickets(many, { ...DEFAULT_LAYOUT, rowsPerColumn: 4 });
    const columns = new Set(nodes.map((node) => node.x));
    expect(columns.size).toBe(2);
  });

  it('never stacks more than rowsPerColumn in one column', () => {
    const many = Array.from({ length: 9 }, (_, index) => ticket(index + 1));
    const { nodes } = layoutTickets(many, { ...DEFAULT_LAYOUT, rowsPerColumn: 4 });
    const perColumn = new Map<number, number>();
    for (const node of nodes) perColumn.set(node.x, (perColumn.get(node.x) ?? 0) + 1);
    expect(Math.max(...perColumn.values())).toBeLessThanOrEqual(4);
  });

  it('emits one edge per blocker that is on the map', () => {
    const { edges } = layoutTickets([ticket(1), ticket(2, [1, 99])], DEFAULT_LAYOUT);
    expect(edges).toEqual([{ from: 1, to: 2 }]);
  });

  it('keeps issues off the map out of its columns: blockers above, dependents below', () => {
    const tickets = [ticket(1), ticket(2, [1, 80])];
    const layout = layoutWithOutside(tickets, [
      { number: 80, blocks: [2], waitsOn: [] },
      { number: 90, blocks: [], waitsOn: [2] },
    ]);
    const at = (number: number) => layout.nodes.find((node) => node.number === number);
    const own = layoutTickets(tickets);

    expect(at(80)?.band).toBe('top');
    expect(at(90)?.band).toBe('bottom');
    expect(at(1)?.layer).toBe(0);
    expect(at(2)?.layer).toBe(1);
    expect(at(2)?.x).toBe(own.nodes.find((node) => node.number === 2)?.x);
    expect(at(80)?.x).toBe(at(2)?.x);
    expect(at(80)!.y + at(80)!.height).toBeLessThan(at(1)!.y);
    expect(at(90)!.y).toBeGreaterThan(at(2)!.y + at(2)!.height);
    expect(layout.edges).toEqual([
      { from: 1, to: 2 },
      { from: 80, to: 2, vertical: true },
      { from: 2, to: 90, vertical: true },
    ]);
    expect(layout.bands.top).not.toBeNull();
    expect(layout.bands.bottom).not.toBeNull();
  });

  it('nudges band cards right so they never overlap', () => {
    const layout = layoutWithOutside([ticket(1, [80, 81])], [
      { number: 80, blocks: [1], waitsOn: [] },
      { number: 81, blocks: [1], waitsOn: [] },
    ]);
    const [first, second] = layout.nodes.filter((node) => node.band === 'top');
    expect(second!.x).toBeGreaterThanOrEqual(first!.x + first!.width);
  });

  it('adds no bands to a map with nothing off it', () => {
    const layout = layoutWithOutside([ticket(1)], []);
    expect(layout.bands).toEqual({ top: null, bottom: null });
    expect(layout.height).toBe(layoutTickets([ticket(1)]).height);
  });

  it('sizes the canvas around the nodes', () => {
    const { width, height } = layoutTickets([ticket(1)], DEFAULT_LAYOUT);
    expect(width).toBe(DEFAULT_LAYOUT.padding * 2 + DEFAULT_LAYOUT.nodeWidth);
    expect(height).toBe(DEFAULT_LAYOUT.padding * 2 + DEFAULT_LAYOUT.nodeHeight);
  });

  it('returns an empty layout for a map with no tickets', () => {
    expect(layoutTickets([], DEFAULT_LAYOUT).nodes).toEqual([]);
  });
});
