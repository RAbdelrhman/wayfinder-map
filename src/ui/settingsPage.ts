import { bindAccountMark, bindUpdater } from './chrome.js';
import { mountNavigation } from './navigation.js';
import { mountSettingsPage } from './settings.js';
import { syncServerSettings } from './settingsSync.js';

function need(id: string): HTMLElement {
  const element = document.getElementById(id);
  if (element === null) throw new Error(`Missing #${id}`);
  return element;
}

let toastTimer: ReturnType<typeof setTimeout> | undefined;
function toast(message: string, ms = 5000): void {
  const element = need('toast');
  element.textContent = message;
  element.hidden = false;
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => { element.hidden = true; }, ms);
}

mountNavigation({ shell: need('app'), sidebar: need('sidebar-shell'), topbar: need('nav-topbar'), topbarRoot: need('topbar'), page: 'settings', repo: null, mapNumber: null, view: 'map' });
bindAccountMark(document.getElementById('account-mark'));
bindUpdater(need('updater'), toast);
const refreshLocal = mountSettingsPage(need('main'), toast);
void syncServerSettings().then(refreshLocal);
