const CONTROL_ATTRIBUTES = ['id', 'data-number', 'data-panel', 'data-section', 'data-filter', 'data-tier', 'data-jump'] as const;

/** Restore the same control after its container replaces it, without moving the viewport. */
export function rememberControlFocus(root: HTMLElement): () => void {
  const active = root.ownerDocument.activeElement;
  if (!(active instanceof HTMLElement) || !root.contains(active)) return () => undefined;
  const attribute = CONTROL_ATTRIBUTES.find((name) => (active.getAttribute(name) ?? '') !== '');
  if (attribute === undefined) return () => undefined;
  const value = active.getAttribute(attribute);
  const tag = active.tagName;
  return () => {
    if (active.isConnected) return;
    const replacement = [...root.querySelectorAll<HTMLElement>(`[${attribute}]`)]
      .find((element) => element.tagName === tag && element.getAttribute(attribute) === value);
    replacement?.focus({ preventScroll: true });
  };
}
