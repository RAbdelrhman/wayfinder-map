/* Static, sandboxed Round 2. Draft recovery, uploads and posting are simulations. */
(function () {
  const { esc, data, optionName, pct } = WF;
  const root = document.getElementById('root');
  const glyphs = {
    pin: '<path d="M12 21s-6-5-6-10a6 6 0 1 1 12 0c0 5-6 10-6 10z"/><circle cx="12" cy="11" r="2"/>',
    element: '<path d="m4 3 6 17 3-7 7-3z"/>',
    color: '<path d="m14 5 5 5M3 21l4-1L19 8a3 3 0 0 0-4-4L3 16z"/>',
    attach: '<path d="m8 13 7-7a3 3 0 0 1 4 4L9 20a5 5 0 0 1-7-7L13 2"/>',
  };
  const icon = (type) => `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${glyphs[type]}</svg>`;
  const names = { pin: 'Pin', element: 'Select element', color: 'Color picker', attach: 'Attach' };
  const fresh = () => ({ items: [], notes: {}, pick: null, option: 'calm', source: 'engine', size: 'full', hasPick: true, next: 1 });
  let st = fresh();
  let draft = JSON.stringify(st); // In-memory stand-in for Wayfinder's future device-owned draft store.
  let tool = null;
  let editor = null;
  let closed = false;
  let restored = false;
  let posted = null;
  let floatRect = { x: 180, y: 100, w: 650, h: 500 };
  let returnFocus = null;
  const save = () => { draft = JSON.stringify(st); restored = false; syncSave(); };
  const hasDraft = () => st.items.length || Object.values(st.notes).some((note) => note.trim()) || st.pick;
  function syncSave() {
    const status = root.querySelector('#draft-status');
    if (status) status.textContent = restored ? 'Draft restored on this device' : hasDraft() ? 'Draft saved on this device' : 'No unposted feedback';
    const review = root.querySelector('[data-action="review"]');
    if (review) review.disabled = st.source === 'none' || !hasDraft();
  }
  const sourceHint = () => ({
    engine: 'Canvas connected. Choose a tool, then click its target. You can also Tab to a target and press Enter.',
    dom: 'Older canvas. The wrapper reads its elements and options; the same feedback tools are available.',
    page: 'Snapshot. Pins use page locations. Element selection and color sampling are unavailable; Attach and option notes still work.',
    none: 'View only. The feedback bridge did not load. Your saved draft is kept; pins, new feedback and in-canvas picking are unavailable.',
  })[st.source];
  function render(focusSelector) {
    const focus = focusSelector || null;
    const disabled = st.source === 'none';
    root.innerHTML = `<div class="r2-desk"><div class="r2-map"><header><strong>Wayfinder</strong><span>› Map #205</span></header><div class="r2-map-cards"><div>Viewer shell<br><small>Done</small></div><div>Pin, note and pick<br><small>Prototype #210</small></div><div>Build chosen direction<br><small>Needs a decision</small></div></div></div>${closed ? '' : viewerHtml(disabled)}</div>${demoHtml()}`;
    const viewer = root.querySelector('.r2-viewer');
    if (viewer && st.size === 'float') applyFloat();
    if (viewer) {
      root.querySelectorAll('[data-element]').forEach((el) => {
        el.tabIndex = tool ? 0 : -1;
        if (tool) { el.setAttribute('role', 'button'); el.setAttribute('aria-label', `${names[tool]}: ${el.dataset.element}, ${optionName(el.closest('[data-option]').dataset.option)}`); }
      });
      root.querySelectorAll('.r2-marker').forEach((el) => {
        const item = st.items.find((i) => i.id === Number(el.dataset.edit));
        el.style.left = `${item.fx * 100}%`; el.style.top = `${item.fy * 100}%`;
      });
    }
    syncSave();
    if (editor) mountEditor();
    else if (focus) root.querySelector(focus)?.focus({ preventScroll: true });
  }
  function viewerHtml(disabled) {
    const selected = st.option ? optionName(st.option) : 'Board';
    return `<section class="r2-viewer is-${st.size}" aria-label="Canvas: Onboarding" role="${st.size === 'full' ? 'dialog' : 'region'}"${st.size === 'full' ? ' aria-modal="true"' : ''}>
      <div class="r2-chrome${st.size === 'float' ? ' is-drag' : ''}">
        <button class="ghost" data-action="close" aria-label="Close canvas">× <span>Close</span></button>
        <div class="r2-title">${WF.icon('beaker')} Onboarding</div>
        <span class="vw-page">Flows</span>
        <div class="segmented" role="group" aria-label="Canvas options">${['', 'calm', 'bold'].map((id) => `<button class="seg${st.option === id ? ' is-on' : ''}" data-option-go="${id}" aria-pressed="${st.option === id}">${id ? optionName(id) : 'Board'}</button>`).join('')}</div>
        ${st.size === 'float' ? '' : '<button class="iconbtn" data-action="github" aria-label="Open branch on GitHub">↗</button>'}
        <div class="segmented" role="group" aria-label="Canvas size">${[['full','Full window','⛶'],['pane','Side pane','◫'],['float','Floating window','▣']].map(([id,label,symbol]) => `<button class="seg${st.size === id ? ' is-on' : ''}" data-size="${id}" aria-label="${label}" aria-pressed="${st.size === id}">${symbol}</button>`).join('')}</div>
      </div>
      <div class="r2-body"><div class="r2-workspace">
        <div class="r2-tools" role="group" aria-label="Annotation tools">${Object.keys(names).map((id) => {
          const unavailable = disabled || (st.source === 'page' && ['element','color'].includes(id));
          return `<button data-tool="${id}" aria-pressed="${tool === id}"${unavailable ? ' disabled' : ''}>${icon(id)} ${names[id]}</button>`;
        }).join('')}</div>
        <p class="r2-toolhint" role="status">${tool === 'pin' ? 'Click a spot to place a pin. Escape cancels.' : tool === 'element' ? 'Click an element to highlight it and write feedback. Escape cancels.' : tool === 'color' ? 'Click an element to sample its color and suggest a replacement. Escape cancels.' : sourceHint()}</p>
        <div class="r2-canvas">${(st.option ? data.options.filter((o) => o.id === st.option) : data.options).map(optionHtml).join('')}</div>
      </div>${railHtml(disabled, selected)}</div>
      ${['nw','ne','sw','se'].map((corner) => `<span class="r2-grip" data-corner="${corner}" aria-hidden="true"></span>`).join('')}
    </section>`;
  }
  function optionHtml(o) {
    const active = st.items.find((i) => i.id === editor?.id);
    const targetClass = (target) => active?.option === o.id && active?.target === target ? ' is-target' : '';
    return `<article class="r2-option" data-option="${o.id}"><div class="r2-option-header"><strong>${o.name}</strong><span>${o.id}</span></div><div class="r2-design">
      <div class="r2-art${targetClass('Illustration')}" data-element="Illustration">${o.id === 'calm' ? '◌' : '✦'}</div>
      <h2 class="${targetClass('Heading')}" data-element="Heading">${o.id === 'calm' ? 'A clear place to start.' : 'Make your next move.'}</h2>
      <p class="${targetClass('Description')}" data-element="Description">Bring your ideas together, compare directions, and decide what to build next.</p>
      <button type="button" class="r2-cta${targetClass('Get started button')}" data-element="Get started button">Get started</button>
      ${st.items.filter((i) => i.type === 'pin' && i.option === o.id).map((i) => `<button class="r2-marker" data-edit="${i.id}" aria-label="Edit pin ${i.id}: ${esc(i.note || 'No note yet')}">${i.id}</button>`).join('')}
    </div></article>`;
  }
  function targetName(item) {
    if (item.scope === 'canvas') return 'Whole canvas';
    return `${optionName(item.option)} · ${item.target || `Pin ${item.id}`}`;
  }
  function itemSummary(i) {
    if (i.type === 'color') return `${i.current} → ${i.proposed}${i.note ? ' · ' + i.note : ''}`;
    if (i.type === 'attach') return `${i.files.map((f) => f.name).join(', ') || 'No files added'}${i.note ? ' · ' + i.note : ''}`;
    return i.note || 'No note yet';
  }
  function railHtml(disabled, selected) {
    return `<aside class="r2-rail" aria-label="Feedback"><div class="r2-rail-scroll">
      <div class="r2-section"><h2>Feedback</h2><div class="r2-save">${WF.icon('check')}<span id="draft-status" role="status"></span></div></div>
      <div class="r2-section"><div class="r2-heading"><strong>Annotations</strong><span class="count">${st.items.length}</span></div>
      ${st.items.length ? st.items.map((i) => `<div class="r2-item${editor?.id === i.id ? ' is-active' : ''}"><span class="r2-item-number">${i.id}</span><button class="r2-item-main" data-edit="${i.id}"${disabled ? ' disabled' : ''}><small>${names[i.type]} · ${esc(targetName(i))}</small><p>${esc(itemSummary(i))}</p></button><button class="iconbtn" data-delete="${i.id}" aria-label="Delete feedback ${i.id}"${disabled ? ' disabled' : ''}>×</button></div>`).join('') : '<p class="r2-empty">Use an annotation tool to point out a detail, suggest a color, or add a reference.</p>'}</div>
      <div class="r2-section"><label for="r2-note">Option note · ${esc(selected)}</label><textarea id="r2-note" placeholder="Feedback about the overall direction"${disabled ? ' disabled' : ''}>${esc(st.notes[st.option || 'board'] || '')}</textarea></div>
      <div class="r2-section"><div class="r2-pickhead"><strong>Pick a direction</strong>${st.pick ? '<button class="ghost" data-action="clear-pick">Clear</button>' : ''}</div>
      ${!st.hasPick ? '<p class="r2-empty">Picking is unavailable because this prototype has no pick ticket.</p>' : disabled ? '<p class="r2-empty">The canvas is view-only. Continue the decision in the pick ticket.</p><button class="ghost" data-action="pick-ticket">Pick in #211 ↗</button>' : st.pick ? `<div class="r2-field"><label for="r2-pick-option">Option</label><select id="r2-pick-option">${optionOptions(st.pick.option)}</select></div><div class="r2-field"><label for="r2-pick-note">Pick note (optional)</label><textarea id="r2-pick-note" placeholder="Why this direction?">${esc(st.pick.note)}</textarea></div>` : '<p class="r2-empty" style="margin:10px 0">A pick shares your preference in #211. The ticket stays open for discussion.</p><button class="ghost" data-action="pick">Choose option</button>'}</div>
      </div><div class="r2-foot"><button class="primary" data-action="review"${disabled || !hasDraft() ? ' disabled' : ''}>Review before posting</button></div>
    </aside>`;
  }
  const optionOptions = (selected) => data.options.map((o) => `<option value="${o.id}"${o.id === selected ? ' selected' : ''}>${o.name}</option>`).join('');
  function demoHtml() {
    return `<div class="r2-demo" role="group" aria-label="Prototype controls"><strong>Prototype controls</strong>
      <span><label for="r2-source">Canvas source</label><select id="r2-source">${Object.entries(WF.SOURCES).map(([id,s]) => `<option value="${id}"${st.source === id ? ' selected' : ''}>${s.label}</option>`).join('')}</select></span>
      <span><label for="r2-theme">Theme</label><select id="r2-theme"><option value="light"${document.documentElement.dataset.theme !== 'dark' ? ' selected' : ''}>Light</option><option value="dark"${document.documentElement.dataset.theme === 'dark' ? ' selected' : ''}>Dark</option></select></span>
      <button class="ghost" data-action="restart">Simulate app restart</button><button class="ghost" data-action="open">${closed ? 'Reopen canvas' : 'Close and reopen'}</button>
      <button class="ghost" data-action="no-pick">${st.hasPick ? 'Demo: no pick ticket' : 'Restore pick ticket'}</button><button class="ghost" data-action="reset">Reset demo</button>
      <small>Draft recovery, posting and uploads are simulated. No storage or network writes. In the product, Wayfinder will save drafts on this device.</small></div>`;
  }
  function openEditor(value, trigger) {
    returnFocus = trigger || null;
    editor = value;
    render();
  }
  function mountEditor() {
    const item = st.items.find((i) => i.id === editor.id);
    const mode = editor.mode;
    const wrap = document.createElement('div');
    wrap.className = 'r2-modal'; wrap.setAttribute('role','dialog'); wrap.setAttribute('aria-modal','true'); wrap.setAttribute('aria-labelledby','r2-dialog-title');
    let title, content, actions;
    if (mode === 'review' || mode === 'posted') {
      title = mode === 'review' ? 'Review before posting' : 'Posted';
      content = `<p>${mode === 'review' ? `Feedback goes to prototype #210${st.pick && st.hasPick ? ', and your pick goes to #211' : ''}. These are issue comments. Nothing closes a ticket or records a final decision.` : 'Posted result, simulated. No comments were sent to GitHub.'}</p>${mode === 'review' ? commentsHtml() : posted}`;
      actions = mode === 'review' ? '<button class="ghost" data-action="dismiss">Back</button><button class="primary" data-action="post">Post feedback' + (st.pick && st.hasPick ? ' + pick' : '') + '</button>' : '<button class="primary" data-action="dismiss">Done</button>';
    } else {
      title = names[item.type];
      const scopeControl = item.type === 'attach' ? `<div class="r2-field"><label for="r2-attach-target">Attach to</label><select id="r2-attach-target"><option value="canvas">Whole canvas</option>${st.items.filter((i) => ['pin','element'].includes(i.type)).map((i) => `<option value="${i.id}"${item.parent === i.id ? ' selected' : ''}>${esc(targetName(i))}</option>`).join('')}</select></div>` : `<p>${esc(targetName(item))}</p>`;
      const colorControl = item.type === 'color' ? `<div class="r2-color-row"><div class="r2-field"><label>Sampled color</label><div class="r2-color"><span class="r2-swatch" style="background:${item.current}"></span><code>${item.current}</code></div></div><div class="r2-field"><label for="r2-color">Suggested color</label><div class="r2-color"><input id="r2-color" type="color" value="${item.proposed}"><code id="r2-color-code">${item.proposed}</code></div></div></div>` : '';
      const attachmentControl = item.type === 'attach' ? `<div class="r2-field"><label for="r2-files">Files</label><input id="r2-files" type="file" multiple><p class="r2-empty" id="r2-file-list">${esc(item.files.map((f) => f.name).join(', ') || 'No files added')}</p><p class="r2-empty">Demo keeps file names only. Upload and file recovery are not implemented here.</p></div>` : '';
      content = `${scopeControl}${colorControl}${attachmentControl}<div class="r2-field"><label for="r2-editor-note">${item.type === 'color' ? 'What should change?' : 'Note'}</label><textarea id="r2-editor-note" placeholder="Describe your feedback">${esc(item.note)}</textarea></div>`;
      actions = `<button class="ghost" data-delete="${item.id}">Delete</button><button class="primary" data-action="dismiss">Done</button>`;
    }
    wrap.innerHTML = `<div class="r2-sheet"><header><h2 id="r2-dialog-title">${title}</h2></header><div class="r2-content">${content}</div><footer>${actions}</footer></div>`;
    root.querySelector('.r2-desk').appendChild(wrap);
    root.querySelectorAll('.r2-viewer, .r2-demo').forEach((el) => { el.inert = true; });
    (wrap.querySelector('#r2-editor-note') || wrap.querySelector('button')).focus();
    wrap.addEventListener('keydown', (e) => {
      if (e.key !== 'Tab') return;
      const nodes = [...wrap.querySelectorAll('button:not(:disabled),input,select,textarea')];
      const first = nodes[0], last = nodes[nodes.length - 1];
      if (e.shiftKey && document.activeElement === first) { e.preventDefault(); last.focus(); }
      else if (!e.shiftKey && document.activeElement === last) { e.preventDefault(); first.focus(); }
    });
  }
  function commentsHtml() {
    const details = (items) => items.length ? `<ol>${items.map((i) => `<li><strong>${esc(names[i.type])}: ${esc(targetName(i))}</strong><p>${esc(itemSummary(i))}</p>${i.type === 'pin' ? `<p class="meta">Page: Flows (flows); option: ${esc(i.option)}; ${i.anchor === 'page' ? 'page' : 'option'} location: ${pct(i.fx)}, ${pct(i.fy)}</p>` : ''}${i.type === 'attach' ? '<p class="meta">Attachment placeholders. Files are not uploaded in this demo.</p>' : ''}</li>`).join('')}</ol>` : '<p>No annotations.</p>';
    const card = (ticket,title,body) => `<article class="ghcomment"><header class="ghc-head"><strong>ramon</strong> <span>comment on ${ticket}</span></header><div class="ghc-body"><h4>${title}</h4>${body}</div></article>`;
    const notes = Object.entries(st.notes).filter(([,note]) => note.trim()).map(([option,note]) => `<p><strong>Option note · ${esc(option === 'board' ? 'Board' : optionName(option))}</strong></p><p>${esc(note)}</p>`).join('');
    const feedback = st.items.length || notes ? card('#210','Canvas feedback · Onboarding',details(st.items) + notes) : '';
    const pick = st.pick && st.hasPick ? card('#211',`Pick: ${optionName(st.pick.option)} (${st.pick.option})`,`<p>${esc(st.pick.note || '(No pick note)')}</p><p class="meta">Option ID: ${esc(st.pick.option)} · Page: Flows (flows)</p>${details(st.items.filter((i) => i.scope === 'canvas' || i.option === st.pick.option))}<p class="meta">The pick ticket remains open.</p>`) : '';
    return feedback + pick;
  }
  function dismiss() {
    const id = editor?.id;
    editor = null; tool = null; save();
    render(id ? `[data-edit="${id}"]` : returnFocus || '[data-action="review"]');
  }
  function addItem(type, target, event) {
    const option = target.closest('[data-option]').dataset.option;
    const design = target.closest('.r2-design');
    const r = design.getBoundingClientRect();
    const pointer = event instanceof MouseEvent && event.detail > 0;
    const fx = pointer ? (event.clientX - r.left) / r.width : .5;
    const fy = pointer ? (event.clientY - r.top) / r.height : .5;
    const item = { id: st.next++, type, option, target: type === 'pin' ? '' : target.dataset.element, note: '', fx: Math.max(0,Math.min(1,fx)), fy: Math.max(0,Math.min(1,fy)), anchor: st.source === 'page' ? 'page' : 'option' };
    if (type === 'color') {
      const style = getComputedStyle(target);
      const rgb = (style.backgroundColor === 'rgba(0, 0, 0, 0)' ? style.color : style.backgroundColor).match(/\d+/g).slice(0,3);
      item.current = '#' + rgb.map((n) => Number(n).toString(16).padStart(2,'0')).join(''); item.proposed = item.current;
    }
    st.items.push(item); tool = null; save(); openEditor({ mode:'item', id:item.id }, `[data-edit="${item.id}"]`);
  }
  root.addEventListener('click', (e) => {
    const target = e.target.closest('[data-element]');
    if (target && tool && st.source !== 'none') { addItem(tool,target,e); return; }
    if (tool === 'pin' && e.target.closest('.r2-design')) { addItem('pin',e.target.closest('.r2-design').querySelector('[data-element]'),e); return; }
    const b = e.target.closest('button'); if (!b || b.disabled) return;
    if (b.dataset.tool) {
      if (b.dataset.tool === 'attach') { const item = { id:st.next++, type:'attach', scope:'canvas', parent:null, option:null, target:'', files:[], note:'' }; st.items.push(item); save(); openEditor({mode:'item',id:item.id},'[data-tool="attach"]'); }
      else { tool = tool === b.dataset.tool ? null : b.dataset.tool; render(`[data-tool="${b.dataset.tool}"]`); }
      return;
    }
    if (b.dataset.edit) { openEditor({mode:'item',id:Number(b.dataset.edit)},`[data-edit="${b.dataset.edit}"]`); return; }
    if (b.dataset.delete) { const id=Number(b.dataset.delete); st.items = st.items.filter((i) => i.id !== id && i.parent !== id); if (editor?.id === id) editor=null; save(); render('[data-tool="pin"]'); return; }
    if (b.hasAttribute('data-option-go')) { st.option=b.dataset.optionGo; tool=null; save(); render(`[data-option-go="${st.option}"]`); return; }
    if (b.dataset.size) { st.size=b.dataset.size; save(); render(`[data-size="${st.size}"]`); return; }
    switch (b.dataset.action) {
      case 'pick': st.pick={option:st.option || 'calm',note:''}; save(); render('#r2-pick-option'); break;
      case 'clear-pick': st.pick=null; save(); render('[data-action="pick"]'); break;
      case 'review': openEditor({mode:'review'},'[data-action="review"]'); break;
      case 'post': posted=commentsHtml(); openEditor({mode:'posted'}); break;
      case 'dismiss': dismiss(); break;
      case 'restart': st=JSON.parse(draft); restored=!!hasDraft(); closed=false; editor=null; tool=null; render('[data-action="restart"]'); break;
      case 'close': closed=true; editor=null; tool=null; save(); render('[data-action="open"]'); break;
      case 'open': st=JSON.parse(draft); restored=!!hasDraft(); closed=false; editor=null; tool=null; render('[data-action="close"]'); break;
      case 'no-pick': st.hasPick=!st.hasPick; save(); render('[data-action="no-pick"]'); break;
      case 'reset': st=fresh(); draft=JSON.stringify(st); restored=false; editor=null; tool=null; closed=false; posted=null; render('[data-action="reset"]'); break;
      case 'github': Kit.toast('Would open the branch on GitHub'); break;
      case 'pick-ticket': Kit.toast('Would open pick ticket #211 inside Wayfinder'); break;
    }
  });
  root.addEventListener('input', (e) => {
    const el=e.target;
    if (el.id === 'r2-note') st.notes[st.option || 'board']=el.value;
    if (el.id === 'r2-pick-note' && st.pick) st.pick.note=el.value;
    if (el.id === 'r2-editor-note') st.items.find((i) => i.id === editor.id).note=el.value;
    if (el.id === 'r2-color') { st.items.find((i) => i.id === editor.id).proposed=el.value; root.querySelector('#r2-color-code').textContent=el.value; }
    save();
  });
  root.addEventListener('change', (e) => {
    const el=e.target;
    if (el.id === 'r2-theme') { document.documentElement.dataset.theme=el.value; return; }
    if (el.id === 'r2-source') { st.source=el.value; tool=null; save(); render('#r2-source'); }
    if (el.id === 'r2-pick-option' && st.pick) { st.pick.option=el.value; save(); }
    if (el.id === 'r2-attach-target') {
      const item=st.items.find((i) => i.id === editor.id), parent=st.items.find((i) => i.id === Number(el.value));
      item.scope=parent ? 'target' : 'canvas'; item.parent=parent?.id || null; item.option=parent?.option || null; item.target=parent ? parent.target || `Pin ${parent.id}` : ''; save();
    }
    if (el.id === 'r2-files') { const item=st.items.find((i) => i.id === editor.id); item.files=[...el.files].map((f) => ({name:f.name,size:f.size,type:f.type})); root.querySelector('#r2-file-list').textContent=item.files.map((f) => f.name).join(', '); save(); }
  });
  root.addEventListener('keydown', (e) => {
    if (e.key === 'Enter' && e.target.matches('[data-element]') && tool && e.target.tagName !== 'BUTTON') { e.preventDefault(); addItem(tool,e.target,e); }
    if (e.key === 'Escape') { e.preventDefault(); if (editor) dismiss(); else if (tool) { tool=null; render('[data-tool="pin"]'); } else { closed=true; save(); render('[data-action="open"]'); } }
  });
  function applyFloat() {
    const desk=root.querySelector('.r2-desk');
    floatRect.w=Math.min(floatRect.w,desk.clientWidth); floatRect.h=Math.min(floatRect.h,desk.clientHeight);
    floatRect.x=Math.max(0,Math.min(floatRect.x,desk.clientWidth-floatRect.w)); floatRect.y=Math.max(0,Math.min(floatRect.y,desk.clientHeight-floatRect.h));
    const el=root.querySelector('.is-float'); if (el) Object.assign(el.style,{left:floatRect.x+'px',top:floatRect.y+'px',width:floatRect.w+'px',height:floatRect.h+'px'});
  }
  let drag=null;
  root.addEventListener('pointerdown',(e) => {
    if (st.size !== 'float' || e.button !== 0 || e.target.closest('button,select,input,textarea')) return;
    const grip=e.target.closest('[data-corner]'), chrome=e.target.closest('.is-drag');
    if (!grip && !chrome) return;
    e.preventDefault(); const el=root.querySelector('.r2-viewer'); el.setPointerCapture(e.pointerId);
    drag={id:e.pointerId,x:e.clientX,y:e.clientY,rect:{...floatRect},corner:grip?.dataset.corner || ''};
  });
  root.addEventListener('pointermove',(e) => {
    if (!drag || drag.id !== e.pointerId) return;
    const dx=e.clientX-drag.x,dy=e.clientY-drag.y,r=drag.rect,c=drag.corner;
    if (!c) floatRect={...r,x:r.x+dx,y:r.y+dy};
    else { floatRect={...r}; if(c.includes('e')) floatRect.w=Math.max(300,r.w+dx); if(c.includes('s')) floatRect.h=Math.max(300,r.h+dy); if(c.includes('w')) {floatRect.w=Math.max(300,r.w-dx);floatRect.x=r.x+r.w-floatRect.w;} if(c.includes('n')) {floatRect.h=Math.max(300,r.h-dy);floatRect.y=r.y+r.h-floatRect.h;} }
    applyFloat();
  });
  ['pointerup','pointercancel','lostpointercapture'].forEach((type) => root.addEventListener(type,() => {drag=null;}));
  window.addEventListener('resize',() => {if(st.size==='float') applyFloat();});
  render();
})();
