// #221 research probe (real Android WebView via adb + DevTools). See ../../mobile-canvas-rendering.md.
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const pages = (await (await fetch('http://127.0.0.1:9333/json')).json()).filter((p) => p.type === 'page' && JSON.parse(p.description).attached);
const ws = new WebSocket(pages[0].webSocketDebuggerUrl); await new Promise((r) => ws.addEventListener('open', r));
const res = new Promise((r) => ws.addEventListener('message', (m) => r(JSON.parse(m.data))));
ws.send(JSON.stringify({ id: 1, method: 'Runtime.evaluate', params: { returnByValue: true, expression: `(() => {
  history.replaceState(null, '', location.pathname); visualViewport; const vw = innerWidth;
  const over = [...document.querySelectorAll('header *')].filter((el) => el.getClientRects().length && el.getBoundingClientRect().right > vw + 1).map((el) => el.id || el.className || el.tagName).slice(0, 8);
  return { chrome: navigator.userAgent.split(' ').find((p) => p.startsWith('Chrome')), vw, dpr: devicePixelRatio, docScrollWidth: document.documentElement.scrollWidth, zoomLabel: document.getElementById('zoom-fit')?.textContent, chromeOverflow: over, frames: document.querySelectorAll('iframe[data-frame]').length, url: location.href.slice(-40) };
})()` } }));
console.log(process.argv[2], JSON.stringify((await res).result?.result?.value ?? (await res)));
ws.close();
