/**
 * Loading placeholders are the loaded page's own markup with its words swapped for bars, so
 * every box already has its loaded size. A bar holds a no-break space: it keeps the line
 * height of the text it stands in for, in inline and flex layouts alike.
 */
export function bone(width: string): string {
  return `<span class="wf-bone" style="--w: ${width}">&nbsp;</span>`;
}

/** A button-sized bar. */
export function boneButton(width = '112px'): string {
  return `<span class="wf-bone is-button" style="--w: ${width}"></span>`;
}
