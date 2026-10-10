/*
  The tour itself. One state machine, three ways to present it:
    ?format=spotlight  coach marks over the demo app (dimmed page, popover by the target)
    ?format=panel      a docked guide with a checklist; the demo app stays fully usable
    ?format=story      a dedicated tour page: the story on the left, a live demo window on the right
  ?entry=dialog|card|corner picks the first-launch invitation and the persistent tour entry.
  ?state=invite|skipped|exited|settings|done, or ?step=1..7 (with plan, sel, handoff) opens a given state.
*/
(() => {
  const { steps, copy, entries, invite, demo } = window.TOUR;
  const esc = Kit.esc;
  const icon = Kit.icon;
  const params = new URLSearchParams(location.search);
  const format = ['spotlight', 'panel', 'story'].includes(params.get('format')) ? params.get('format') : 'spotlight';
  const entry = entries[params.get('entry')] ? params.get('entry') : 'dialog';
  const where = entries[entry].where;
  const inviteKind = entries[entry].invite;
  const N = steps.length;

  const s = {
    format, entry,
    tourOn: false, step: 0, done: false,
    view: 'home', plan: 0, selected: null, handoff: 0,
    invite: false, pulse: false, note: '',
  };
  let timer = null;
  let focusStep = false;
  let focusEntry = false;

  function stopTimer() { clearInterval(timer); timer = null; }

  function enterStep(i) {
    stopTimer();
    s.step = i;
    s.done = false;
    const step = steps[i];
    s.view = step.view;
    if (step.id === 'goal') { s.plan = 0; s.selected = null; s.handoff = 0; }
    if (step.id === 'planning') {
      s.plan = 0;
      timer = setInterval(() => { s.plan += 1; if (s.plan >= 4) stopTimer(); render(); }, 900);
    }
    if (step.id === 'map' || step.id === 'types') { s.plan = 4; s.selected = null; s.handoff = 0; }
    if (step.id === 'blockers') { s.selected = null; s.handoff = 0; }
    if (step.id === 'handoff') { s.selected = null; s.handoff = 0; }
    focusStep = true;
  }

  function canAdvance() {
    const id = steps[s.step].id;
    if (id === 'goal') return false;
    if (id === 'planning') return s.plan >= 4;
    if (id === 'blockers') return s.selected === 6;
    if (id === 'handoff') return s.handoff >= 3;
    return true;
  }

  function startTour() {
    s.tourOn = true; s.invite = false; s.pulse = false; s.note = '';
    enterStep(0);
  }

  function endTour(note) {
    stopTimer();
    Object.assign(s, { tourOn: false, done: false, view: 'home', plan: 0, selected: null, handoff: 0, invite: false, pulse: true, note });
    focusStep = true;
  }

  function finish() { stopTimer(); s.done = true; s.view = 'map'; focusStep = true; }

  const actions = {
    'take-tour': startTour,
    'not-now': () => { Object.assign(s, { invite: false, pulse: true, note: copy.skipped(where) }); focusStep = true; },
    exit: () => endTour(copy.exited(where)),
    'close-note': () => { s.note = ''; s.pulse = false; },
    next: () => { if (!canAdvance()) return; if (s.step + 1 < N) enterStep(s.step + 1); else finish(); },
    back: () => { if (s.done) { s.done = false; enterStep(N - 1); s.handoff = 3; s.selected = 5; return; } if (s.step > 0) enterStep(s.step - 1); },
    'start-map': () => { if (s.tourOn && steps[s.step].id === 'goal') enterStep(s.step + 1); },
    select: (el) => {
      if (!s.tourOn) return;
      const n = Number(el.dataset.ticket);
      if (s.selected !== n) s.handoff = 0;
      s.selected = n;
    },
    'open-t3': () => {
      if (s.selected !== 5 || s.handoff) return;
      s.handoff = 1;
      stopTimer();
      timer = setInterval(() => { s.handoff += 1; if (s.handoff >= 3) stopTimer(); render(); }, 1100);
    },
    'first-map': () => { endTour(''); s.pulse = false; Kit.toast('Would open Start a new map, outside the demo'); },
    home: () => endTour(copy.completion.replay(where)),
    restart: startTour,
    'new-map': () => Kit.toast('Would open Start a new map'),
    settings: () => { s.view = 'settings'; s.note = ''; focusEntry = true; },
    'go-home': () => { s.view = 'home'; s.pulse = false; },
    noop: () => {},
  };

  /* ---------- shared step pieces ---------- */

  function stepControls(compact) {
    const step = steps[s.step];
    const ready = canAdvance();
    const waitText = !ready && step.wait && ((step.id === 'planning') || (step.id === 'handoff' && s.handoff > 0)) ? step.wait : '';
    const hint = !ready && step.hint && !waitText ? `<p class="tour-hint">${icon('hand')}${esc(step.hint)}</p>` : '';
    const wait = waitText ? `<p class="tour-hint is-wait" role="status">${icon('clock')}${esc(waitText)}</p>` : '';
    const nextLabel = step.cta ?? (s.step + 1 === N ? 'Finish' : copy.next);
    const nextBtn = ready || step.cta ? `<button type="button" class="primary" data-act="next">${esc(nextLabel)}${icon('arrow')}</button>` : '';
    const backBtn = s.step > 0 ? `<button type="button" class="ghost" data-act="back">${esc(copy.back)}</button>` : '';
    return `${hint}${wait}<div class="tour-actions${compact ? ' is-compact' : ''}">${backBtn}<span class="demo-spacer"></span>${nextBtn}</div>`;
  }

  function stepBody() {
    const step = steps[s.step];
    return `<p class="tour-body">${esc(step.body)}</p>${step.showTypes ? DemoApp.typeLegend() : ''}`;
  }

  function completionBody() {
    const c = copy.completion;
    return `<p class="tour-body">${esc(c.body)}</p>
      <div class="tour-actions"><button type="button" class="ghost" data-act="home">${esc(c.secondary)}</button><span class="demo-spacer"></span>
      <button type="button" class="primary" data-act="first-map">${icon('plus')}${esc(c.primary)}</button></div>
      <p class="tour-replay">${esc(c.replay(where))}</p>`;
  }

  const pill = `<span class="demo-pill">${esc(copy.demoPill)}</span>`;
  const exitBtn = `<button type="button" class="iconbtn tour-x" data-act="exit" aria-label="${esc(copy.exit)}" title="${esc(copy.exit)}">${icon('close')}</button>`;

  /* ---------- the three formats ---------- */

  function spotlightLayer() {
    if (s.done) {
      return `<div class="tour-scrim"></div>
        <section class="tour-pop is-center" role="dialog" aria-modal="true" aria-labelledby="tour-title">
          <header class="tour-pop-head">${pill}<span class="tour-count">${N} of ${N} done</span>${exitBtn}</header>
          <span class="tour-done-icon" aria-hidden="true">${icon('check')}</span>
          <h2 id="tour-title" tabindex="-1">${esc(copy.completion.title)}</h2>${completionBody()}
        </section>`;
    }
    const step = steps[s.step];
    const progress = `<div class="tour-dots" aria-hidden="true">${steps.map((_, i) => `<span class="${i < s.step ? 'is-done' : i === s.step ? 'is-now' : ''}"></span>`).join('')}</div>`;
    return `<div class="tour-hole-wrap" aria-hidden="true">${step.target ? '<div class="tour-block"></div><div class="tour-block"></div><div class="tour-block"></div><div class="tour-block"></div><div class="tour-hole"></div>' : '<div class="tour-scrim"></div>'}</div>
      <section class="tour-pop${step.target ? '' : ' is-center'}" role="dialog" aria-modal="false" aria-labelledby="tour-title">
        <header class="tour-pop-head">${pill}<span class="tour-count">${copy.stepOf(s.step + 1, N)}</span>${exitBtn}</header>
        <h2 id="tour-title" tabindex="-1">${esc(step.title)}</h2>${stepBody()}${stepControls(true)}${progress}
      </section>`;
  }

  function panelLayer() {
    const list = steps.map((st, i) => {
      const state = s.done || i < s.step ? 'is-done' : i === s.step ? 'is-now' : '';
      const mark = state === 'is-done' ? icon('check') : `<span>${i + 1}</span>`;
      const open = !s.done && i === s.step
        ? `<div class="tour-panel-step">${stepBody()}${stepControls(false)}</div>`
        : '';
      return `<li class="${state}" ${i === s.step && !s.done ? 'aria-current="step"' : ''}><span class="tour-mark" aria-hidden="true">${mark}</span>
        <div><h3 ${i === s.step && !s.done ? 'id="tour-title" tabindex="-1"' : ''}>${esc(st.title)}</h3>${open}</div></li>`;
    }).join('');
    const doneCount = s.done ? N : s.step;
    return `<aside class="tour-panel" aria-labelledby="tour-panel-title">
      <header class="tour-panel-head"><h2 id="tour-panel-title">Tour</h2>${pill}${exitBtn}</header>
      <div class="tour-progress"><span class="tour-count">${s.done ? `${N} of ${N} done` : copy.stepOf(s.step + 1, N)}</span>
        <span class="tour-bar" role="progressbar" aria-label="Tour progress" aria-valuemin="0" aria-valuemax="${N}" aria-valuenow="${doneCount}"><span style="width:${(doneCount / N) * 100}%"></span></span></div>
      <ol class="tour-checklist">${list}</ol>
      ${s.done ? `<section class="tour-panel-done"><span class="tour-done-icon" aria-hidden="true">${icon('check')}</span><h3 id="tour-title" tabindex="-1">${esc(copy.completion.title)}</h3>${completionBody()}</section>` : ''}
    </aside>`;
  }

  function storyChrome() {
    const stepper = steps.map((st, i) => {
      const state = s.done || i < s.step ? 'is-done' : i === s.step ? 'is-now' : '';
      return `<li class="${state}" ${i === s.step && !s.done ? 'aria-current="step"' : ''}><span class="tour-mark" aria-hidden="true">${state === 'is-done' ? icon('check') : i + 1}</span><span>${esc(st.label)}</span></li>`;
    }).join('');
    const step = steps[s.step];
    const story = s.done
      ? `<span class="tour-done-icon" aria-hidden="true">${icon('check')}</span><h1 id="tour-title" tabindex="-1">${esc(copy.completion.title)}</h1>${completionBody()}`
      : `<p class="tour-count">${copy.stepOf(s.step + 1, N)}</p><h1 id="tour-title" tabindex="-1">${esc(step.title)}</h1>${stepBody()}${stepControls(false)}`;
    return `<header class="story-top"><span class="story-brand"><span class="demo-logo" aria-hidden="true">${icon('compass')}</span>Wayfinder tour</span>${pill}
        <ol class="story-stepper" aria-label="Tour steps">${stepper}</ol>
        <button type="button" class="ghost" data-act="exit">${icon('close')}${esc(copy.exit)}</button></header>
      <div class="story-body">
        <section class="story-text" aria-live="polite">${story}</section>
        <section class="story-window" aria-label="Demo app">
          <p class="story-window-bar"><span class="story-dots" aria-hidden="true"><i></i><i></i><i></i></span>${pill}<span>Demo project · ${esc(demo.repo)}</span></p>
          <div class="story-viewport"><div class="story-scale" id="story-scale"></div></div>
        </section>
      </div>`;
  }

  /* ---------- pre-tour: invitation and notes ---------- */

  function inviteLayer() {
    if (!s.invite) return '';
    if (inviteKind === 'dialog') {
      return `<div class="tour-scrim"></div>
        <section class="tour-pop is-center tour-invite" role="dialog" aria-modal="true" aria-labelledby="tour-title">
          <span class="tour-invite-icon" aria-hidden="true">${icon('compass')}</span>
          <h2 id="tour-title" tabindex="-1">${esc(invite.title)}</h2>
          <p class="tour-body">${esc(invite.body)}</p>
          <div class="tour-actions"><button type="button" class="ghost" data-act="not-now">${esc(invite.decline)}</button><span class="demo-spacer"></span>
          <button type="button" class="primary" data-act="take-tour">${icon('play')}${esc(invite.accept)}</button></div>
          <p class="tour-replay">You can take it later from ${esc(where)}.</p>
        </section>`;
    }
    if (inviteKind === 'corner') {
      return `<section class="tour-corner" role="region" aria-labelledby="tour-title">
          <button type="button" class="iconbtn tour-x" aria-label="Dismiss" data-act="not-now">${icon('close')}</button>
          <h2 id="tour-title" tabindex="-1">${esc(invite.cardTitle)}</h2>
          <p>${esc(invite.shortBody)}</p>
          <div class="tour-actions"><button type="button" class="ghost" data-act="not-now">${esc(invite.decline)}</button><span class="demo-spacer"></span>
          <button type="button" class="primary" data-act="take-tour">${icon('play')}${esc(invite.accept)}</button></div>
        </section>`;
    }
    return '';
  }

  function noteLayer() {
    if (!s.note) return '';
    return `<div class="tour-note" role="status">${icon('info')}<span>${esc(s.note)}</span>
      <button type="button" class="iconbtn" aria-label="Dismiss" data-act="close-note">${icon('close')}</button></div>`;
  }

  /* ---------- render ---------- */

  const root = document.getElementById('tour-root');
  const live = document.getElementById('tour-live');

  function render() {
    const active = document.activeElement;
    const key = active && (active.id || active.dataset.act + (active.dataset.ticket ?? ''));
    const story = s.tourOn && format === 'story';
    document.body.dataset.format = format;
    document.body.classList.toggle('is-touring', s.tourOn);

    if (story) {
      root.innerHTML = `<div class="story">${storyChrome()}</div>`;
      document.getElementById('story-scale').innerHTML = DemoApp.render(s);
    } else {
      const layer = s.tourOn ? (format === 'panel' ? panelLayer() : spotlightLayer()) : inviteLayer();
      root.innerHTML = `<div class="tour-shell${s.tourOn && format === 'panel' ? ' has-panel' : ''}">${DemoApp.render(s)}${s.tourOn && format === 'panel' ? layer : ''}</div>${s.tourOn && format === 'panel' ? '' : layer}${noteLayer()}`;
    }
    const step = steps[s.step];
    if (s.tourOn && !s.done && step.target && format !== 'spotlight') {
      const target = targetFor(step);
      if (target) {
        target.classList.add('tour-target');
        target.scrollIntoView({ block: 'nearest', inline: 'nearest' });
      }
    }
    if (story) fitStory();
    if (s.tourOn && format === 'spotlight') placeSpotlight();

    if (focusStep) {
      focusStep = false;
      const title = document.getElementById('tour-title');
      const focusTarget = title ?? (s.note ? root.querySelector('#entry-persistent') : null);
      if (focusTarget) focusTarget.focus({ preventScroll: true });
      live.textContent = s.tourOn
        ? s.done ? copy.completion.title : `${copy.stepOf(s.step + 1, N)}: ${step.title}`
        : s.note;
    } else if (focusEntry) {
      focusEntry = false;
      root.querySelector('#entry-persistent')?.focus({ preventScroll: true });
    } else if (key) {
      const again = document.getElementById(key) ?? [...root.querySelectorAll('[data-act]')].find((el) => el.dataset.act + (el.dataset.ticket ?? '') === key);
      if (again && !again.disabled) {
        again.focus({ preventScroll: true });
      } else if (key === 'demo-open') {
        // The button disables once the hand-off starts; keep focus on its status instead.
        document.getElementById('demo-handoff')?.focus({ preventScroll: true });
      }
    }
  }

  function targetFor(step) {
    let sel = step.target;
    if (step.id === 'handoff' && s.selected === 5) sel = s.handoff ? '#demo-handoff' : '#demo-open';
    if (step.id === 'blockers' && s.selected === 6) sel = '.demo-waiting';
    return root.querySelector(sel);
  }

  function fitStory() {
    const viewport = root.querySelector('.story-viewport');
    const scale = root.querySelector('.story-scale');
    const frame = root.querySelector('.story-window');
    const bar = root.querySelector('.story-window-bar');
    // Fit the 1280×800 demo into the space the story leaves, then shrink the window to match.
    const area = frame.parentElement.getBoundingClientRect();
    const narrow = innerWidth < 760;
    const availW = narrow ? area.width - 28 : area.width - 48 - 380 - 24 - 2;
    const availH = narrow ? 420 : area.height - 48 - bar.offsetHeight - 2;
    const k = Math.min(availW / 1280, availH / 800);
    viewport.style.width = `${Math.floor(1280 * k)}px`;
    viewport.style.height = `${Math.floor(800 * k)}px`;
    scale.style.transform = `scale(${k})`;
  }

  function placeSpotlight() {
    if (s.done) return;
    const step = steps[s.step];
    const pop = root.querySelector('.tour-pop');
    if (!step.target) return;
    const target = targetFor(step);
    if (!target) return;
    target.scrollIntoView({ block: 'nearest', inline: 'nearest' });
    const pad = 6;
    const r = target.getBoundingClientRect();
    // Whole pixels, so the four dimming blocks meet without hairline seams.
    const x0 = Math.floor(r.left - pad);
    const y0 = Math.floor(r.top - pad);
    const hole = { x: x0, y: y0, w: Math.ceil(r.right + pad) - x0, h: Math.ceil(r.bottom + pad) - y0 };
    const W = innerWidth;
    const H = innerHeight;
    const [top, bottom, left, right] = root.querySelectorAll('.tour-block');
    Object.assign(top.style, { left: '0px', top: '0px', width: `${W}px`, height: `${Math.max(0, hole.y)}px` });
    Object.assign(bottom.style, { left: '0px', top: `${hole.y + hole.h}px`, width: `${W}px`, height: `${Math.max(0, H - hole.y - hole.h)}px` });
    Object.assign(left.style, { left: '0px', top: `${hole.y}px`, width: `${Math.max(0, hole.x)}px`, height: `${hole.h}px` });
    Object.assign(right.style, { left: `${hole.x + hole.w}px`, top: `${hole.y}px`, width: `${Math.max(0, W - hole.x - hole.w)}px`, height: `${hole.h}px` });
    Object.assign(root.querySelector('.tour-hole').style, { left: `${hole.x}px`, top: `${hole.y}px`, width: `${hole.w}px`, height: `${hole.h}px` });

    if (W < 760) return; // the popover is a bottom sheet on narrow screens
    const pw = pop.offsetWidth;
    const ph = pop.offsetHeight;
    const gap = 14;
    const clampY = (y) => Math.max(12, Math.min(y, H - ph - 12));
    const clampX = (x) => Math.max(12, Math.min(x, W - pw - 12));
    let x;
    let y;
    const below = hole.y + hole.h + gap + ph < H - 12;
    if (hole.w > 480 && below) { x = clampX(hole.x + hole.w - pw); y = hole.y + hole.h + gap; }
    else if (hole.x + hole.w + gap + pw < W - 12) { x = hole.x + hole.w + gap; y = clampY(hole.y); }
    else if (hole.x - gap - pw > 12) { x = hole.x - gap - pw; y = clampY(hole.y); }
    else if (hole.y + hole.h + gap + ph < H - 12) { x = clampX(hole.x); y = hole.y + hole.h + gap; }
    else { x = clampX(hole.x); y = Math.max(12, hole.y - gap - ph); }
    pop.style.left = `${x}px`;
    pop.style.top = `${y}px`;
  }

  root.addEventListener('click', (event) => {
    const el = event.target.closest('[data-act]');
    if (!el || el.disabled) return;
    event.preventDefault();
    actions[el.dataset.act]?.(el);
    render();
  });

  document.addEventListener('keydown', (event) => {
    if (event.key === 'Escape') {
      if (s.tourOn) { actions.exit(); render(); }
      else if (s.invite) { actions['not-now'](); render(); }
    }
  });

  addEventListener('resize', () => {
    if (s.tourOn && format === 'story') fitStory();
    if (s.tourOn && format === 'spotlight') placeSpotlight();
  });

  /* ---------- open in the requested state ---------- */

  const state = params.get('state');
  const stepParam = Number(params.get('step'));
  if (state === 'invite') { s.invite = true; focusStep = true; }
  else if (state === 'skipped') { s.pulse = true; s.note = copy.skipped(where); }
  else if (state === 'exited') { s.pulse = true; s.note = copy.exited(where); }
  else if (state === 'settings') { s.view = 'settings'; s.pulse = true; }
  else if (state === 'done') { startTour(); s.plan = 4; s.selected = 5; s.handoff = 3; finish(); }
  else if (stepParam >= 1 && stepParam <= N) {
    startTour();
    enterStep(stepParam - 1);
    if (params.has('plan')) { stopTimer(); s.plan = Number(params.get('plan')); }
    if (params.has('sel')) s.selected = Number(params.get('sel'));
    if (params.has('handoff')) s.handoff = Number(params.get('handoff'));
  } else if (state !== 'home') { s.invite = true; focusStep = true; }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', render);
  else render();
})();
