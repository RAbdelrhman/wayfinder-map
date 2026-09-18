import { describe, expect, it } from 'vitest';

import { parseModelChoice, toCatalog, toModelSelection } from './models.js';

const select = (id: string, values: string[], fallback: string) => ({
  id,
  label: 'Reasoning',
  type: 'select',
  options: values.map((value) => ({ id: value, label: value.toUpperCase(), ...(value === fallback ? { isDefault: true } : {}) })),
});

describe('toCatalog', () => {
  const catalog = toCatalog([
    {
      instanceId: 'codex',
      displayName: 'Codex',
      enabled: true,
      installed: true,
      status: 'ready',
      models: [
        {
          slug: 'gpt-5.6-sol',
          name: 'GPT-5.6-Sol',
          isDefault: true,
          capabilities: { optionDescriptors: [select('reasoningEffort', ['low', 'high'], 'low'), select('serviceTier', ['default'], 'default')] },
        },
      ],
    },
    {
      instanceId: 'claudeAgent',
      displayName: 'Claude',
      enabled: true,
      installed: true,
      status: 'ready',
      models: [
        { slug: 'claude-opus-5', name: 'Claude Opus 5', capabilities: { optionDescriptors: [select('effort', ['medium', 'high'], 'high')] } },
        { slug: 'hidden-one', hidden: true },
      ],
    },
    {
      instanceId: 'opencode',
      displayName: 'OpenCode',
      enabled: true,
      installed: true,
      status: 'error',
      models: [{ slug: 'opencode/big-pickle', name: 'Big Pickle', capabilities: { optionDescriptors: [select('variant', ['low'], 'low')] } }],
    },
    { instanceId: 'grok', displayName: 'Grok', enabled: true, installed: true, status: 'ready', models: [{ slug: 'grok-build', name: 'Grok Build' }] },
    { instanceId: 'cursor', displayName: 'Cursor', enabled: false, installed: false, status: 'disabled', models: [] },
  ]);

  it('keeps enabled, installed providers with at least one visible model', () => {
    expect(catalog.providers.map((provider) => provider.instanceId)).toEqual(['codex', 'claudeAgent', 'opencode', 'grok']);
    expect(catalog.providers[1]?.models.map((model) => model.slug)).toEqual(['claude-opus-5']);
  });

  it('finds the reasoning knob whatever the provider calls it', () => {
    expect(catalog.providers[0]?.models[0]?.effort).toEqual({
      id: 'reasoningEffort',
      label: 'Reasoning',
      options: [
        { id: 'low', label: 'LOW' },
        { id: 'high', label: 'HIGH' },
      ],
      defaultValue: 'low',
    });
    expect(catalog.providers[1]?.models[0]?.effort?.id).toBe('effort');
    expect(catalog.providers[2]?.models[0]?.effort?.id).toBe('variant');
    expect(catalog.providers[3]?.models[0]?.effort).toBeNull();
  });

  it('marks a provider that is not ready', () => {
    expect(catalog.providers.map((provider) => provider.ready)).toEqual([true, true, false, true]);
  });
});

describe('toModelSelection', () => {
  it('carries the effort as a T3 Code option', () => {
    expect(toModelSelection({ instanceId: 'codex', model: 'gpt-5.6-sol', effort: { id: 'reasoningEffort', value: 'xhigh' } })).toEqual({
      instanceId: 'codex',
      model: 'gpt-5.6-sol',
      options: [{ id: 'reasoningEffort', value: 'xhigh' }],
    });
  });

  it('leaves options out when no effort was picked', () => {
    expect(toModelSelection({ instanceId: 'grok', model: 'grok-build' })).toEqual({ instanceId: 'grok', model: 'grok-build' });
  });
});

describe('parseModelChoice', () => {
  it('accepts a well-formed choice', () => {
    expect(parseModelChoice({ instanceId: 'codex', model: 'm', effort: { id: 'effort', value: 'high' } })).toEqual({
      instanceId: 'codex',
      model: 'm',
      effort: { id: 'effort', value: 'high' },
    });
  });

  it('treats anything else as no choice', () => {
    expect(parseModelChoice(null)).toBeNull();
    expect(parseModelChoice({ instanceId: 'codex' })).toBeNull();
    expect(parseModelChoice({ instanceId: '', model: 'm' })).toBeNull();
  });
});
