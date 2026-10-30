import { canvasCatalog } from '../../../src/canvasCatalog';
import { canvasEntries, prototypeTicketNumber } from '../../../src/prototypeIdentity';
import type { CanvasCatalogPage } from '../../../src/types';

export type CanvasRef = { repo: string; ticket: number; mapNumber: number; branch: string; sha: string; board: string };
export type CanvasBlob = { path: string; sha: string; size: number };
export type CanvasPackage = CanvasRef & { title: string; question: string; notes: Record<string, string>; pages: CanvasCatalogPage[]; files: CanvasBlob[]; bytes: number; savedAt: number; directory: string };

export function safeAssetPath(path: string): boolean {
  return path.length > 0 && path.length < 2048 && !/[\\%?#:\u0000-\u001f]/.test(path)
    && path.split('/').every(part => part.length > 0 && part !== '.' && part !== '..')
    && /\.(?:html?|js|css|json|svg|png|jpe?g|webp|gif|ico|woff2?|ttf|otf)$/i.test(path);
}

export function prototypeBoards(ticket: number, files: readonly CanvasBlob[]): string[] {
  const paths = files.map(file => file.path).filter(safeAssetPath);
  return canvasEntries(paths, paths).filter(path => {
    const folder = /^prototypes\/(\d+)(?:-|\/)/.exec(path);
    return Number(folder?.[1]) === ticket;
  });
}

export function branchForTicket(branch: string, ticket: number): boolean {
  return prototypeTicketNumber(branch) === ticket;
}

export function relativeAsset(from: string, value: string): string | null {
  if (!value || /^(?:[a-z][a-z\d+.-]*:|\/\/|#|\/)/i.test(value)) return null;
  try {
    const base = new URL(from, 'https://canvas.invalid/');
    const result = new URL(value, base);
    if (result.origin !== base.origin) return null;
    const path = decodeURIComponent(result.pathname.slice(1));
    return safeAssetPath(path) ? path : null;
  } catch { return null; }
}

/** Find referenced repo assets without executing downloaded code. */
export function assetReferences(path: string, text: string): string[] {
  const values = [
    ...[...text.matchAll(/(?:src|href)\s*=\s*["']([^"']+)["']/gi)].map(match => match[1]),
    ...[...text.matchAll(/url\(\s*["']?([^)'"\s]+)["']?\s*\)/gi)].map(match => match[1]),
    ...[...text.matchAll(/["']((?:\.\.?\/)[^"'\s<>]+)["']/g)].map(match => match[1]),
  ];
  return [...new Set(values.flatMap(value => { const target = relativeAsset(path, value ?? ''); return target ? [target] : []; }))];
}

export function packagePages(config: string): CanvasCatalogPage[] {
  const pages = canvasCatalog(config).map(page => ({ ...page, items: page.items.filter(item => item.src !== null) }));
  if (!pages.some(page => page.items.length)) throw new Error('This canvas has no viewable options.');
  return pages.filter(page => page.items.length);
}

/** CSP applies to the document itself as well as the opaque-origin host iframe. */
export function isolatedCanvasHtml(html: string): string {
  const policy = "default-src 'none'; script-src 'unsafe-inline' file:; style-src 'unsafe-inline' file:; img-src file: data:; font-src file: data:; frame-src file:; connect-src 'none'; form-action 'none'; base-uri 'none'";
  const security = `<meta http-equiv="Content-Security-Policy" content="${policy}"><style>html{-webkit-text-size-adjust:100%;text-size-adjust:100%}</style>`;
  // Put the policy before every author-supplied element, including an existing CSP or base.
  return `<!doctype html><html><head>${security}</head><body>${html.replace(/<!doctype[^>]*>/gi, '')}</body></html>`;
}
