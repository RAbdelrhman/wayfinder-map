/*
  PROTOTYPE (#316): what the avatar on #223's Maps screen opens, and how you sign out.
  ?acct=A|B|C|D picks the option. ?open=menu|confirm|out opens it at that step
  (out = just signed out, back on the welcome screen). Every tap is fake.
    A  Account sheet; sign out is confirmed inside the sheet.
    B  Menu under the avatar; sign out is confirmed in an alert.
    C  Account screen; sign out happens at once, and the welcome screen says how to revoke on GitHub.
    D  Settings screen with Account on top; sign out is confirmed in an action sheet.
*/
(() => {
  const params = new URLSearchParams(location.search);
  const OPT = ['A', 'B', 'C', 'D'].includes(params.get('acct')) ? params.get('acct') : null;
  if (!OPT) return;
  const D = window.MOBILE;
  const u = D.user;
  const esc = Kit.esc;
  const ic = (name) => Kit.icon(name);
  Kit.icons.signout = '<path d="M9 21H5a1 1 0 0 1-1-1V4a1 1 0 0 1 1-1h4"/><path d="M16 17l5-5-5-5"/><path d="M21 12H9"/>';

  const startOpen = params.get('open');
  const st = {
    open: OPT === 'C' || OPT === 'D' ? (startOpen === 'confirm' ? 'confirm' : null) : ['menu', 'confirm'].includes(startOpen) ? startOpen : null,
    signedOut: startOpen === 'out',
  };
  const REVOKE = 'github.com/settings/applications';
  const page = OPT === 'C' ? 'account' : OPT === 'D' ? 'settings' : null;

  const face = (size) => `<span class="avatar ac-face" style="width:${size}px;height:${size}px;font-size:${Math.round(size * 0.42)}px" aria-hidden="true">${esc(u.initial)}</span>`;
  const who = () => `<span class="ac-who"><span class="ac-name">${esc(u.name)}</span><span class="ac-login">@${esc(u.login)}</span></span>`;
  const revokeLink = () => `<button class="ac-inline" data-toast="Would open ${REVOKE}">${REVOKE}</button>`;

  function avatar() {
    const popup = OPT === 'B' ? 'menu' : OPT === 'A' ? 'dialog' : null;
    const expanded = popup ? ` aria-haspopup="${popup}" aria-expanded="${st.open !== null}"` : '';
    return `<button class="m-icon-btn ac-avatar" data-act="acct-open"${expanded} aria-label="Account, signed in as ${esc(u.login)}">${face(30)}</button>`;
  }

  /* ---------- A: account sheet ---------- */
  function sheetA() {
    const body =
      st.open === 'confirm'
        ? `<div class="ac-confirm"><h2 class="m-sheet-title" id="ac-title">Sign out of @${esc(u.login)}?</h2>
            <p class="ac-copy">You’ll need a new code from GitHub to sign back in.</p>
            <button class="m-btn ac-danger-fill" data-act="acct-signout">${ic('signout')}Sign out</button>
            <button class="m-btn is-quiet" data-act="acct-menu" data-focus>Cancel</button></div>`
        : `<div class="ac-profile">${face(64)}<h2 class="ac-name-lg" id="ac-title">${esc(u.name)}</h2><span class="ac-login">@${esc(u.login)}</span>
            <span class="ac-fine">Signed in with GitHub on this phone</span></div>
           <div class="m-group"><button class="m-row" data-toast="Would open github.com/${esc(u.login)}" data-focus>${ic('github')}<span class="m-row-main"><span class="m-row-title">Open profile on GitHub</span></span>${ic('external')}</button></div>
           <button class="m-btn is-quiet ac-danger" data-act="acct-confirm">${ic('signout')}Sign out</button>`;
    return `<div class="ac-layer"><div class="m-scrim" data-act="acct-close"></div>
      <section class="m-sheet ac-sheet" role="dialog" aria-modal="true" aria-labelledby="ac-title">
        <button class="m-grab" data-act="acct-close" aria-label="Close"></button><div class="ac-sheet-body">${body}</div></section></div>`;
  }

  /* ---------- B: menu, then alert ---------- */
  function menuB() {
    if (st.open === 'confirm')
      return `<div class="ac-layer"><div class="m-scrim"></div>
        <section class="ac-alert" role="alertdialog" aria-modal="true" aria-labelledby="ac-title" aria-describedby="ac-desc">
          <h2 id="ac-title">Sign out?</h2><p id="ac-desc">Wayfinder will forget @${esc(u.login)}’s GitHub sign-in on this phone.</p>
          <div class="ac-alert-actions"><button data-act="acct-close" data-focus>Cancel</button><button class="ac-danger" data-act="acct-signout">Sign out</button></div></section></div>`;
    return `<div class="ac-layer"><div class="ac-clear" data-act="acct-close"></div>
      <div class="ac-menu" role="menu" aria-label="Account">
        <div class="ac-menu-head" role="presentation">${face(36)}${who()}</div>
        <button role="menuitem" data-toast="Would open github.com/${esc(u.login)}" data-focus>${ic('github')}<span>Open profile on GitHub</span></button>
        <button role="menuitem" class="ac-danger" data-act="acct-confirm">${ic('signout')}<span>Sign out</span></button></div></div>`;
  }

  /* ---------- C: account screen ---------- */
  function accountScreen({ status, bar, backBtn }) {
    return `${status()}${bar('Account', backBtn('Maps'))}<div class="m-scroll">
      <div class="ac-profile is-page">${face(72)}<h2 class="ac-name-lg">${esc(u.name)}</h2><span class="ac-login">@${esc(u.login)}</span></div>
      <div class="m-section-title">GitHub</div>
      <div class="m-group">
        <div class="m-row">${ic('check')}<span class="m-row-main"><span class="m-row-title">Signed in</span><span class="m-row-sub">With a device code · since ${esc(u.since)}</span></span></div>
        <button class="m-row" data-toast="Would open github.com/${esc(u.login)}">${ic('github')}<span class="m-row-main"><span class="m-row-title">Open profile on GitHub</span></span>${ic('external')}</button>
      </div>
      <div class="m-section-title">This phone</div>
      <div class="m-group"><button class="m-row ac-danger" data-act="acct-signout">${ic('signout')}<span class="m-row-main"><span class="m-row-title">Sign out</span><span class="m-row-sub">Forgets your GitHub sign-in on this phone</span></span></button></div>
    </div>`;
  }

  /* ---------- D: settings screen, then action sheet ---------- */
  function settingsScreen({ status, bar, backBtn }) {
    return `${status()}${bar('Settings', backBtn('Maps'))}<div class="m-scroll">
      <div class="m-section-title">Account</div>
      <div class="m-group">
        <div class="m-row ac-row-who">${face(40)}${who()}</div>
        <button class="m-row ac-danger" data-act="acct-confirm">${ic('signout')}<span class="m-row-main"><span class="m-row-title">Sign out</span></span></button>
      </div>
      <p class="m-fine ac-left">Signing out only forgets the sign-in on this phone. To remove Wayfinder’s access, revoke it at ${revokeLink()}.</p>
      <div class="m-section-title">Notifications</div>
      <div class="ac-slot">Designed in #225. Shown here only to place the section.</div>
      <div class="m-section-title">Desktop</div>
      <div class="ac-slot">Pairing is designed in #224. Shown here only to place the section.</div>
    </div>`;
  }
  function actionSheetD() {
    if (st.open !== 'confirm') return '';
    return `<div class="ac-layer"><div class="m-scrim" data-act="acct-close"></div>
      <section class="ac-action" role="dialog" aria-modal="true" aria-labelledby="ac-title">
        <div class="ac-action-group"><p class="ac-action-cap" id="ac-title">Sign out of @${esc(u.login)}? You’ll need a new code from GitHub to sign back in.</p>
          <button class="ac-danger" data-act="acct-signout">Sign out</button></div>
        <div class="ac-action-group"><button class="ac-action-cancel" data-act="acct-close" data-focus>Cancel</button></div></section></div>`;
  }

  function overlay() {
    if (OPT === 'A') return st.open ? sheetA() : '';
    if (OPT === 'B') return st.open ? menuB() : '';
    if (OPT === 'D') return actionSheetD();
    return '';
  }

  function signedOutNotice() {
    if (!st.signedOut) return '';
    const more = OPT === 'C' ? `<span class="ac-notice-more">GitHub still lists Wayfinder as authorized. Revoke it at ${revokeLink()}.</span>` : '';
    return `<div class="ac-notice" role="status">${ic('check')}<span><b>Signed out of @${esc(u.login)}.</b>${more}</span></div>`;
  }

  const app = () => document.getElementById('app');
  const focusIn = () => (app().querySelector('.ac-layer [data-focus]') ?? app().querySelector('.ac-layer button'))?.focus();
  const focusOpener = () => app().querySelector(OPT === 'D' ? '[data-act="acct-confirm"]' : '.ac-avatar')?.focus();

  function handle(act, el, { render, go, back, stack, ui }) {
    const here = stack[stack.length - 1];
    switch (act) {
      case 'acct-open':
        if (page) { go(page); return true; }
        st.open = 'menu'; render(); focusIn(); return true;
      case 'acct-menu': st.open = 'menu'; render(); focusIn(); return true;
      case 'acct-confirm': st.open = 'confirm'; render(); focusIn(); return true;
      case 'acct-close': st.open = null; render(); focusOpener(); return true;
      case 'acct-signout':
        st.open = null; st.signedOut = true; ui.signin = 0;
        stack.length = 0; stack.push({ screen: 'signin', ticket: 223, repo: D.repos[0].name });
        render(); app().querySelector('.ac-notice')?.setAttribute('tabindex', '-1'); app().querySelector('.ac-notice')?.focus(); return true;
      case 'signin-next': st.signedOut = false; return false;
      case 'back':
        if (stack.length === 1 && (here.screen === 'account' || here.screen === 'settings')) { here.screen = 'repos'; render(); return true; }
        return false;
    }
    return false;
  }

  function key(e, { render }) {
    if (!st.open) return false;
    const layer = app().querySelector('.ac-layer');
    if (!layer) return false;
    if (e.key === 'Escape') { e.preventDefault(); st.open = null; render(); focusOpener(); return true; }
    const items = [...layer.querySelectorAll('button:not(.m-grab), [role="menuitem"]')];
    const i = items.indexOf(document.activeElement);
    if (OPT === 'B' && st.open === 'menu' && (e.key === 'ArrowDown' || e.key === 'ArrowUp')) {
      e.preventDefault();
      items[(i + (e.key === 'ArrowDown' ? 1 : items.length - 1)) % items.length]?.focus();
      return true;
    }
    if (e.key === 'Tab') {
      // Keep focus inside the open layer.
      e.preventDefault();
      items[(i + (e.shiftKey ? items.length - 1 : 1)) % items.length]?.focus();
      return true;
    }
    return false;
  }

  window.ACCOUNT = {
    on: true,
    avatar,
    overlay,
    signedOutNotice,
    handle,
    key,
    screens: page === 'account' ? { account: accountScreen } : page === 'settings' ? { settings: settingsScreen } : {},
  };
})();
