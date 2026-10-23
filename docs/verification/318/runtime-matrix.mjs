import { chromium, _electron } from 'playwright-core';
import electron from 'electron';
import { resolve } from 'node:path';
import { writeFile, readFile, mkdir } from 'node:fs/promises';
import { build } from 'esbuild';
import { pathToFileURL } from 'node:url';
await mkdir('output/playwright', { recursive: true });
await build({ entryPoints: ['src/canvasBridge.ts'], outfile: '.generated/318-bridge.mjs', bundle: true, platform: 'node', format: 'esm' });
const { viewerPrototypeBytes } = await import(pathToFileURL(resolve('.generated/318-bridge.mjs')).href);
const desktop = process.argv.includes('--desktop');
const env = {...process.env}; delete env.ELECTRON_RUN_AS_NODE;
const app = desktop ? await _electron.launch({executablePath:electron,args:['.',`--user-data-dir=${resolve('.generated/318-matrix-profile')}`],cwd:process.cwd(),env,timeout:60000}) : null;
const browser = app ? null : await chromium.launch({channel:'chrome',headless:false});
const page = app ? await app.firstWindow() : await browser.newPage({viewport:{width:1280,height:844}});
const evidence=[];
try {
  let origin='http://127.0.0.1:4488';
  if(app) {await page.waitForURL(u=>u.protocol==='http:',{timeout:60000});origin=new URL(page.url()).origin;}
  page.setDefaultTimeout(15000);
  await page.bringToFront();
  const canvas=`/proto/RAbdelrhman/wayfinder-map/prototype%2F318-qa/${'a'.repeat(40)}/viewer-11/prototypes/verification318/index.html`;
  const config={title:'Verification canvas',pages:[{id:'directions',title:'Directions',sections:[{items:[{id:'A',name:'First',src:'a.html'},{id:'B',name:'Second',src:'b.html'}]}]},{id:'other',title:'Other page',sections:[{items:[{id:'C',name:'Third',src:'a.html'}]}]}]};
  const engineHtml=await readFile('prototypes/canvas/index.html');
  const engineJs=await readFile('prototypes/canvas/canvas.js');
  const engineCss=await readFile('prototypes/canvas/canvas.css');
  const itemHtml=Buffer.from('<!doctype html><html><body style="font:18px system-ui;padding:30px;background:#eef3fa;min-height:1200px"><h1>Keyboard verification canvas</h1><p id="target" tabindex="0">Context stays mounted</p><label>Canvas text <input id="canvas-text"></label></body></html>');
  await page.route('**/proto/**/prototypes/verification318/**',route=>{
    const file=new URL(route.request().url()).pathname.split('/').pop();
    if(file==='config.js') return route.fulfill({contentType:'text/javascript',body:'window.CANVAS='+JSON.stringify(config)});
    if(file==='canvas.js') return route.fulfill({contentType:'text/javascript',body:viewerPrototypeBytes(file,engineJs)});
    if(file==='canvas.css') return route.fulfill({contentType:'text/css',body:engineCss});
    return route.fulfill({contentType:'text/html',body:viewerPrototypeBytes(file,file==='index.html'?engineHtml:itemHtml)});
  });
  await page.goto(`${origin}/repos/RAbdelrhman/wayfinder-map/maps/205?view=map`,{waitUntil:'domcontentloaded',timeout:30000});
  await page.locator('#canvas-viewer').waitFor({state:'attached'});
  await page.evaluate(({canvas})=>{
    const anchor=document.createElement('a');anchor.textContent='Open verification canvas';anchor.href=canvas;
    Object.assign(anchor.dataset,{canvasUrl:canvas,canvasTitle:'Verification canvas',canvasGithub:'https://github.com/RAbdelrhman/wayfinder-map/tree/prototype/318-qa',canvasTicket:'318'});
    document.querySelector('#app').append(anchor);
  },{canvas});
  await page.getByRole('link',{name:'Open verification canvas',exact:true}).click();
  await page.locator('#canvas-viewer .vw-frame.is-ready').waitFor();
  await page.locator('#vw-toolbar [data-go=B]').click();
  const live=await page.locator('#canvas-viewer .vw-frame').elementHandle();
  console.log(JSON.stringify({surface:desktop?'source-built Electron':'localhost Chromium',origin,controlledCanvas:true}));
  const resize=async(width)=>{
    if(app) await app.evaluate(({BrowserWindow},{width})=>{BrowserWindow.getAllWindows()[0].setSize(width,844);},{width});
    else await page.setViewportSize({width,height:844});
  };
  for(const theme of ['light','dark']) for(const width of (desktop?[1280,900]:[1280,390])) {
    await page.evaluate(theme=>{localStorage.setItem('wayfinder-map:theme',theme);document.documentElement.dataset.theme=theme;},theme);
    for(const size of ['full','pane','float']) {
      await resize(1280);
      await page.locator(`#vw-toolbar [data-size=${size}]`).click();
      await resize(width);
      const openSettings=async()=>{
        const shortcut=page.locator('#vw-toolbar [data-canvas-shortcuts]');
        // The existing pane toolbar extends beyond 390px. Exercise its keyboard path rather
        // than pretending the clipped size/toolbar controls have a new responsive design.
        if(width===390 && size!=='full') await shortcut.press('Enter');
        else await shortcut.click();
      };
      await openSettings();
      const s=page.frameLocator('.canvas-settings-frame');
      await page.waitForFunction(()=>document.querySelector('.canvas-settings-frame')?.contentDocument?.readyState==='complete');
      const headingFocus=await s.locator('#settings-category-title').evaluate(e=>e===document.activeElement);
      if(!headingFocus) throw Error(`heading focus ${theme}/${width}/${size}`);
      if(await s.locator('html').evaluate(e=>e.scrollWidth>innerWidth)) throw Error(`overflow ${theme}/${width}/${size}`);
      // The prior loop restored defaults; a first run may have been interrupted.
      if(await s.locator('[data-shortcut-reset]').getAttribute('aria-disabled')!=='true') {
        await s.locator('[data-shortcut-reset]').click();await s.getByRole('dialog').getByRole('button',{name:'Reset shortcuts',exact:true}).click();
        await s.locator('[data-shortcut-reset][aria-disabled=true]').waitFor();
      }
      await s.locator('[data-shortcut-edit=pin]').click();
      await s.locator('[data-shortcut-edit=pin]').press('c');
      if(!(await s.locator('.shortcut-help').innerText()).includes('Color picker')) throw Error('named tool conflict');
      await s.locator('[data-shortcut-edit=pin]').press('Control+c');
      if(!(await s.locator('.shortcut-help').innerText()).includes('Copy')) throw Error('named reserved conflict');
      await s.locator('[data-shortcut-edit=pin]').press('Escape');
      await s.locator('[data-shortcut-edit=pin]').click();await s.locator('[data-shortcut-edit=pin]').press('Shift+q');
      await s.getByRole('button',{name:'Pin shortcut, Shift plus Q, changed from P. Change',exact:true}).waitFor();
      await s.locator('#settings-live').filter({hasText:'Saved. Pin is now Shift plus Q.'}).waitFor({state:'attached'});
      await s.locator('[data-shortcut-reset]').click();
      const dialog=s.getByRole('dialog');
      if(await dialog.locator('li').count()!==1 || !await dialog.getByRole('button',{name:'Cancel',exact:true}).evaluate(e=>e===document.activeElement)) throw Error('singular reset/focus');
      await dialog.getByRole('button',{name:'Cancel',exact:true}).press('Escape');
      await s.locator('[data-canvas-return][aria-label*="option B"]').waitFor();
      const context=await s.locator('[data-canvas-return]').getAttribute('aria-label');
      if(!context?.includes('option B')) throw Error('return context');
      await page.screenshot({path:`output/playwright/318-${desktop?'electron':'localhost'}-${theme}-${width}-${size}.png`});
      await s.locator('[data-canvas-return]').click();await page.locator('.canvas-settings-frame').waitFor({state:'detached'});
      if(!await live.evaluate(e=>e.isConnected)) throw Error('live canvas remounted');
      if(await page.locator('#vw-toolbar [data-go=B]').getAttribute('aria-pressed')!=='true') throw Error('option changed');
      const pin=page.locator('#vw-toolbar [data-fb-tool=pin]');
      if(await pin.getAttribute('aria-keyshortcuts')!=='Shift+Q') throw Error('hint mismatch');
      await page.locator('#vw-toolbar [data-canvas-shortcuts]').press('Shift+q');
      if(await pin.getAttribute('aria-pressed')!=='true') throw Error('new handler');
      await page.locator('#vw-toolbar [data-canvas-shortcuts]').press('p');
      if(await pin.getAttribute('aria-pressed')!=='true') throw Error('old handler');
      await page.locator('#vw-toolbar [data-canvas-shortcuts]').press('Shift+q');
      const canvasFrame=page.frameLocator('#canvas-viewer .vw-frame').frameLocator('#present-frame');
      await canvasFrame.locator('#canvas-text').press('Shift+q');
      if(await pin.getAttribute('aria-pressed')!=='false') throw Error('tool fired while typing');
      // Now focus the canvas document outside text, and verify the real opaque-origin bridge.
      await canvasFrame.locator('#target').focus();await page.keyboard.press('Shift+q');
      await page.waitForFunction(()=>document.querySelector('[data-fb-tool=pin]')?.getAttribute('aria-pressed')==='true');
      await page.locator('#vw-toolbar [data-canvas-shortcuts]').press('Shift+q');
      await openSettings();
      await page.waitForFunction(()=>document.querySelector('.canvas-settings-frame')?.contentDocument?.readyState==='complete');
      await s.locator('[data-shortcut-edit=note]').click();await s.locator('[data-shortcut-edit=note]').press('m');
      await s.getByRole('button',{name:'Note shortcut, M, changed from N. Change',exact:true}).waitFor();
      await s.locator('[data-shortcut-reset]').click();
      if(await s.getByRole('dialog').locator('li').count()!==2) throw Error('two reset list');
      await s.getByRole('dialog').getByRole('button',{name:'Cancel',exact:true}).click();
      await s.locator('[data-shortcut-reset]').click();await s.getByRole('dialog').getByRole('button',{name:'Reset shortcuts',exact:true}).click();
      await s.locator('#settings-live').filter({hasText:'2 shortcuts restored to defaults'}).waitFor({state:'attached'});
      if(await s.locator('.shortcut-saved').count()!==2) throw Error('Saved on unchanged row');
      await s.locator('[data-canvas-return]').click();await page.locator('.canvas-settings-frame').waitFor({state:'detached'});
      const result={theme,width,size,entry:width===390 && size!=='full'?'keyboard':'pointer',focus:true,conflicts:true,save:true,reset:true,announcements:true,bridge:true,textGuard:true,sameFrame:true,sameOption:true};
      evidence.push(result);console.log(JSON.stringify(result));
    }
  }
  // The real engine must not consume configured T or Shift+P, while its screen controls work.
  await resize(1280);
  await page.locator('#vw-toolbar [data-size=full]').click();
  const engine=page.frameLocator('#canvas-viewer .vw-frame');
  for(const assignment of [{key:'t',label:'T'},{key:'Shift+p',label:'Shift+P'}]) {
    await page.locator('#vw-toolbar [data-canvas-shortcuts]').click();
    const s=page.frameLocator('.canvas-settings-frame');
    await s.locator('[data-shortcut-edit=pin]').click();
    await s.locator('[data-shortcut-edit=pin]').press(assignment.key);
    await s.getByRole('button',{name:`Pin shortcut, ${assignment.label.split('+').join(' plus ')}, changed from P. Change`,exact:true}).waitFor();
    await s.locator('[data-canvas-return]').click();await page.locator('.canvas-settings-frame').waitFor({state:'detached'});
    const theme=await engine.locator('#present-theme').innerText();
    await engine.locator('#notes').focus();
    if(assignment.label.startsWith('Shift+')) await page.keyboard.down('Shift');
    await page.keyboard.down(assignment.key.split('+').pop());
    await page.keyboard.down(assignment.key.split('+').pop());
    await page.keyboard.up(assignment.key.split('+').pop());
    if(assignment.label.startsWith('Shift+')) await page.keyboard.up('Shift');
    await page.waitForFunction(()=>document.querySelector('[data-fb-tool=pin]')?.getAttribute('aria-pressed')==='true');
    if(await engine.locator('#present-theme').innerText()!==theme) throw Error('engine theme swallowed tool');
    if(await engine.locator('#pages-menu').isVisible()) throw Error('engine page menu swallowed tool');
    await page.locator('#vw-toolbar [data-canvas-shortcuts]').press(assignment.key);
    console.log(JSON.stringify({realEnginePriority:assignment.label,toolFired:true,engineUnchanged:true}));
  }
  const beforeTheme=await engine.locator('#present-theme').innerText();
  await engine.locator('#present-theme').click();
  if(await engine.locator('#present-theme').innerText()===beforeTheme) throw Error('engine screen control unavailable');
  await writeFile(`output/playwright/318-${desktop?'electron':'localhost'}-matrix.json`,JSON.stringify({surface:desktop?'source-built Electron':'localhost Chromium',origin,controlledCanvas:true,realEngine:true,evidence},null,2));
} catch(error) {console.log(await page.evaluate(()=>({url:location.href,viewer:document.querySelector('#canvas-viewer')?.className,frameUrl:document.querySelector('.canvas-settings-frame')?.contentWindow?.location.href,back:document.querySelector('.canvas-settings-frame')?.contentDocument?.querySelector('[data-canvas-return]')?.outerHTML,settings:document.querySelector('.canvas-settings-frame')?.contentDocument?.querySelector('#main')?.innerText,active:document.querySelector('.canvas-settings-frame')?.contentDocument?.activeElement?.outerHTML?.slice(0,300)})));await page.screenshot({path:`output/playwright/318-${desktop?'electron':'localhost'}-failure.png`});throw error;}
finally {if(app) await app.close();if(browser) await browser.close();}
