export const POSTER_VIEWPORT: { width: number; height: number };
export function canvasDirectory(root: string, directory: string): Promise<string>;
export function checkPoster(directory: string): Promise<string>;
export function capturePoster(root: string, directory: string): Promise<string>;
