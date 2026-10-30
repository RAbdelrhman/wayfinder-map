import { startInlineCanvas } from './inlineCanvas.js';

void startInlineCanvas().catch((error: unknown) => {
  document.body.textContent = error instanceof Error ? error.message : 'The canvas could not be loaded.';
});
