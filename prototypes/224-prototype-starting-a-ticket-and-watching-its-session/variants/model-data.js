/*
  Round 2 (#224): the model catalog RAMON-PC relays to the phone, in the shape src/models.ts gives the desktop
  picker (toCatalog: enabled and installed providers, hidden models dropped, `ready` false when T3 Code reports
  the provider erroring or signed out), plus Settings → Tasks' tier defaults (tierModels). Made-up values.
*/
(() => {
  const effort = (id, label, options, defaultValue) => ({ id, label, options: options.map(([oid, olabel]) => ({ id: oid, label: olabel })), defaultValue });
  const reasoning = (d) => effort('reasoningEffort', 'Reasoning', [['low', 'Low'], ['medium', 'Medium'], ['high', 'High'], ['xhigh', 'Extra high']], d);
  const claude = (d) => effort('effort', 'Effort', [['low', 'Low'], ['medium', 'Medium'], ['high', 'High'], ['max', 'Max']], d);

  const providers = [
    {
      instanceId: 'codex', name: 'Codex', ready: true,
      models: [
        { slug: 'gpt-6.1-sol', name: 'GPT‑6.1 Sol', isDefault: true, effort: reasoning('high') },
        { slug: 'gpt-6.1', name: 'GPT‑6.1', isDefault: false, effort: reasoning('medium') },
      ],
    },
    {
      instanceId: 'claudeAgent', name: 'Claude', ready: true,
      models: [
        { slug: 'claude-opus-5-5', name: 'Claude Opus 5.5', isDefault: true, effort: claude('high') },
        { slug: 'claude-sonnet-5-5', name: 'Claude Sonnet 5.5', isDefault: false, effort: claude('medium') },
        { slug: 'claude-fable-5-1', name: 'Claude Fable 5.1', isDefault: false, effort: claude('medium') },
      ],
    },
    { instanceId: 'grok', name: 'Grok', ready: false, why: 'Signed out in T3 Code', models: [{ slug: 'grok-5', name: 'Grok 5', isDefault: true, effort: null }] },
  ];

  window.MODELS = {
    asOf: '10:14',
    providers,
    // Settings → Tasks on RAMON-PC: the model each tier runs on.
    tiers: {
      simple: { instanceId: 'claudeAgent', model: 'claude-sonnet-5-5', effort: 'medium' },
      mid: { instanceId: 'codex', model: 'gpt-6.1-sol', effort: 'high' },
      hard: { instanceId: 'claudeAgent', model: 'claude-opus-5-5', effort: 'high' },
    },
    // The same tier hints as src/ui/models.ts.
    tierLabel: { simple: 'Simple', mid: 'Mid', hard: 'Hard' },
    tierHint: { simple: 'Small, well-scoped changes', mid: 'Most tickets', hard: 'Research, design, gnarly bugs' },
    // By 10:41 GPT-6.1 was hidden in T3 Code's picker, so RAMON-PC no longer offers it.
    droppedAtReconnect: { instanceId: 'codex', model: 'gpt-6.1' },
  };
})();
