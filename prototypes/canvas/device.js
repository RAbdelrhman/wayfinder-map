/*
 * The phone presentation chosen from #226 at 9dd39abe. Load after kit.js and
 * the page's styles, at the end of body. Opt in once on the app root; existing
 * pages and other device types are deliberately left alone. Classic script
 * so the same page works directly and in the opaque-origin canvas viewer.
 */
(() => {
  const app = document.querySelector('body.viz-root > #app[data-canvas-device="phone"]');
  if (!app || document.head.querySelector('style[data-canvas-device-style="phone"]')) return;
  const style = document.createElement('style');
  style.dataset.canvasDeviceStyle = 'phone';
  style.textContent = `@media (min-width: 520px) {
    body.viz-root {
      display: grid;
      place-items: center;
      place-content: center;
      background: color-mix(in srgb, var(--plane) 88%, var(--text-primary));
    }
    body.viz-root > #app[data-canvas-device="phone"] {
      flex: none;
      width: 390px;
      height: 844px;
      border-radius: 36px;
      box-shadow: 0 0 0 1px var(--hairline), var(--shadow);
      transform: scale(var(--device-fit, 1));
    }
  }`;
  document.head.append(style);
  const fitDevice = () => document.documentElement.style.setProperty('--device-fit', String(Math.max(0, Math.min(1, (innerHeight - 24) / 844, (innerWidth - 24) / 390))));
  addEventListener('resize', fitDevice);
  fitDevice();
})();
