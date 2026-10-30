/** The SVG renderer has no filesystem dependencies and can be bundled into the ESM CLI. */
declare module 'qrcode/lib/browser.js' {
  export { toString } from 'qrcode';
}
