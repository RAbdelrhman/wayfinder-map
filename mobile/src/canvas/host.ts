const escape = (value: string) => value.replace(/[&<>"']/g, character => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[character] ?? character);

/** The repository lives in an opaque sandbox, without a native message bridge. */
export function canvasHost(document: string, width: number, height: number, theme: 'light' | 'dark'): string {
  if (!document.startsWith('data:text/html;charset=utf-8,') || !Number.isFinite(width) || !Number.isFinite(height)
    || width < 1 || width > 10000 || height < 1 || height > 30000) throw new Error('Invalid canvas option.');
  const target = document;
  return `<!doctype html><html><head><meta name="viewport" content="width=device-width,initial-scale=1,maximum-scale=1,user-scalable=no"><meta http-equiv="Content-Security-Policy" content="default-src 'none'; script-src 'unsafe-inline'; style-src 'unsafe-inline'; frame-src data:; img-src data:; connect-src 'none'; form-action 'none'; base-uri 'none'"><style>html,body{margin:0;width:100%;height:100%;overflow:hidden;background:${theme === 'dark' ? '#171717' : '#ededed'}}#stage{width:100%;height:100%;overflow:auto;touch-action:pan-x pan-y}#space{position:relative;min-width:100%;min-height:100%;display:flex;align-items:center;justify-content:center}iframe{border:0;transform-origin:top left;position:absolute;background:transparent}</style></head><body><div id="stage"><div id="space"><iframe sandbox="allow-scripts" title="Prototype option" src="${escape(target)}" width="${width}" height="${height}"></iframe></div></div><script>
const frame=document.querySelector('iframe'),space=document.querySelector('#space'),stage=document.querySelector('#stage');let scale=1,fit=1,manual=false;
function layout(){fit=Math.min(innerWidth/${width},innerHeight/${height},1);if(!manual)scale=fit;space.style.width=Math.max(innerWidth,${width}*scale)+'px';space.style.height=Math.max(innerHeight,${height}*scale)+'px';frame.style.transform='scale('+scale+')';frame.style.left=Math.max(0,(innerWidth-${width}*scale)/2)+'px';frame.style.top=Math.max(0,(innerHeight-${height}*scale)/2)+'px'}
window.canvasZoom=function(value){if(value===0){manual=false;stage.scrollTo(0,0)}else{manual=true;scale=Math.max(fit,Math.min(3,scale*value))}layout()};addEventListener('resize',layout);layout();
let pinch=0;stage.addEventListener('touchstart',e=>{if(e.touches.length===2)pinch=Math.hypot(e.touches[0].clientX-e.touches[1].clientX,e.touches[0].clientY-e.touches[1].clientY)},{passive:true});stage.addEventListener('touchmove',e=>{if(e.touches.length===2&&pinch){const distance=Math.hypot(e.touches[0].clientX-e.touches[1].clientX,e.touches[0].clientY-e.touches[1].clientY);window.canvasZoom(distance/pinch);pinch=distance;e.preventDefault()}},{passive:false});
</script></body></html>`;
}

export function allowedCanvasNavigation(url: string): boolean {
  return url === 'about:blank' || url === 'about:srcdoc' || url.startsWith('data:text/html;charset=utf-8,');
}
