/* Direction A — explicit tools in the toolbar, a feedback rail, a review-before-post dialog. */
(function () {
  const { icon, esc, data, SOURCES, optionName, anchorLabel, feedbackCommentHtml, pickCommentHtml } = WF;
  let st = WF.newState();
  let popover = null; // pin number whose note editor is open, or null
  let modal = null; // 'review' | 'posted' | null
  let shell;

  const nextN = () => (st.pins.reduce((m, p) => Math.max(m, p.n), 0) + 1);
  const pin = (n) => st.pins.find((p) => p.n === n);

  function onCanvasPoint(hit) {
    if (!shell.armed) return;
    const n = nextN();
    st.pins.push({ n, option: hit.pageLevel ? hit.option : hit.option, fx: hit.fx, fy: hit.fy, note: '' });
    st.activePin = n;
    shell.armed = false;
    popover = n;
    shell.render();
  }
  function onPinClick(n) {
    st.activePin = n;
    popover = n;
    shell.render();
  }
  function onReset() {
    // Mutate in place: the shell captured this same object, so reassigning would orphan it.
    const keep = { size: st.size, source: st.source, presenting: st.presenting };
    Object.assign(st, WF.newState(), keep);
    shell.armed = false;
    popover = null;
    modal = null;
    shell.render();
    shell.syncDemo();
  }

  function decorate(api) {
    const src = SOURCES[st.source];
    // 1) tools in the toolbar
    const tools = api.barFbSlot;
    if (tools) {
      const dis = src.viewOnly ? ' disabled' : '';
      tools.innerHTML =
        `<span class="vw-sep"></span>` +
        `<div class="segmented a-tools" role="group" aria-label="Feedback tools">` +
        `<button type="button" class="seg" data-tool="pin" aria-pressed="${!!api.armed}"${dis}>${icon('pin')} Pin</button>` +
        `<button type="button" class="seg" data-tool="note"${dis}>${icon('note')} Note</button>` +
        `<button type="button" class="seg" data-tool="pick"${dis}>${icon('pick')} Pick</button>` +
        `</div>` +
        (st.pins.length ? `<span class="badge a-count">${st.pins.length} pin${st.pins.length === 1 ? '' : 's'}</span>` : '');
      tools.querySelector('[data-tool="pin"]').classList.toggle('is-on', !!api.armed);
    }
    // 2) the rail
    const stage = api.stage;
    stage.classList.add('a-has-rail');
    let rail = stage.querySelector('.a-rail');
    if (!rail) { rail = document.createElement('aside'); rail.className = 'a-rail'; stage.appendChild(rail); }
    rail.innerHTML = railHtml(src);
    // 3) note popover — clear any stale one first, then open for the active pin
    stage.querySelectorAll('.a-pop').forEach((el) => el.remove());
    if (popover != null && !src.viewOnly) {
      const p = pin(popover);
      const marker = api.canvasEl.querySelector(`.pin[data-pin="${popover}"]`);
      if (p && marker) {
        const pop = document.createElement('div');
        pop.className = 'a-pop';
        pop.innerHTML =
          `<label for="a-pop-t">Pin ${p.n} · ${esc(anchorLabel(p, st.source))}</label>` +
          `<textarea id="a-pop-t" rows="3" placeholder="What about this spot?">${esc(p.note)}</textarea>` +
          `<div class="row"><button type="button" class="ghost" data-pop="delete">${icon('trash')} Delete</button><span class="spacer"></span>` +
          `<button type="button" class="ghost" data-pop="cancel">Done</button></div>`;
        stage.appendChild(pop);
        requestAnimationFrame(() => {
          const mr = marker.getBoundingClientRect(), sr = stage.getBoundingClientRect();
          let left = mr.left - sr.left + 14, top = mr.top - sr.top + 14;
          left = Math.max(8, Math.min(sr.width - 268, left));
          top = Math.max(8, Math.min(sr.height - 150, top));
          pop.style.left = left + 'px'; pop.style.top = top + 'px';
        });
        const ta = pop.querySelector('textarea'); ta.focus(); ta.setSelectionRange(ta.value.length, ta.value.length);
      }
    }
    // 4) review / posted dialog
    const old = api.root.querySelector('.a-modal');
    if (old) old.remove();
    if (modal) api.root.querySelector('.desk').appendChild(modalEl());
  }

  function railHtml(src) {
    if (src.viewOnly) {
      return `<h2>${icon('note')} Feedback</h2>` +
        `<div class="a-sec"><p class="a-empty">This canvas didn’t load the feedback bridge, so pins and the in-canvas pick are off. You can still record a decision the existing way.</p></div>` +
        `<div class="a-foot"><button type="button" class="primary" data-to="Pick in #${data.pickTicket}">${icon('pick')} Pick in #${data.pickTicket}</button></div>`;
    }
    const pins = st.pins.length
      ? st.pins.map((p) =>
          `<div class="a-pinrow${st.activePin === p.n ? ' is-active' : ''}"><span class="chip">${p.n}</span>` +
          `<div class="body"><div class="where">${esc(anchorLabel(p, st.source))}</div><div class="txt">${p.note ? esc(p.note) : '<span class="a-empty">No note yet</span>'}</div></div>` +
          `<div class="acts"><button type="button" class="iconbtn" data-edit="${p.n}" aria-label="Edit pin ${p.n}">${icon('pencil')}</button>` +
          `<button type="button" class="iconbtn" data-del="${p.n}" aria-label="Delete pin ${p.n}">${icon('trash')}</button></div></div>`,
        ).join('')
      : `<p class="a-empty">No pins yet. Click <strong>Pin</strong>, then click the canvas.</p>`;
    const pickBlock = st.pick
      ? `<div class="a-field"><label>Picked option</label><select id="a-pick-sel">${optionOpts(st.pick.option)}</select></div>` +
        `<div class="a-field"><label for="a-pick-note">Pick note (optional)</label><textarea id="a-pick-note" rows="2" placeholder="Why this one?">${esc(st.pick.note || '')}</textarea></div>` +
        `<div class="a-field"><button type="button" class="ghost" data-pick="clear">Clear pick</button></div>`
      : `<p class="a-empty">No pick yet.</p><div class="a-field"><button type="button" class="ghost" data-pick="set">${icon('pick')} Pick an option</button></div>`;
    return `<h2>${icon('note')} Feedback <span class="badge">#${data.prototypeTicket}</span></h2>` +
      `<div class="a-sec"><span class="eyebrow">Pins</span>${pins}</div>` +
      `<div class="a-sec"><span class="eyebrow">Option note</span>` +
      `<textarea id="a-optnote" rows="2" placeholder="A note about the whole option">${esc(st.optionNote)}</textarea></div>` +
      `<div class="a-sec"><span class="eyebrow">Pick → #${data.pickTicket}</span>${pickBlock}</div>` +
      `<div class="a-foot"><button type="button" class="primary" data-review ${st.pins.length || st.optionNote.trim() || st.pick ? '' : 'disabled'}>${icon('send')} Review & post</button></div>`;
  }

  const optionOpts = (sel) => data.options.map((o) => `<option value="${esc(o.id)}"${o.id === sel ? ' selected' : ''}>${esc(o.name)} (${esc(o.id)})</option>`).join('');

  function modalEl() {
    const wrap = document.createElement('div');
    wrap.className = 'a-modal';
    wrap.setAttribute('role', 'dialog');
    wrap.setAttribute('aria-modal', 'true');
    wrap.setAttribute('aria-label', modal === 'posted' ? 'Posted' : 'Review before posting');
    if (modal === 'review') {
      wrap.innerHTML =
        `<div class="a-sheet"><header>${icon('send')}<h2>Review before posting</h2><span class="spacer"></span></header>` +
        `<div class="content"><p class="lead">Nothing is sent until you post. This posts the canvas feedback to #${data.prototypeTicket}${st.pick ? `, and the pick to #${data.pickTicket}` : ''}.</p>` +
        feedbackCommentHtml(st) + (st.pick ? pickCommentHtml(st) : '') + `</div>` +
        `<footer><button type="button" class="ghost" data-modal="close">Back</button><span class="spacer"></span>` +
        `<button type="button" class="primary" data-modal="post">${icon('check')} Post ${st.pick ? 'feedback + pick' : 'feedback'}</button></footer></div>`;
    } else {
      wrap.innerHTML =
        `<div class="a-sheet"><header><span class="posted-flag">${icon('check')} Posted</span><span class="spacer"></span></header>` +
        `<div class="content"><p class="lead">Posted (simulated — no network write).</p>` +
        st.posted.feedback + (st.posted.pick || '') + `</div>` +
        `<footer><span class="spacer"></span><button type="button" class="primary" data-modal="close">Done</button></footer></div>`;
    }
    return wrap;
  }

  // one delegated click handler for all A controls
  function init() {
    shell = WF.Shell.mount(document.getElementById('root'), { state: st, decorate, onCanvasPoint, onPinClick, onReset });
    const root = shell.root;
    root.addEventListener('click', (e) => {
      const t = e.target.closest('button');
      if (!t) return;
      if (t.dataset.tool === 'pin') { shell.armed = !shell.armed; popover = null; shell.render(); return; }
      if (t.dataset.tool === 'note') { shell.armed = false; shell.render(); const f = root.querySelector('#a-optnote'); f && f.focus(); return; }
      if (t.dataset.tool === 'pick') { shell.armed = false; if (!st.pick) st.pick = { option: data.options[0].id, note: '' }; shell.render(); const f = root.querySelector('#a-pick-sel'); f && f.focus(); return; }
      if (t.dataset.edit) { onPinClick(Number(t.dataset.edit)); return; }
      if (t.dataset.del) { st.pins = st.pins.filter((p) => p.n !== Number(t.dataset.del)); if (popover === Number(t.dataset.del)) popover = null; shell.render(); return; }
      if (t.dataset.pop === 'delete') { st.pins = st.pins.filter((p) => p.n !== popover); popover = null; shell.render(); return; }
      if (t.dataset.pop === 'cancel') { popover = null; shell.render(); return; }
      if (t.dataset.pick === 'set') { st.pick = { option: data.options[0].id, note: '' }; shell.render(); return; }
      if (t.dataset.pick === 'clear') { st.pick = null; shell.render(); return; }
      if (t.hasAttribute('data-review')) { modal = 'review'; shell.render(); return; }
      if (t.dataset.modal === 'close') { modal = null; shell.render(); return; }
      if (t.dataset.modal === 'post') {
        st.posted = { feedback: feedbackCommentHtml(st), pick: st.pick ? pickCommentHtml(st) : '' };
        modal = 'posted';
        shell.render();
        shell.toast('Posted (simulated)');
        return;
      }
    });
    // input without a full re-render, so typing never rebuilds the field under the caret
    root.addEventListener('input', (e) => {
      const t = e.target;
      if (t.id === 'a-pop-t' && popover != null) { const p = pin(popover); if (p) p.note = t.value; syncCount(); }
      else if (t.id === 'a-optnote') {
        st.optionNote = t.value;
        root.querySelector('[data-review]').disabled = !(st.pins.length || st.optionNote.trim() || st.pick);
      }
      else if (t.id === 'a-pick-note' && st.pick) { st.pick.note = t.value; }
    });
    root.addEventListener('change', (e) => { if (e.target.id === 'a-pick-sel' && st.pick) { st.pick.option = e.target.value; } });
    // Esc closes the modal, then the popover
    root.addEventListener('keydown', (e) => {
      if (e.key !== 'Escape') return;
      if (modal) { modal = null; shell.render(); e.stopPropagation(); }
      else if (popover != null) { popover = null; shell.render(); e.stopPropagation(); }
    });
  }
  function syncCount() {
    const live = pin(popover);
    const row = shell.root.querySelector(`.a-pinrow .chip`); // cheap: refresh rail txt for the active pin
    const txt = shell.root.querySelector(`.a-pinrow.is-active .txt`);
    if (txt && live) txt.textContent = live.note || 'No note yet';
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init);
  else init();
})();
