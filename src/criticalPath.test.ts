import { describe, expect, it } from 'vitest';

import { criticalPath, type PathTicket } from './criticalPath.js';

const open = (number: number, blockedBy: number[] = []): PathTicket => ({ number, open: true, blockedBy });
const closed = (number: number, blockedBy: number[] = []): PathTicket => ({ number, open: false, blockedBy });

describe('criticalPath', () => {
  it('follows a linear chain from its first blocker to its end', () => {
    expect(criticalPath([open(1), open(2, [1]), open(3, [2])])).toEqual({ tickets: [1, 2, 3], remaining: 3 });
  });

  it('takes the longer side of a diamond', () => {
    // 1 -> 2 -> 3 -> 5 and 1 -> 4 -> 5
    const tickets = [open(1), open(2, [1]), open(3, [2]), open(4, [1]), open(5, [3, 4])];
    expect(criticalPath(tickets)).toEqual({ tickets: [1, 2, 3, 5], remaining: 4 });
  });

  it('prefers the side of a diamond with more open tickets', () => {
    // 1 -> 2 -> 3 -> 5 is longer, but 2 and 3 are done; 1 -> 4 -> 5 has more left.
    const tickets = [open(1), closed(2, [1]), closed(3, [2]), open(4, [1]), open(5, [3, 4])];
    expect(criticalPath(tickets)).toEqual({ tickets: [1, 4, 5], remaining: 3 });
  });

  it('does not hang on a cycle and never repeats a ticket', () => {
    const tickets = [open(1, [3]), open(2, [1]), open(3, [2]), open(4, [3])];
    const path = criticalPath(tickets);
    expect(path.tickets.at(-1)).toBe(4);
    expect(new Set(path.tickets).size).toBe(path.tickets.length);
    expect(path).toEqual({ tickets: [1, 2, 3, 4], remaining: 4 });
  });

  it('still finds a path when the whole map is one cycle', () => {
    const path = criticalPath([open(1, [2]), open(2, [1])]);
    expect(path.remaining).toBe(2);
    expect([...path.tickets].sort()).toEqual([1, 2]);
  });

  it('ignores blockers in the fog, off the map', () => {
    expect(criticalPath([open(1, [99]), open(2, [1, 98])])).toEqual({ tickets: [1, 2], remaining: 2 });
  });

  it('keeps a chain joined through a closed ticket in the middle', () => {
    expect(criticalPath([open(1), closed(2, [1]), open(3, [2])])).toEqual({ tickets: [1, 2, 3], remaining: 2 });
  });

  it('is empty once every ticket is closed', () => {
    expect(criticalPath([closed(1), closed(2, [1]), closed(3, [2])])).toEqual({ tickets: [], remaining: 0 });
  });

  it('is empty for a map with no tickets', () => {
    expect(criticalPath([])).toEqual({ tickets: [], remaining: 0 });
  });

  it('breaks a tie in map order', () => {
    expect(criticalPath([open(1), open(2)])).toEqual({ tickets: [1], remaining: 1 });
  });
});
