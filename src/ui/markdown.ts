export function escapeHtml(value: string): string {
  return value.replace(/[&<>"']/g, (char) => {
    switch (char) {
      case '&':
        return '&amp;';
      case '<':
        return '&lt;';
      case '>':
        return '&gt;';
      case '"':
        return '&quot;';
      default:
        return '&#39;';
    }
  });
}

/** Bold, links and code spans. Code spans are cut out first so nothing inside them is touched. */
function inline(text: string): string {
  return text
    .split(/(`[^`]+`)/)
    .map((part, index) => {
      if (index % 2 === 1) return `<code>${escapeHtml(part.slice(1, -1))}</code>`;
      return escapeHtml(part)
        .replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>')
        .replace(/\[([^\]]+)\]\((https?:\/\/[^)\s]+)\)/g, '<a href="$2" target="_blank" rel="noreferrer">$1</a>');
    })
    .join('');
}

const BULLET = /^\s*[-*+]\s+(?:\[( |x|X)\]\s+)?(.*)$/;
const NUMBERED = /^\s*\d+[.)]\s+(.*)$/;
const HEADING = /^#{1,6}\s+(.*)$/;

/**
 * The slice of GitHub markdown that map and issue bodies actually use: paragraphs, headings,
 * bullet, task and numbered lists, fenced code, bold, links and code spans. Everything is
 * escaped, so an issue body can never inject markup.
 */
export function renderMarkdown(text: string): string {
  const out: string[] = [];
  let paragraph: string[] = [];
  // Cast so TS does not narrow to null: only the closures below reassign it.
  let list = null as { tag: 'ul' | 'ol'; items: string[] } | null;
  let fence: string[] | null = null;

  const flush = (): void => {
    if (paragraph.length > 0) out.push(`<p>${inline(paragraph.join(' '))}</p>`);
    paragraph = [];
    if (list !== null) out.push(`<${list.tag}>${list.items.map((item) => `<li>${item}</li>`).join('')}</${list.tag}>`);
    list = null;
  };

  const addItem = (tag: 'ul' | 'ol', html: string): void => {
    if (paragraph.length > 0 || (list !== null && list.tag !== tag)) flush();
    list ??= { tag, items: [] };
    list.items.push(html);
  };

  for (const line of text.replace(/\r\n?/g, '\n').split('\n')) {
    if (fence !== null) {
      if (line.trimStart().startsWith('```')) {
        out.push(`<pre><code>${escapeHtml(fence.join('\n'))}</code></pre>`);
        fence = null;
      } else fence.push(line);
      continue;
    }
    if (line.trimStart().startsWith('```')) {
      flush();
      fence = [];
      continue;
    }
    if (line.trim().length === 0) {
      flush();
      continue;
    }

    const heading = HEADING.exec(line);
    const bullet = BULLET.exec(line);
    const numbered = NUMBERED.exec(line);
    if (heading !== null) {
      flush();
      out.push(`<h4>${inline(heading[1] ?? '')}</h4>`);
    } else if (bullet !== null) {
      const box = bullet[1] === undefined ? '' : bullet[1] === ' ' ? '☐ ' : '☑ ';
      addItem('ul', box + inline(bullet[2] ?? ''));
    } else if (numbered !== null) {
      addItem('ol', inline(numbered[1] ?? ''));
    } else if (list !== null && /^\s+/.test(line)) {
      list.items[list.items.length - 1] += ` ${inline(line.trim())}`;
    } else {
      if (list !== null) flush();
      paragraph.push(line.trim());
    }
  }
  if (fence !== null) out.push(`<pre><code>${escapeHtml(fence.join('\n'))}</code></pre>`);
  flush();
  return out.join('');
}

/** How many list items a section holds, for the count on its tab. */
export function listItemCount(text: string): number {
  return text.split('\n').filter((line) => BULLET.test(line) || NUMBERED.test(line)).length;
}
