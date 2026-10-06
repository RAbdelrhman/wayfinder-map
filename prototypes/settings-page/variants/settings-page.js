/* Safe design fixture. Controls change this page only; no application APIs run. */
Object.assign(Kit.icons, {
  compass: '<circle cx="12" cy="12" r="9"/><path d="m16 8-3 5-5 3 3-5Z"/>',
  home: '<path d="m3 10 9-7 9 7v10H3Z"/><path d="M9 20v-7h6v7"/>',
  plus: '<path d="M12 5v14M5 12h14"/>',
  repo: '<rect x="5" y="3" width="14" height="18" rx="2"/><path d="M9 3v18"/>',
  gear: '<circle cx="12" cy="12" r="4"/><path d="m9 3-1 3-3 1-2 3 2 3 1 3 3 2 3-1 3-1 3-3-1-3-1-3-3-2Z"/>',
  bell: '<path d="M5 17h14l-2-3V9a5 5 0 0 0-10 0v5ZM10 21h4"/>',
  check: '<path d="m5 12 4 4L19 6"/>',
  sun: '<circle cx="12" cy="12" r="4"/><path d="M12 2v2M12 20v2M2 12h2M20 12h2M5 5l1 1M18 18l1 1M5 19l1-1M18 6l1-1"/>',
  sliders: '<path d="M4 6h16M4 12h16M4 18h16"/><circle cx="8" cy="6" r="2"/><circle cx="16" cy="12" r="2"/><circle cx="10" cy="18" r="2"/>',
  person: '<circle cx="12" cy="7" r="4"/><path d="M4 21v-2a8 8 0 0 1 16 0v2"/>',
  activity: '<path d="M2 12h5l3-8 4 16 3-8h5"/>',
});
const single = new URLSearchParams(location.search).get('layout') === 'single';
document.body.classList.toggle('settings-demo-single', single);
const icon = (name) => Kit.icon(name);
const segmented = (label, values, active) => `<span class="segmented" role="group" aria-label="${label}">${values.map((value) => `<button type="button" class="seg${value === active ? ' is-on' : ''}" aria-pressed="${value === active}" data-demo-value="${value}">${value}</button>`).join('')}</span>`;
const row = (label, hint, control) => `<div class="settings-row"><span class="grow">${label}<span class="hint">${hint}</span></span>${control}</div>`;
const card = (body) => `<div class="settings-demo-card">${body}</div>`;
const model = (name) => `<div class="settings-demo-model"><select aria-label="${name} model"><option${name === 'Hard' ? ' selected' : ''}>GPT-5.6 Sol · Codex</option><option${name === 'Mid' ? ' selected' : ''}>Sonnet 5 · Claude</option><option${['Simple', 'Shadow', 'Rating'].includes(name) ? ' selected' : ''}>GPT-5.6 Luna · Codex</option></select><select aria-label="${name} reasoning effort"><option>High</option><option>Extra high</option><option>Medium</option></select></div>`;
const notification = (label, hint, on = true) => `<label class="settings-row settings-notification"><span class="grow">${label}<span class="hint">${hint}</span></span><input type="checkbox" aria-label="${label}"${on ? ' checked' : ''} /></label>`;
const sections = [
  { id: 'appearance', title: 'Appearance', icon: 'sun', hint: 'Choose how Wayfinder looks.', body: card(row('Theme', 'Use a light or dark appearance throughout the app.', segmented('Theme', ['Light', 'Dark'], document.documentElement.dataset.theme === 'dark' ? 'Dark' : 'Light'))) },
  { id: 'tasks', title: 'Tasks & models', icon: 'sliders', hint: 'Set the defaults for new tickets and maps. You can override them on a ticket.', body: card('<h3>Task defaults</h3>' + row('Default task tier', 'New tickets and maps start with this tier.', segmented('Default task tier', ['Simple', 'Mid', 'Hard'], 'Mid')) + row('Hand-offs at once', 'Start next queues tickets when this many are running.', segmented('Hand-offs at once', ['2', '4', '6', '8'], '4'))) + card('<h3>Models by tier</h3>' + row('Simple', 'Small, well-defined changes.', model('Simple')) + row('Mid', 'Everyday implementation and research.', model('Mid')) + row('Hard', 'Complex changes that need deeper reasoning.', model('Hard'))) + card('<h3>Automatic task rating</h3>' + row('Auto rates tickets', 'Use Wayfinder\'s rules, or ask a model to rate each ticket.', segmented('Auto rates tickets', ['Logic only', 'A model'], 'Logic only')) + '<div data-rating-picker hidden>' + row('Rating model', 'Falls back to the rules if the model cannot rate the ticket.', model('Rating')) + '</div><details class="settings-demo-advanced"><summary>Advanced · Calibration</summary>' + row('Compare model ratings', 'Run an extra model rating and keep both results locally for 30 days. This does not change the selected tier.', segmented('Calibration', ['Off', 'On'], 'Off')) + '<div data-shadow-picker hidden>' + row('Shadow model', 'The extra rating uses this model.', model('Shadow')) + '</div></details>') },
  { id: 'notifications', title: 'Notifications', icon: 'bell', hint: 'Choose which updates need your attention.', body: card(notification('Tickets become ready', 'A ticket is unblocked and ready to start.') + notification('T3 Code needs you', 'A thread is waiting for input or approval.') + notification('CI is failing', 'A ticket PR has failing checks.') + notification('A PR is ready for review', 'Checks passed and the PR is waiting for review.') + notification('A hand-off has an error', 'T3 Code reported an error or a usage limit.') + notification('A ticket stalled', 'A ticket passed one of your stall thresholds.', false) + notification('A prototype is ready', 'A prototype branch or snapshot changed.')) },
  { id: 'progress', title: 'Progress', icon: 'activity', hint: 'Set your daily goal and decide when a ticket counts as stalled.', body: card(row('Daily goal', 'Tickets to clear each day on Home.', segmented('Daily goal', ['3', '5', '8'], '5'))) + card('<h3>Stalled tickets</h3>' + row('Untouched claim', 'Claimed, with no commit, PR, comment or live hand-off.', segmented('Untouched claim, in days', ['3d', '7d', '14d', '30d'], '7d')) + row('Dead hand-off', 'Failed or never started, with no retry or PR.', segmented('Dead hand-off, in days', ['3d', '7d', '14d', '30d'], '3d'))) },
  { id: 'account', title: 'Account', icon: 'person', hint: 'Manage the GitHub account Wayfinder uses.', body: card('<div class="settings-demo-account"><span class="settings-demo-avatar" aria-hidden="true">D</span><span class="grow"><strong>demo-user</strong><p class="hint">Signed in to github.com through GitHub CLI</p></span><button class="ghost" type="button" data-to="Sign out of GitHub">Sign out</button></div>' + row('Switch account', 'Use another account already signed in through GitHub CLI.', '<button class="ghost" type="button" data-to="Switch to demo-work">demo-work</button>')) },
];
const categories = document.getElementById('settings-categories');
const content = document.getElementById('settings-sections');
// Only fixed section definitions and static icons enter this demo markup; the layout query is a boolean.
// nosemgrep: javascript.browser.security.insecure-document-method, javascript.browser.security.insecure-innerhtml
categories.innerHTML = sections.map((section) => `<a href="#${section.id}" data-category="${section.id}">${icon(section.icon)}${section.title}</a>`).join('');
// Every title, hint and body comes from the fixed demo definitions above, with no API or user text.
// nosemgrep: javascript.browser.security.insecure-document-method, javascript.browser.security.insecure-innerhtml
content.innerHTML = sections.map((section) => `<section class="settings-demo-category" id="${section.id}" aria-labelledby="${section.id}-title"><header class="settings-demo-category-heading"><h2 id="${section.id}-title">${section.title}</h2><p>${section.hint}</p></header>${section.body}</section>`).join('');
function selectCategory(id) {
  for (const section of content.children) section.hidden = !single && section.id !== id;
  for (const link of categories.children) {
    if (link.dataset.category === id) link.setAttribute('aria-current', 'location');
    else link.removeAttribute('aria-current');
  }
}
selectCategory(single ? 'appearance' : 'tasks');
categories.addEventListener('click', (event) => {
  const link = event.target.closest('[data-category]');
  if (!link) return;
  if (!single) event.preventDefault();
  selectCategory(link.dataset.category);
});
content.addEventListener('click', (event) => {
  const button = event.target.closest('[data-demo-value]');
  if (!button) return;
  const group = button.closest('[role="group"]');
  for (const sibling of group.children) {
    sibling.classList.toggle('is-on', sibling === button);
    sibling.setAttribute('aria-pressed', String(sibling === button));
  }
  if (group.getAttribute('aria-label') === 'Theme') document.documentElement.dataset.theme = button.dataset.demoValue.toLowerCase();
  if (group.getAttribute('aria-label') === 'Auto rates tickets') document.querySelector('[data-rating-picker]').hidden = button.dataset.demoValue !== 'A model';
  if (group.getAttribute('aria-label') === 'Calibration') document.querySelector('[data-shadow-picker]').hidden = button.dataset.demoValue !== 'On';
  Kit.toast('Changed in this preview only');
});
content.addEventListener('change', () => Kit.toast('Changed in this preview only'));
Kit.fillIcons();
