/** Full Settings runs in its own document while the exact live viewer remains mounted. */
export function mountCanvasSettings(viewer: HTMLElement, app: HTMLElement, returned: () => void, context: () => { title: string; option: string | null } = () => ({ title: '', option: null })): { open(): void; isOpen(): boolean } {
  let frame: HTMLIFrameElement | null = null;
  let opened = false;
  let previousInert = false;
  let canvasUrl = '';
  const show = (): void => {
    if (opened) return;
    opened = true;
    previousInert = app.inert;
    app.inert = true;
    viewer.hidden = true;
    viewer.inert = true;
    frame = document.createElement('iframe');
    frame.title = 'Settings';
    frame.className = 'canvas-settings-frame';
    Object.assign(frame.style, { position: 'fixed', inset: '0', width: '100%', height: '100%', border: '0', zIndex: '1000', background: 'var(--surface-1)' });
    frame.src = '/settings?section=shortcuts&canvas=1';
    frame.addEventListener('load', () => {
      frame?.contentWindow?.postMessage({ type: 'wayfinder:canvas-context', ...context() }, location.origin);
      // A frame navigation can restore body focus after its module runs. Set the final arrival
      // focus once the document has loaded, including in Electron's pane and float modes.
      const heading = frame?.contentDocument?.querySelector<HTMLElement>('#settings-category-title');
      heading?.focus();
    });
    document.body.append(frame);
    frame.focus();
  };
  const hide = (): void => {
    if (!opened) return;
    opened = false;
    frame?.remove();
    frame = null;
    app.inert = previousInert;
    viewer.inert = false;
    viewer.hidden = false;
    // Settings is a separate same-origin document; adopt its saved theme before showing the canvas.
    try {
      const theme = localStorage.getItem('wayfinder-map:theme');
      if (theme === 'light' || theme === 'dark') document.documentElement.dataset.theme = theme;
    } catch { /* Keep the current theme if storage is unavailable. */ }
    returned();
  };
  window.addEventListener('message', (event: MessageEvent<unknown>) => {
    if (!opened || event.source === null || event.source !== frame?.contentWindow || event.origin !== location.origin) return;
    if (typeof event.data === 'object' && event.data !== null && 'type' in event.data && event.data.type === 'wayfinder:canvas-return') history.back();
  });
  window.addEventListener('popstate', (event) => {
    const state = event.state as Record<string, unknown> | null;
    if (state?.['wfCanvasSettings'] === true) {
      show();
      event.stopImmediatePropagation();
    } else if (opened) {
      hide();
      // The previous entry is the still-mounted canvas, not a new viewer open.
      if (location.href === canvasUrl) event.stopImmediatePropagation();
    }
  }, true);
  return {
    isOpen: () => opened,
    open: () => {
      if (opened) return;
      canvasUrl = location.href;
      history.pushState({ ...history.state as Record<string, unknown> | null, wfCanvasSettings: true }, '', '/settings?section=shortcuts');
      show();
    },
  };
}
