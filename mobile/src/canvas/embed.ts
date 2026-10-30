import { relativeAsset } from './package';

export type CanvasAssets = Record<string, { text?: string; base64?: string; mime: string }>;
export const assetMime = (path: string): string => ({ html: 'text/html', htm: 'text/html', css: 'text/css', js: 'text/javascript',
  svg: 'image/svg+xml', png: 'image/png', jpg: 'image/jpeg', jpeg: 'image/jpeg', gif: 'image/gif', webp: 'image/webp',
  ico: 'image/x-icon', woff: 'font/woff', woff2: 'font/woff2', ttf: 'font/ttf', otf: 'font/otf' })[path.split('.').pop()?.toLowerCase() ?? ''] ?? 'application/octet-stream';

/** Makes repository resources self-contained so the WebView needs no filesystem or network access. */
export function embeddedCanvas(assets: CanvasAssets, board: string, src: string, theme: 'light' | 'dark'): string {
  const resolve = (from: string, value: string, depth: number): string | null => {
    const path = relativeAsset(from, value);
    const asset = path ? assets[path] : null;
    if (!asset || !path || depth > 5) return null;
    if (asset.mime === 'text/html') return document(path, new URL(value, 'https://canvas.invalid/').search, depth + 1);
    if (asset.mime === 'text/css' && asset.text !== undefined) return `data:text/css;charset=utf-8,${encodeURIComponent(css(path, asset.text, depth + 1))}`;
    return asset.base64 !== undefined ? `data:${asset.mime};base64,${asset.base64}`
      : `data:${asset.mime};charset=utf-8,${encodeURIComponent(asset.text ?? '')}`;
  };
  const css = (path: string, text: string, depth: number): string => text
    .replace(/url\(\s*(["']?)([^)'"\s]+)\1\s*\)/gi, (original: string, _quote: string, value: string) => {
      const target = resolve(path, value, depth); return target ? `url("${target}")` : original;
    }).replace(/@import\s+(["'])([^"']+)\1/g, (original: string, _quote: string, value: string) => {
      const target = resolve(path, value, depth); return target ? `@import url("${target}")` : original;
    });
  const script = (path: string, text: string, depth: number): string => text.replace(/(["'])([^"'\r\n]+\.(?:html?|css|svg|png|jpe?g|webp|gif)(?:[?#][^"'\r\n]*)?)\1/gi,
    (original: string, _quote: string, value: string) => { const target = resolve(path, value, depth); return target ? JSON.stringify(target) : original; });
  const document = (path: string, search: string, depth: number): string => {
    if (depth > 5 || assets[path]?.text === undefined) throw new Error('The canvas contains an unsupported nested option.');
    let html = assets[path].text;
    html = html.replace(/<script\b([^>]*?)\bsrc\s*=\s*(["'])([^"']+)\2([^>]*)>\s*<\/script\s*>/gi,
      (_original: string, before: string, _quote: string, value: string, after: string) => {
        const target = relativeAsset(path, value), code = target ? assets[target]?.text : undefined;
        if (!target || code === undefined) return '';
        return `<script${before}${after}>${script(target, code, depth).replace(/<\/script/gi, '<\\/script')}</script>`;
      });
    html = html.replace(/<link\b[^>]*\bhref\s*=\s*(["'])([^"']+)\1[^>]*>/gi,
      (original: string, _quote: string, value: string) => {
        const target = relativeAsset(path, value), content = target ? assets[target]?.text : undefined;
        return target && content !== undefined && /\.css$/i.test(target) ? `<style>${css(target, content, depth).replace(/<\/style/gi, '<\\/style')}</style>` : original;
      });
    html = html.replace(/\b(src|href)\s*=\s*(["'])([^"']+)\2/gi,
      (original: string, attribute: string, _quote: string, value: string) => {
        const target = resolve(path, value, depth); return target ? `${attribute}="${target.replace(/&/g, '&amp;').replace(/"/g, '&quot;')}"` : original;
      });
    const params = new URLSearchParams(search);
    params.set('theme', theme);
    // The query remains visible through location.search; its payload tail is an inert HTML comment.
    return `data:text/html;charset=utf-8,${encodeURIComponent(html + '<!--')}?${params.toString()}`;
  };
  const path = relativeAsset(board, src);
  if (!path) throw new Error('Invalid canvas option.');
  return document(path, new URL(src, 'https://canvas.invalid/').search, 0);
}
