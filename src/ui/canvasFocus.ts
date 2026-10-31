/** Keep the user's focus owner while a canvas is open, including on older browsers.
 * This restores focus after a frame takes it; it is not browser-level prevention.
 */
export function mountCanvasFocus(viewer: HTMLElement, isOpen: () => boolean, canvas: () => HTMLIFrameElement | null): void {
  const document = viewer.ownerDocument;
  const window = document.defaultView!;
  let owner: HTMLElement | null = null;
  let range: Range | null = null;
  let tabbing = false;
  let pending: ReturnType<typeof setTimeout> | undefined;
  let configured: HTMLIFrameElement | null = null;
  let token = '';
  const configure = (): void => {
    const frame = canvas();
    if (!frame) return;
    if (configured !== frame) { configured = frame; token = window.crypto.randomUUID(); }
    frame.contentWindow?.postMessage({ wf: 1, type: 'focus-config', token }, '*');
  };
  document.addEventListener('load', (event) => { if (event.target === canvas()) configure(); }, true);
  const rememberSelection = (): void => {
    if (document.activeElement !== owner) return;
    const selection = document.getSelection();
    range = owner && selection?.rangeCount && owner.contains(selection.anchorNode) ? selection.getRangeAt(0).cloneRange() : null;
  };
  document.addEventListener('focusin', (event) => {
    const target = event.target as HTMLElement | null;
    if (!isOpen() || !target || target.tagName === 'IFRAME') return;
    tabbing = false;
    owner = target;
    rememberSelection();
  });
  document.addEventListener('selectionchange', rememberSelection);
  document.addEventListener('keydown', (event) => {
    tabbing = event.key === 'Tab';
    // A renderer transfer is asynchronous. Keep the intent until its focus
    // transition, rather than expiring it while Chromium is still handling it.
    if (tabbing) queueMicrotask(() => { if (event.defaultPrevented && document.activeElement !== canvas()) tabbing = false; });
  }, true);
  document.addEventListener('pointerdown', () => { tabbing = false; }, true);
  // The current viewer subtree gets a private token for direct focus messages.
  // A nested pointerdown must arrive before the queued recovery, without an
  // extra event-loop hop for every iframe ancestor. Tiles never get this token.
  window.addEventListener('message', (event: MessageEvent<unknown>) => {
    const frame = canvas();
    if (!frame ||
      typeof event.data !== 'object' || event.data === null) return;
    const data = event.data as Record<string, unknown>;
    if (event.source === frame.contentWindow && data['wf'] === 1 && data['type'] === 'ready') configure();
    if (!isOpen() || data['wf'] !== 1 || (event.source !== frame.contentWindow && (configured !== frame || !token || data['token'] !== token))) return;
    if (data['type'] === 'focus-entry' && document.activeElement === frame) { owner = frame; range = null; }
    if (data['wf'] === 1 && data['type'] === 'focus-leave') recover();
  });
  function recover(): void {
    clearTimeout(pending);
    const restore = (): void => {
      if (!isOpen() || !document.hasFocus()) { tabbing = false; return; } // Never reactivate an OS window.
      const active = document.activeElement;
      if (active?.tagName !== 'IFRAME') return;
      if (active === canvas() && (owner === active || tabbing)) { owner = active as HTMLIFrameElement; tabbing = false; return; }
      if (active !== canvas() && active.getAttribute('aria-hidden') !== 'true') return;
      const target = owner?.isConnected && !owner.closest('[hidden], [inert]') ? owner : viewer.querySelector<HTMLElement>('[data-close]');
      if (!target) return;
      const field = target.tagName === 'INPUT' || target.tagName === 'TEXTAREA' ? target as HTMLInputElement | HTMLTextAreaElement : null;
      const start = field?.selectionStart, end = field?.selectionEnd, direction = field?.selectionDirection;
      const savedRange = range;
      target.focus({ preventScroll: true });
      if (field && start !== null && start !== undefined && end !== null && end !== undefined) field.setSelectionRange(start, end, direction ?? undefined);
      if (savedRange?.startContainer.isConnected && target.contains(savedRange.startContainer)) {
        const selection = document.getSelection();
        selection?.removeAllRanges();
        selection?.addRange(savedRange);
      }
    };
    // Chromium can blur the host before dispatching pointerdown in another
    // renderer. Give entry into the VIEWER a bounded chance to identify itself.
    // Background tiles are never valid entry targets and recover immediately.
    pending = setTimeout(() => {
      if (document.activeElement === canvas() && owner !== canvas() && !tabbing) pending = setTimeout(restore, 50);
      else restore();
    }, 0);
  }
  window.addEventListener('blur', () => recover());
}
