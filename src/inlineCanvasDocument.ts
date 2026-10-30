import type { InlineCanvasBundle } from './inlineCanvasBundle.js';

/** Consume script/style bodies before looking for asset tags inside markup. */
export function canvasHtmlTags(): RegExp {
  return /<script\b[^>]*>[\s\S]*?<\/script\b[^>]*>|<style\b[^>]*>[\s\S]*?<\/style\b[^>]*>|<(?:link|img|iframe)\b[^>]*>/gi;
}

/** Runs only inside the untrusted prototype iframe, never in the MCP tool host. */
export function inlineCanvasDocument(bundle: InlineCanvasBundle, target = bundle.entry, depth = 0, markup?: string, tags = canvasHtmlTags()): string {
  if (depth > 12) throw new Error('Canvas frames are nested too deeply.');
  const url = new URL(target.startsWith('prototypes/') ? '/' + target : target, `https://canvas.invalid/${bundle.entry}`);
  const file = decodeURIComponent(url.pathname.slice(1));
  const source = markup ?? bundle.files[file];
  if (source === undefined || !/\.html?$/i.test(file)) throw new Error('Canvas frame is unavailable.');
  const safe = (value: string): string => value.replace(/<\/script/gi, '<\\/script');
  // JSON quoting alone does not keep data inside a script element. Escape the
  // HTML delimiter too, for every value interpolated into generated code.
  const literal = (value: string | InlineCanvasBundle): string => JSON.stringify(value).replace(/</g, '\\u003c').replace(/\u2028/g, '\\u2028').replace(/\u2029/g, '\\u2029');
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
    value = value.replace(/\blocation\.search\b/g, () => literal(url.search));
    if (/(?:^|\/)canvas\.js$/.test(path)) {
      value = value.replace(/function loadFrame\(frame, item, present\)\s*\{/, "function loadFrame(frame, item, present) { if(item.kind==='page'){frame.removeAttribute('src');frame.srcdoc=window.__wfDocument(pageSrc(item));return;}");
      value = value.replace(/frame\.srcdoc\s*=\s*srcdoc\(item,\s*present\);/g, 'frame.srcdoc = window.__wfMarkup(srcdoc(item, present));');
    }
    return `<script>${safe(value)}</script>`;
  };
  // JSON data is escaped before becoming a script, including malicious </script> in a repo file.
  // Pass the shared tokenizer explicitly into serialized renderers; imported
  // module bindings are unavailable inside the opaque srcdoc document.
  const bootstrap = `(()=>{const bundle=${literal(bundle)};const render=${inlineCanvasDocument.toString()};const tags=${tags.toString()};window.__wfDocument=(target)=>render(bundle,new URL(target,${literal(url.href)}).href,${depth + 1},undefined,tags);window.__wfMarkup=(markup)=>render(bundle,${literal(url.href)},${depth + 1},markup,tags);})();`;
  // One pass over markup. Never scan inserted script strings as if they were
  // HTML; canvas engines themselves contain <link> and <img> templates.
  let html = source.replace(tags, tag => {
    const opening = tag.slice(0, tag.indexOf('>') + 1);
    const reference = /\b(?:src|href)\s*=\s*["']([^"']+)["']/i.exec(opening)?.[1];
    if (!reference) return tag;
    if (reference.startsWith('data:') || reference.startsWith('#')) return tag;
    if (/^<script/i.test(tag)) return script(pathOf(reference));
    if (/^<style/i.test(tag)) return tag;
    if (/^<link/i.test(tag)) return `<style>${css(pathOf(reference)).replace(/<\/style/gi, '<\\/style')}</style>`;
    if (/^<iframe/i.test(tag)) return tag.replace(/\bsrc\s*=\s*["'][^"']+["']/i, () => `srcdoc="${attr(inlineCanvasDocument(bundle, new URL(reference, url).href, depth + 1, undefined, tags))}"`);
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
    .replace(/\blocation\.href\b/g, () => literal(url.href))
    .replace(/\blocation\.replace\(/g, '__wfNavigate(');
  // A relative '#frame' passed to location.replace resolves against srcdoc's
  // embedder URL, loading the MCP app into itself. Keep replacements on this
  // actual about:srcdoc document; only metadata uses the logical repo URL.
  const navigation = `const __wfNavigate=(value)=>{const next=new URL(value,${literal(url.href)});location.replace(location.href.split('#')[0]+next.hash);};`;
  const bridge = `<script>${safe(`(()=>{${navigation}${bridged}})();`)}</script>`;
  const end = html.lastIndexOf('</body>');
  return end >= 0 ? html.slice(0, end) + bridge + html.slice(end) : html + bridge;
}
