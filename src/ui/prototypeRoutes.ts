export const PROTOTYPE_STEPS = ['recent', 'browse', 'repository', 'map', 'help'] as const;

export type PrototypeStep = (typeof PROTOTYPE_STEPS)[number];

export function prototypeStepFromHash(hash: string): PrototypeStep {
  const candidate = hash.replace(/^#/, '');
  if (candidate === '' || candidate === 'home') return 'recent';
  return PROTOTYPE_STEPS.find((step) => step === candidate) ?? 'recent';
}

export function prototypeHash(step: PrototypeStep): string {
  return `#${step}`;
}
