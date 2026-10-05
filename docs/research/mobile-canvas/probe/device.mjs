// #221 research probe (real Android WebView via adb + DevTools). See ../../mobile-canvas-rendering.md.
// Drive canvases in a real Android System WebView (the probe APK) over adb + the WebView's DevTools socket.
import { execFileSync } from 'node:child_process';
import { writeFileSync, mkdirSync } from 'node:fs';
const DEV = ['-s', 'emulator-5556'];
const adb = (...a) => execFileSync('adb', [...DEV, ...a], { maxBuffer: 1 << 26, env: { ...process.env, MSYS_NO_PATHCONV: '1' } });
const sh = (cmd) => adb('shell', cmd).toString();
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const PKG = 'dev.wayfinder.probe';
const FILES = `/data/user/0/${PKG}/files`;
mkdirSync('shots-device', { recursive: true });

async function cdp() {
  const pid = sh(`pidof ${PKG}`).trim();
  execFileSync('adb', [...DEV, 'forward', 'tcp:9333', `localabstract:webview_devtools_remote_${pid}`]);
  let pages = [];
  for (let i = 0; i < 20 && !pages.length; i++) { try { pages = (await (await fetch('http://127.0.0.1:9333/json')).json()).filter((p) => p.type === 'page' && JSON.parse(p.description).attached); } catch { await sleep(1000); } }
  const ws = new WebSocket(pages[0].webSocketDebuggerUrl);
  await new Promise((r) => ws.addEventListener('open', r));
  let id = 0; const waiting = new Map(); const events = [];
  ws.addEventListener('message', (m) => { const d = JSON.parse(m.data); if (d.id && waiting.has(d.id)) { waiting.get(d.id)(d); waiting.delete(d.id); } else events.push(d); });
  const send = (method, params = {}) => new Promise((r) => { const i = ++id; waiting.set(i, r); ws.send(JSON.stringify({ id: i, method, params })); });
  const evaluate = async (expr) => (await send('Runtime.evaluate', { expression: expr, returnByValue: true, awaitPromise: true })).result?.result?.value;
  return { send, evaluate, events, close: () => ws.close() };
}

const MEASURE = `(() => {
  const vw = innerWidth, board = document.getElementById('board');
  const over = [...document.querySelectorAll('header *')].filter((el) => el.getClientRects().length && el.getBoundingClientRect().right > vw + 1).map((el) => el.id || el.className || el.tagName).slice(0, 8);
  return { ua: navigator.userAgent.split(' ').find((p) => p.startsWith('Chrome')), vw, dpr: devicePixelRatio, docScrollWidth: document.documentElement.scrollWidth,
    zoomLabel: document.getElementById('zoom-fit')?.textContent, chromeOverflow: over, frames: document.querySelectorAll('iframe[data-frame]').length };
})()`;

const results = [];
for (const c of ['c223', 'c207']) {
  adb('push', `${c}.tar`, `/data/local/tmp/${c}.tar`);
  sh(`run-as ${PKG} sh -c 'mkdir -p ${FILES}/${c} && tar -xf /data/local/tmp/${c}.tar -C ${FILES}/${c}'`);
  adb('logcat', '-c');
  sh(`am start -S -n ${PKG}/.Main --es url file://${FILES}/${c}/prototypes/canvas/index.html`);
  await sleep(9000);
  const t = await cdp();
  const r = { canvas: c, ...(await t.evaluate(MEASURE)) };
  writeFileSync(`shots-device/${c}-board.png`, adb('exec-out', 'screencap', '-p'));
  r.present = await t.evaluate(`(() => { document.querySelector('button.hit').click(); return true })()`);
  await sleep(2500);
  writeFileSync(`shots-device/${c}-present-notes.png`, adb('exec-out', 'screencap', '-p'));
  r.presentFrameWidth = await t.evaluate(`Math.round([...document.querySelectorAll('iframe')].find((f) => f.getClientRects().length && !f.dataset.frame)?.getBoundingClientRect().width ?? -1)`);
  await t.evaluate(`document.getElementById('notes')?.click()`);
  await sleep(1500);
  writeFileSync(`shots-device/${c}-present.png`, adb('exec-out', 'screencap', '-p'));
  await t.evaluate(`document.getElementById('notes')?.click(); document.querySelector('[id*=close], .present-close, #present-close')?.click(); history.back()`);
  await sleep(1500);
  const before = await t.evaluate('visualViewport.scale');
  const pinch = await t.send('Input.synthesizePinchGesture', { x: 200, y: 500, scaleFactor: 2, relativeSpeed: 800, gestureSourceType: 'touch' });
  await sleep(800);
  r.pinch = { before, after: await t.evaluate('visualViewport.scale'), canvasZoom: await t.evaluate(`document.getElementById('zoom-fit')?.textContent`), error: pinch.error?.message };
  writeFileSync(`shots-device/${c}-pinched.png`, adb('exec-out', 'screencap', '-p'));
  t.close();
  r.logErrors = adb('logcat', '-d', '-s', 'CanvasProbe:*').toString().split('\n').filter((l) => /ERROR|WARNING/.test(l)).map((l) => l.slice(l.indexOf('CanvasProbe'), 260)).slice(0, 10);
  results.push(r);
}
writeFileSync('results-device.json', JSON.stringify(results, null, 2));
console.log(JSON.stringify(results, null, 1));
