export const PROTOTYPE_STEPS = ['recent', 'browse', 'repository', 'map', 'create', 'desktop', 'help'] as const;

export type PrototypeStep = (typeof PROTOTYPE_STEPS)[number];

export const DESKTOP_STATES = ['menu', 'loading', 'restored', 'missing-gh', 'signed-out', 'error', 'quit-confirm', 'stopped'] as const;

export type DesktopState = (typeof DESKTOP_STATES)[number];

export function prototypeStepFromHash(hash: string): PrototypeStep {
  const candidate = hash.replace(/^#/, '');
  if (candidate === '' || candidate === 'home') return 'recent';
  const step = candidate.split('/')[0] ?? '';
  return PROTOTYPE_STEPS.find((knownStep) => knownStep === step) ?? 'recent';
}

export function prototypeHash(step: PrototypeStep): string {
  return `#${step}`;
}

export function createMapPrompt(repository: string, goal: string): string {
  return `Repository: ${repository}\n\nWhat I want to accomplish:\n${goal.trim()}`;
}

export function desktopStateFromHash(hash: string): DesktopState {
  const [, state = 'menu'] = hash.replace(/^#/, '').split('/');
  return DESKTOP_STATES.find((knownState) => knownState === state) ?? 'menu';
}

export function desktopHash(state: DesktopState): string {
  return `#desktop/${state}`;
}
