/*
  The prototype's one HTML injection boundary, like src/ui/trustedHtml.ts (and listed
  with it in .sourcery.yaml). Callers pass static markup or Kit.esc-escaped demo data;
  this does not sanitize HTML.
*/
window.setTrustedHtml = (el, html) => { el.innerHTML = html; };
