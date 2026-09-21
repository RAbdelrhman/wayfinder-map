/*
  Starter canvas. Replace everything here with the options for your decision.
  Docs: README.md next to this file. Check it with: node tools/check.mjs
*/
window.CANVAS = {
  title: 'Design canvas',
  question: 'Which direction should we take? Replace this with the decision in one sentence.',
  sampleState: 'Placeholder content.',

  // Named looks. `styles: [...]` on one item shows it once per style, side by side.
  styles: {
    calm: {
      label: 'Calm',
      vars: { '--accent': '#2f6f5e', '--radius': '10px' },
      dark: { '--accent': '#6fc2a9' },
    },
    bold: {
      label: 'Bold',
      vars: { '--accent': '#d9480f', '--radius': '2px' },
      dark: { '--accent': '#ff8a4c' },
      font: "'Segoe UI Black', 'Arial Black', system-ui, sans-serif",
    },
  },

  pages: [
    {
      title: 'Directions',
      sections: [
        {
          title: 'Pages',
          note: 'Full pages you can click through. Each is an HTML file in variants/.',
          items: [
            {
              id: 'A',
              name: 'Calm',
              src: 'variants/example.html',
              style: 'calm',
              note: { idea: 'Quiet and roomy.', pros: ['Easy to scan'], cons: ['Less personality'] },
            },
            {
              id: 'B',
              name: 'Bold',
              src: 'variants/example.html',
              style: 'bold',
              note: { idea: 'Loud and confident.', pros: ['Memorable'], cons: ['Tiring on dense screens'] },
            },
          ],
        },
      ],
    },
    {
      title: 'Look',
      sections: [
        {
          title: 'Components',
          items: [
            {
              id: 'K',
              name: 'Buttons and a card',
              kind: 'components',
              styles: ['calm', 'bold'],
              items: [
                {
                  label: 'Buttons',
                  html: `<button style="padding:8px 14px;border:0;border-radius:var(--radius);background:var(--accent);color:#fff;font:inherit">Continue</button>
                    <button style="padding:8px 14px;border:1px solid var(--cv-line);border-radius:var(--radius);background:none;color:var(--cv-text);font:inherit">Cancel</button>`,
                },
                {
                  label: 'Card',
                  html: `<div style="padding:16px;border-radius:var(--radius);border-top:3px solid var(--accent)"><b>Title</b><p style="margin:4px 0 0;color:var(--cv-muted)">A short line of body copy.</p></div>`,
                },
              ],
              note: 'The same markup under each style.',
            },
          ],
        },
        {
          title: 'Palette, type and a moodboard',
          items: [
            {
              id: 'P',
              name: 'Palette',
              kind: 'swatches',
              colors: [
                { name: 'Ink', value: '#1b1b1a' },
                { name: 'Paper', value: '#f7f5f0' },
                { name: 'Accent', value: '#2f6f5e' },
                { name: 'Signal', value: '#d9480f' },
              ],
              note: 'Or set style: "calm" to read a style\'s colour tokens.',
            },
            {
              id: 'T',
              name: 'Type',
              kind: 'type',
              font: "Georgia, 'Times New Roman', serif",
              note: 'A serif headline voice.',
            },
            {
              id: 'M',
              name: 'Moodboard',
              kind: 'compose',
              width: 900,
              height: 520,
              layers: [
                { type: 'rect', x: 40, y: 40, w: 380, h: 440, fill: '#2f6f5e', radius: 14 },
                { type: 'rect', x: 460, y: 40, w: 400, h: 200, fill: '#d9480f', radius: 14, rotate: -2 },
                { type: 'text', x: 70, y: 380, w: 330, text: 'Calm, but not quiet', size: 34, weight: 700, color: '#fff' },
                { type: 'text', x: 460, y: 280, w: 400, text: 'Layer images, shapes, text and HTML. Later layers sit on top.', size: 18 },
                { type: 'html', x: 460, y: 400, html: '<button style="padding:10px 16px;border:0;border-radius:999px;background:#1b1b1a;color:#fff">A real button</button>' },
              ],
              note: 'Compositions: screenshots, shapes, text and real markup on an artboard.',
            },
          ],
        },
      ],
    },
  ],
};
