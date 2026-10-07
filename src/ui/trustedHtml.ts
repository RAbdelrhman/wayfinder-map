// Callers must supply static markup or escapeHtml-escaped values and validated URLs.
// These wrappers do not sanitize HTML.
export function setTrustedHtml(el: Pick<Element, 'innerHTML'>, html: string): void {
  el.innerHTML = html;
}

export function insertTrustedHtml(el: Pick<Element, 'insertAdjacentHTML'>, position: InsertPosition, html: string): void {
  el.insertAdjacentHTML(position, html);
}
