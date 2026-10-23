// @vitest-environment happy-dom
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { Window } from 'happy-dom';
import { normalizeShortcut, readShortcutAssignments, resetShortcuts, saveShortcut, shortcutAssignments, shortcutFromEvent, shortcutProblem, SHORTCUTS_KEY } from './canvasShortcuts.js';

beforeEach(() => { vi.restoreAllMocks(); vi.stubGlobal('localStorage', new Window().localStorage); });
describe('canvas shortcut assignments', () => {
  it('normalizes typed letters and modifier order precisely', () => {
    expect(normalizeShortcut(' shift + CTRL + p ')).toBe('Ctrl+Shift+P');
    expect(normalizeShortcut('m')).toBe('M');
    for (const invalid of [null, {}, 'Ctrl+Ctrl+P', 'Meta+P', 'Control+P', 'P+Shift', '1', 'é', 'Dead', 'Shift+']) expect(normalizeShortcut(invalid)).toBeNull();
    expect(shortcutFromEvent(new KeyboardEvent('keydown', { key: 'p', ctrlKey: true, shiftKey: true }))).toBe('Ctrl+Shift+P');
  });
  it('ignores composition, dead keys, AltGr, repeats and Meta', () => {
    for (const event of [
      new KeyboardEvent('keydown', { key: 'p', isComposing: true }),
      new KeyboardEvent('keydown', { key: 'Dead' }),
      new KeyboardEvent('keydown', { key: 'p', metaKey: true }),
      new KeyboardEvent('keydown', { key: 'p', repeat: true }),
      new KeyboardEvent('keydown', { key: 'Process', keyCode: 229 }),
    ]) expect(shortcutFromEvent(event)).toBeNull();
    const altgr = new KeyboardEvent('keydown', { key: 'p', ctrlKey: true, altKey: true });
    vi.spyOn(altgr, 'getModifierState').mockImplementation((key) => key === 'AltGraph');
    expect(shortcutFromEvent(altgr)).toBeNull();
  });
  it('names tool and app/browser conflicts without changing the previous assignment', async () => {
    await expect(saveShortcut('pin', 'c')).rejects.toThrow('C is already Color picker.');
    await expect(saveShortcut('pin', 'Ctrl+K')).rejects.toThrow('Wayfinder’s Jump to');
    await expect(saveShortcut('pin', 'Ctrl+C')).rejects.toThrow('Copy');
    await expect(saveShortcut('pin', 'Ctrl+W')).rejects.toThrow('Close window');
    await expect(saveShortcut('pin', 'Ctrl+Shift+P')).rejects.toThrow('System print');
    expect(shortcutAssignments().pin).toBe('P');
    expect(shortcutProblem(shortcutAssignments(), 'pin', 'P')).toBeNull();
  });
  it('persists immediately and resets only the changed assignments in the confirmed snapshot', async () => {
    await saveShortcut('pin', 'Shift+P');
    await saveShortcut('note', 'M');
    const snapshot = shortcutAssignments();
    expect(JSON.parse(localStorage.getItem(SHORTCUTS_KEY)!)).toEqual(snapshot);
    const result = await resetShortcuts({ pin: snapshot.pin, note: snapshot.note });
    expect(result.restored).toEqual(['pin', 'note']);
    expect(result.assignments).toEqual({ pin: 'P', element: 'E', color: 'C', note: 'N', panel: 'F' });
    expect((await resetShortcuts()).restored).toEqual([]);
  });
  it('merges saves and preserves newer edits made after reset confirmation opens', async () => {
    await Promise.all([saveShortcut('pin', 'Shift+P'), saveShortcut('note', 'M')]);
    const snapshot = shortcutAssignments();
    await saveShortcut('note', 'Q');
    const reset = await resetShortcuts(snapshot);
    expect(reset.restored).toEqual(['pin']);
    expect(reset.assignments.note).toBe('Q');
    expect(shortcutAssignments().note).toBe('Q');
  });
  it('revalidates competing saves and never persists duplicate keys', async () => {
    const results = await Promise.allSettled([saveShortcut('pin', 'Q'), saveShortcut('note', 'Q')]);
    expect(results.map((result) => result.status)).toEqual(['fulfilled', 'rejected']);
    expect(shortcutAssignments()).toMatchObject({ pin: 'Q', note: 'N' });
  });
  it('rejects a reset that would clash with a newer untouched assignment', async () => {
    await saveShortcut('pin', 'Q');
    const snapshot = { pin: 'Q' };
    await saveShortcut('note', 'P');
    await expect(resetShortcuts(snapshot)).rejects.toThrow('already');
    expect(shortcutAssignments()).toMatchObject({ pin: 'Q', note: 'P' });
  });
  it('does not report success or change assignments when storage refuses saving', async () => {
    const set = vi.spyOn(localStorage, 'setItem').mockImplementation(() => { throw new Error('Storage unavailable'); });
    await expect(saveShortcut('pin', 'Q')).rejects.toThrow('Storage unavailable');
    expect(shortcutAssignments().pin).toBe('P');
    set.mockRestore();
  });
  it('rejects corrupt, duplicate and reserved stored snapshots as a whole', () => {
    const initial = shortcutAssignments();
    expect(readShortcutAssignments({ ...initial, pin: 'C' })).toEqual(initial);
    expect(readShortcutAssignments({ ...initial, note: 'Ctrl+K' })).toEqual(initial);
    expect(readShortcutAssignments({ pin: 'Q' })).toEqual(initial);
    localStorage.setItem(SHORTCUTS_KEY, 'invalid json');
    expect(shortcutAssignments()).toEqual(initial);
  });
});
