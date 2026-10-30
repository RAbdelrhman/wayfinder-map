import type { InlineCanvasBundle } from './inlineCanvasBundle.js';

/** Runs only inside the untrusted prototype iframe, never in the MCP tool host. */
export function inlineCanvasDocument(bundle: InlineCanvasBundle, target = bundle.entry, depth = 0, markup?: string): string {
  if (depth > 12) throw new Error('Canvas frames are nested too deeply.');
  const url = new URL(target.startsWith('prototypes/') ? '/' + target : target, `https://canvas.invalid/${bundle.entry}`);
  const file = decodeURIComponent(url.pathname.slice(1));
  const source = markup ?? bundle.files[file];
  if (source === undefined || !/\.html?$/i.test(file)) throw new Error('Canvas frame is unavailable.');
  const safe = (value: string): string => value.replace(/<\/script/gi, '<\\/script');
  const attr = (value: string): string => value.replace(/&/g, '&amp;').replace(/"/g, '&quot;').replace(/</g, '&lt;');
  const pathOf = (relative: string, from = file): string => decodeURIComponent(new URL(relative, `https://canvas.invalid/${from}`).pathname.slice(1));
  const css = (path: string): string => (bundle.files[path] ?? '').replace(/url\(\s*["']?([^'"\s)]+)["']?\s*\)/gi, (whole, relative: string) => {
    if (relative.startsWith('data:')) return whole;
    const value = bundle.files[pathOf(relative, path)];
    return value?.startsWith('data:') ? `url("${value}")` : 'url("")';
  });
  const script = (path: string): string => {
    let value = bundle.files[path];
    if (value === undefined) throw new Error('Canvas script is unavailable.');
    value = value.replace(/\blocation\.search\b/g, JSON.stringify(url.search));
    if (/(?:^|\/)canvas\.js$/.test(path)) {
      value = value.replace(/function loadFrame\(frame, item, present\)\s*\{/, "function loadFrame(frame, item, present) { if(item.kind==='page'){frame.removeAttribute('src');frame.srcdoc=window.__wfDocument(pageSrc(item));return;}");
      value = value.replace(/frame\.srcdoc\s*=\s*srcdoc\(item,\s*present\);/g, 'frame.srcdoc = window.__wfMarkup(srcdoc(item, present));');
    }
    return `<script>${safe(value)}</script>`;
  };
  // JSON data is escaped before becoming a script, including malicious </script> in a repo file.
  const bootstrap = `(()=>{const bundle=${JSON.stringify(bundle).replace(/</g, '\\u003c')};const render=${inlineCanvasDocument.toString()};window.__wfDocument=(target)=>render(bundle,new URL(target,${JSON.stringify(url.href)}).href,${depth + 1});window.__wfMarkup=(markup)=>render(bundle,${JSON.stringify(url.href)},${depth + 1},markup);})();`;
  // One pass over markup. Never scan inserted script strings as if they were
  // HTML; canvas engines themselves contain <link> and <img> templates.
  let html = source.replace(/<script\b[^>]*>[\s\S]*?<\/script>|<style\b[^>]*>[\s\S]*?<\/style>|<(?:link|img|iframe)\b[^>]*>/gi, tag => {
    const opening = tag.slice(0, tag.indexOf('>') + 1);
    const reference = /\b(?:src|href)\s*=\s*["']([^"']+)["']/i.exec(opening)?.[1];
    if (!reference) return tag;
    if (reference.startsWith('data:') || reference.startsWith('#')) return tag;
    if (/^<script/i.test(tag)) return script(pathOf(reference));
    if (/^<style/i.test(tag)) return tag;
    if (/^<link/i.test(tag)) return `<style>${css(pathOf(reference)).replace(/<\/style/gi, '<\\/style')}</style>`;
    if (/^<iframe/i.test(tag)) return tag.replace(/\bsrc\s*=\s*["'][^"']+["']/i, () => `srcdoc="${attr(inlineCanvasDocument(bundle, new URL(reference, url).href, depth + 1))}"`);
    return tag.replace(/\bsrc\s*=\s*["'][^"']+["']/i, () => `src="${attr(bundle.files[pathOf(reference)] ?? '')}"`);
  });
  // Only the engine creates dynamic page frames. Do not duplicate the entire
  // asset bundle inside every phone screen, which is costly on mobile.
  if (/<script\b[^>]*\bsrc=["'][^"']*\bcanvas\.js["']/i.test(source)) {
    html = html.replace(/<head([^>]*)>/i, (_all, attrs: string) => `<head${attrs}><script>${safe(bootstrap)}</script>`);
  }
  // srcdoc has no hierarchical URL. The bridge reports file identities against
  // the immutable logical path, while actual navigation remains inside srcdoc.
  const bridged = bundle.bridge
    .replace(/\blocation\.href\b/g, JSON.stringify(url.href))
    .replace(/\blocation\.replace\(/g, '__wfNavigate(');
  // A relative '#frame' passed to location.replace resolves against srcdoc's
  // embedder URL, loading the MCP app into itself. Keep replacements on this
  // actual about:srcdoc document; only metadata uses the logical repo URL.
  const navigation = `const __wfNavigate=(value)=>{const next=new URL(value,${JSON.stringify(url.href)});location.replace(location.href.split('#')[0]+next.hash);};`;
  const bridge = `<script>${safe(`(()=>{${navigation}${bridged}})();`)}</script>`;
  const end = html.lastIndexOf('</body>');
  return end >= 0 ? html.slice(0, end) + bridge + html.slice(end) : html + bridge;
}
