import { describe, expect, it, vi } from 'vitest';
import { canvasSourceRef, matchesCanvasRequest } from './source';

describe('fixed phone canvas destinations', () => {
  it('opens a fixed SHA even when the latest branch no longer exists', async () => {
    const prototypeRefs = vi.fn(async () => { throw new Error('branch deleted'); });
    expect(await canvasSourceRef({ prototypeRefs }, 'o/r', 366, 'A'.repeat(40))).toEqual({ branch: 'prototype/366', sha: 'a'.repeat(40) });
    expect(prototypeRefs).not.toHaveBeenCalled();
    await expect(canvasSourceRef({ prototypeRefs }, 'o/r', 366, 'invalid')).rejects.toThrow('Invalid prototype revision');
  });
  it('continues resolving current references for newest destinations', async () => {
    const prototypeRefs = vi.fn(async () => [{ branch: 'prototype/366-current', sha: 'b'.repeat(40) }]);
    expect(await canvasSourceRef({ prototypeRefs }, 'o/r', 366)).toMatchObject({ sha: 'b'.repeat(40) });
    expect(prototypeRefs).toHaveBeenCalledWith('o/r', 366, undefined);
  });
  it('never substitutes a different saved revision or board for an offline fixed link', () => {
    const saved = { sha: 'a'.repeat(40), board: 'prototypes/replies/index.html' };
    expect(matchesCanvasRequest(saved, { revision: 'b'.repeat(40) })).toBe(false);
    expect(matchesCanvasRequest(saved, { board: 'prototypes/other/index.html' })).toBe(false);
    expect(matchesCanvasRequest(saved, { revision: 'A'.repeat(40), board: saved.board })).toBe(true);
  });
});
