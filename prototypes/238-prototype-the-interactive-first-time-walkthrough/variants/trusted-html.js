/*
  The prototype's one HTML boundary, like src/ui/trustedHtml.ts (and listed with it in
  .sourcery.yaml). Callers pass static markup or Kit.esc-escaped demo data; this does
  not sanitize HTML. DOMParser builds the nodes without running scripts.
*/
window.setTrustedHtml = (el, html) => {
  const parsed = new DOMParser().parseFromString(`<body>${html}</body>`, 'text/html');
  el.replaceChildren(...parsed.body.childNodes);
};
