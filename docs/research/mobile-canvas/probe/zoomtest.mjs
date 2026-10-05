// #221 research probe (real Android WebView via adb + DevTools). See ../../mobile-canvas-rendering.md.
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const pages = (await (await fetch('http://127.0.0.1:9333/json')).json()).filter((p) => p.type === 'page' && JSON.parse(p.description).attached);
const ws = new WebSocket(pages[0].webSocketDebuggerUrl); await new Promise((r) => ws.addEventListener('open', r));
let id = 0; const wait = new Map(); const events = [];
ws.addEventListener('message', (m) => { const d = JSON.parse(m.data); if (wait.has(d.id)) { wait.get(d.id)(d); wait.delete(d.id); } else events.push(d); });
const send = (method, params = {}) => new Promise((r) => { const i = ++id; wait.set(i, r); ws.send(JSON.stringify({ id: i, method, params })); });
const ev = async (expression, contextId) => (await send('Runtime.evaluate', { expression, contextId, returnByValue: true })).result?.result?.value;
async function frameWidths() {
  events.length = 0; await send('Runtime.disable'); await send('Runtime.enable'); await sleep(800);
  const ctx = events.filter((e) => e.method === 'Runtime.executionContextCreated' && e.params.context.auxData?.isDefault).map((e) => e.params.context.id);
  const out = []; for (const c of ctx) { const v = await ev('location.href.includes("variants") ? innerWidth : null', c); if (v !== null && v !== undefined) out.push(v); }
  return out.slice(0, 4);
}
console.log('stage zoom', await ev(`getComputedStyle(document.getElementById('stage')).zoom`), 'iframe css width', await ev(`document.querySelector('iframe[data-frame]').style.width`), 'inner widths', await frameWidths());
await ev(`document.getElementById('stage').style.zoom = '1'`); await sleep(1500);
console.log('after zoom=1 → inner widths', await frameWidths());
ws.close();
