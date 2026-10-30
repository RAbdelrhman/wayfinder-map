import { describe, expect, it } from 'vitest';
import { embeddedCanvas } from './embed';

describe('self-contained sandbox documents', () => {
  it('inlines CSS, scripts and images while retaining each option query', () => {
    const source = embeddedCanvas({
      'prototypes/1/index.html': { mime: 'text/html', text: '<link href="style.css" rel="stylesheet"><img src="photo.png"><script src="app.js"></script>' },
      'prototypes/1/style.css': { mime: 'text/css', text: 'body{background:url(photo.png)}' },
      'prototypes/1/app.js': { mime: 'text/javascript', text: 'document.body.dataset.ready=location.search;' },
      'prototypes/1/photo.png': { mime: 'image/png', base64: 'YWJj' },
    }, 'prototypes/1/board.html', 'index.html?state=confirm', 'dark');
    expect(source).toMatch(/\?state=confirm&theme=dark$/);
    const payload = decodeURIComponent(source.slice(source.indexOf(',') + 1).split('?state=confirm')[0] ?? '');
    expect(payload).toContain('data:image/png;base64,YWJj');
    expect(payload).toContain('<style>body{');
    expect(payload).toContain('document.body.dataset.ready=location.search;');
    expect(payload).not.toContain('<script src=');
    expect(payload).not.toContain('<link');
  });
});
