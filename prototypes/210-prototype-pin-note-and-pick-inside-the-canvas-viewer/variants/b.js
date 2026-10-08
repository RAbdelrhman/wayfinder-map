/* Direction B — click to annotate in context, a single bottom composer, inline review. */
(function () {
  const { icon, esc, data, SOURCES, optionName, anchorLabel, feedbackCommentHtml, pickCommentHtml } = WF;
  let st = WF.newState();
  let bubble = null; // pin number whose in-context note bubble is open
  let expand = null; // 'note' | 'pick' | 'review' | 'posted' | null
  let shell;

  const nextN = () => (st.pins.reduce((m, p) => Math.max(m, p.n), 0) + 1);
  const pin = (n) => st.pins.find((p) => p.n === n);

  function onCanvasPoint(hit) {
    // No mode: a canvas click drops a pin and opens its bubble.
    const n = nextN();
    st.pins.push({ n, option: hit.option, fx: hit.fx, fy: hit.fy, note: '' });
    st.activePin = n;
    bubble = n;
    expand = null;
    shell.render();
  }
  function onPinClick(n) { st.activePin = n; bubble = n; shell.render(); }
  function onReset() {
    // Mutate in place: the shell captured this same object, so reassigning would orphan it.
    const keep = { size: st.size, source: st.source, presenting: st.presenting };
    Object.assign(st, WF.newState(), keep);
    bubble = null; expand = null; shell.render(); shell.syncDemo();
  }

  function decorate(api) {
    const src = SOURCES[st.source];
    const vw = api.canvasEl.closest('.vw');
    vw.classList.toggle('b-live', !src.viewOnly);
    // composer
    const stage = api.stage;
    let comp = stage.querySelector('.b-composer');
    if (!comp) { comp = document.createElement('div'); comp.className = 'b-composer'; stage.appendChild(comp); }
    comp.innerHTML = src.viewOnly ? viewOnlyHtml() : composerHtml();
    // in-context bubble — clear any stale one first, then open for the active pin
    stage.querySelectorAll('.b-bubble').forEach((el) => el.remove());
    if (bubble != null && !src.viewOnly) renderBubble(api);
  }

  function composerHtml() {
    const chips =
      `<span class="b-chip${st.pins.length ? ' on' : ''}">${icon('pin')} ${st.pins.length} pin${st.pins.length === 1 ? '' : 's'}</span>` +
      `<span class="b-chip${st.optionNote.trim() ? ' on' : ''}">${icon('note')} option note</span>` +
      `<span class="b-chip${st.pick ? ' on' : ''}">${icon('pick')} ${st.pick ? esc(optionName(st.pick.option)) : 'no pick'}</span>` +
      (st.posted ? '' : `<span class="b-hint">Click the canvas to drop a pin</span>`);
    const actions = st.posted
      ? `<button type="button" class="ghost" data-b="view">${icon('check')} View posted</button>`
      : `<button type="button" class="ghost" data-b="note">${icon('note')} Option note</button>` +
        `<button type="button" class="b-pill${st.pick ? ' is-set' : ''}" data-b="pick">${icon('pick')} ${st.pick ? 'Pick: ' + esc(st.pick.option) : 'Pick…'}</button>` +
        `<button type="button" class="primary" data-b="review" ${st.pins.length || st.optionNote.trim() || st.pick ? '' : 'disabled'}>${icon('send')} Review</button>`;
    const top = st.posted
      ? `<div class="b-top"><div class="b-summary b-posted"><span class="posted-flag">${icon('check')} Posted</span>` +
        `<span class="links">Feedback → #${data.prototypeTicket}${st.posted.pick ? ` · Pick → #${data.pickTicket}` : ''} (simulated)</span></div><div class="b-actions">${actions}</div></div>`
      : `<div class="b-top"><div class="b-summary">${chips}</div><div class="b-actions">${actions}</div></div>`;
    return top + (expand ? `<div class="b-expand">${expandHtml()}</div>` : '');
  }

  function expandHtml() {
    if (expand === 'note')
      return `<h3>Option note</h3><textarea id="b-optnote" rows="3" placeholder="A note about the whole option">${esc(st.optionNote)}</textarea>` +
        `<div class="row"><span class="spacer"></span><button type="button" class="ghost" data-b="collapse">Done</button></div>`;
    if (expand === 'pick')
      return `<h3>Pick → #${data.pickTicket}</h3>` +
        `<label for="b-pick-sel">Option</label><select id="b-pick-sel">${data.options.map((o) => `<option value="${esc(o.id)}"${st.pick && st.pick.option === o.id ? ' selected' : ''}>${esc(o.name)} (${esc(o.id)})</option>`).join('')}</select>` +
        `<div style="margin-top:10px"><label for="b-pick-note">Pick note (optional)</label><textarea id="b-pick-note" rows="2" placeholder="Why this one?">${esc(st.pick ? st.pick.note : '')}</textarea></div>` +
        `<div class="row">${st.pick ? `<button type="button" class="ghost" data-b="pick-clear">Clear pick</button>` : ''}<span class="spacer"></span><button type="button" class="ghost" data-b="collapse">Done</button></div>`;
    if (expand === 'review')
      return `<p class="b-lead">Nothing is sent until you post. This posts feedback to #${data.prototypeTicket}${st.pick ? `, and the pick to #${data.pickTicket}` : ''}.</p>` +
        feedbackCommentHtml(st) + (st.pick ? pickCommentHtml(st) : '') +
        `<div class="row"><button type="button" class="ghost" data-b="collapse">Back</button><span class="spacer"></span>` +
        `<button type="button" class="primary" data-b="post">${icon('check')} Post ${st.pick ? 'feedback + pick' : 'feedback'}</button></div>`;
    if (expand === 'posted')
      return `<p class="b-lead">Posted (simulated — no network write).</p>${st.posted.feedback}${st.posted.pick || ''}` +
        `<div class="row"><span class="spacer"></span><button type="button" class="ghost" data-b="collapse">Close</button></div>`;
    return '';
  }

  function viewOnlyHtml() {
    return `<div class="b-top"><div class="b-summary b-viewonly">${icon('note')} View only — this canvas didn’t load the feedback bridge, so pins and the in-canvas pick are off.` +
      `<span class="spacer"></span></div><div class="b-actions"><button type="button" class="primary" data-to="Pick in #${data.pickTicket}">${icon('pick')} Pick in #${data.pickTicket}</button></div></div>`;
  }

  function renderBubble(api) {
    const p = pin(bubble);
    const marker = api.canvasEl.querySelector(`.pin[data-pin="${bubble}"]`);
    if (!p || !marker) return;
    const b = document.createElement('div');
    b.className = 'b-bubble';
    b.innerHTML =
      `<label for="b-bub-t"><span>Pin ${p.n} · ${esc(anchorLabel(p, st.source))}</span></label>` +
      `<textarea id="b-bub-t" rows="3" placeholder="What about this spot?">${esc(p.note)}</textarea>` +
      `<div class="row"><button type="button" class="ghost" data-b="bub-del">${icon('trash')} Delete</button><span class="spacer"></span>` +
      `<button type="button" class="ghost" data-b="bub-done">Done</button></div>`;
    api.stage.appendChild(b);
    requestAnimationFrame(() => {
      const mr = marker.getBoundingClientRect(), sr = api.stage.getBoundingClientRect();
      let left = mr.left - sr.left + 18, top = mr.top - sr.top - 10;
      left = Math.max(8, Math.min(sr.width - 256, left));
      top = Math.max(8, Math.min(sr.height - 160, top));
      b.style.left = left + 'px'; b.style.top = top + 'px';
    });
    const ta = b.querySelector('textarea'); ta.focus(); ta.setSelectionRange(ta.value.length, ta.value.length);
  }

  function init() {
    shell = WF.Shell.mount(document.getElementById('root'), { state: st, decorate, onCanvasPoint, onPinClick, onReset });
    const root = shell.root;
    root.addEventListener('click', (e) => {
      const t = e.target.closest('button');
      if (!t) return;
      const b = t.dataset.b;
      if (b === 'note') { expand = expand === 'note' ? null : 'note'; shell.render(); const f = root.querySelector('#b-optnote'); f && f.focus(); return; }
      if (b === 'pick') { if (!st.pick) st.pick = { option: data.options[0].id, note: '' }; expand = 'pick'; shell.render(); return; }
      if (b === 'pick-clear') { st.pick = null; expand = null; shell.render(); return; }
      if (b === 'review') { bubble = null; expand = 'review'; shell.render(); return; }
      if (b === 'post') {
        st.posted = { feedback: feedbackCommentHtml(st), pick: st.pick ? pickCommentHtml(st) : '' };
        expand = 'posted'; shell.render(); shell.toast('Posted (simulated)'); return;
      }
      if (b === 'view') { expand = 'posted'; shell.render(); return; }
      if (b === 'collapse') { expand = null; shell.render(); return; }
      if (b === 'bub-del') { st.pins = st.pins.filter((p) => p.n !== bubble); bubble = null; shell.render(); return; }
      if (b === 'bub-done') { bubble = null; shell.render(); return; }
    });
    root.addEventListener('input', (e) => {
      const t = e.target;
      if (t.id === 'b-bub-t' && bubble != null) { const p = pin(bubble); if (p) p.note = t.value; }
      else if (t.id === 'b-optnote') { st.optionNote = t.value; }
      else if (t.id === 'b-pick-note' && st.pick) { st.pick.note = t.value; }
    });
    root.addEventListener('change', (e) => { if (e.target.id === 'b-pick-sel' && st.pick) st.pick.option = e.target.value; });
    root.addEventListener('keydown', (e) => {
      if (e.key !== 'Escape') return;
      if (bubble != null) { bubble = null; shell.render(); e.stopPropagation(); }
      else if (expand) { expand = null; shell.render(); e.stopPropagation(); }
    });
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init);
  else init();
})();
