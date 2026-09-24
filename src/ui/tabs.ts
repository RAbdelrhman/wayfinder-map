/* ARIA tabs: the attributes a tab and its panel need, and arrow-key movement along a tablist. */

/** Attributes for a `role="tab"` button. Only the selected tab sits in the Tab order; arrows move between the rest. */
export function tabAttrs(id: string, panelId: string, selected: boolean): string {
  return `role="tab" id="${id}" aria-selected="${String(selected)}" aria-controls="${panelId}" tabindex="${selected ? '0' : '-1'}"`;
}

/** Attributes for the `role="tabpanel"` that `tabId` controls. */
export function tabPanelAttrs(id: string, tabId: string): string {
  return `role="tabpanel" id="${id}" aria-labelledby="${tabId}"`;
}

/** The tab index a key moves to, wrapping at the ends, or null when the key isn't a tab key. */
export function nextTabIndex(key: string, current: number, count: number): number | null {
  if (count === 0) return null;
  if (key === 'ArrowRight' || key === 'ArrowDown') return (current + 1) % count;
  if (key === 'ArrowLeft' || key === 'ArrowUp') return (current - 1 + count) % count;
  if (key === 'Home') return 0;
  if (key === 'End') return count - 1;
  return null;
}
