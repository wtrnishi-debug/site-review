const SR = {
  sessionId:   null,
  siteUrl:     null,
  annotating:  false,
  userName:    '',
  comments:    [],
  pins:        {},
  selectedId:  null
};

let _intentionalLoad = false;

// ── Init ──────────────────────────────────────────────
(async function init() {
  SR.userName = localStorage.getItem('sr_username') || '';
  updateUsernameLabel();

  const p = new URLSearchParams(location.search);
  const sid = p.get('s');
  const url = p.get('url');

  if (sid && url) {
    SR.sessionId = sid;
    SR.siteUrl   = decodeURIComponent(url);
    document.getElementById('sr-url-input').value = SR.siteUrl;
    showFrame(SR.siteUrl);
    await loadComments();
  }

  document.getElementById('sr-open-btn').addEventListener('click', handleOpen);
  document.getElementById('sr-url-input').addEventListener('keydown', e => { if (e.key === 'Enter') handleOpen(); });
  document.getElementById('sr-mode-btn').addEventListener('click', toggleAnnotation);
  document.getElementById('sr-user-btn').addEventListener('click', toggleNamePanel);
  document.getElementById('sr-share-btn').addEventListener('click', shareSession);
  const overlay = document.getElementById('sr-overlay');
  overlay.addEventListener('click', onOverlayClick);

  let _scrollTimer = null;
  window.addEventListener('wheel', () => {
    if (!SR.annotating) return;
    overlay.style.pointerEvents = 'none';
    clearTimeout(_scrollTimer);
    _scrollTimer = setTimeout(() => {
      if (SR.annotating) overlay.style.pointerEvents = '';
    }, 250);
  }, { passive: true, capture: true });

  document.getElementById('sr-frame').addEventListener('load', handleFrameNavigation);
})();

// ── Frame navigation ──────────────────────────────────
function handleFrameNavigation() {
  if (_intentionalLoad) { _intentionalLoad = false; return; }
  if (!SR.siteUrl) return;
  _intentionalLoad = true;
  document.getElementById('sr-frame').src = SR.siteUrl;
  showToast('別ページへはURLバーから移動してください');
}

// ── URL / Session ─────────────────────────────────────
async function handleOpen() {
  let url = document.getElementById('sr-url-input').value.trim();
  if (!url) return;
  if (!/^https?:\/\//i.test(url)) url = 'https://' + url;
  document.getElementById('sr-url-input').value = url;

  clearPins();
  SR.comments = [];
  SR.selectedId = null;
  renderSidebar();

  try {
    const session = await sr_createSession(url);
    SR.sessionId = session.id;
    SR.siteUrl   = url;
    updateUrlParams();
    showFrame(url);
    await loadComments();
  } catch {
    showToast('セッションの作成に失敗しました');
  }
}

function showFrame(url) {
  document.getElementById('sr-empty').style.display = 'none';
  const frame = document.getElementById('sr-frame');
  frame.style.display = 'block';
  _intentionalLoad = true;
  frame.src = url;
}

function updateUrlParams() {
  const p = new URLSearchParams();
  if (SR.sessionId) p.set('s', SR.sessionId);
  if (SR.siteUrl)   p.set('url', encodeURIComponent(SR.siteUrl));
  history.replaceState(null, '', '?' + p.toString());
}

// ── Annotation mode ───────────────────────────────────
function toggleAnnotation() {
  SR.annotating = !SR.annotating;
  const overlay = document.getElementById('sr-overlay');
  const btn     = document.getElementById('sr-mode-btn');
  overlay.classList.toggle('sr-active', SR.annotating);
  btn.classList.toggle('sr-active', SR.annotating);
  btn.querySelector('span').textContent = SR.annotating ? 'コメント中' : 'コメント';
  if (!SR.annotating) closePopover();
}

// ── Overlay click → add pin ───────────────────────────
function onOverlayClick(e) {
  if (!SR.annotating || !SR.sessionId) return;
  if (e.target.classList.contains('sr-pin') || e.target.classList.contains('sr-pnum')) return;

  if (document.getElementById('sr-popover')) {
    closePopover();
    return;
  }
  if (!SR.userName) {
    showCursorAlert(e.clientX, e.clientY, '先に名前を設定してください');
    toggleNamePanel();
    return;
  }

  const rect = document.getElementById('sr-overlay').getBoundingClientRect();
  const xPct = ((e.clientX - rect.left)  / rect.width)  * 100;
  const yPct = ((e.clientY - rect.top)   / rect.height) * 100;
  openCommentForm(xPct, yPct, e.clientX, e.clientY);
}

// ── Comment form popover ──────────────────────────────
function openCommentForm(xPct, yPct, cx, cy) {
  const pop = createPopover(`
    <div class="sr-pop-hdr">
      <span class="sr-pop-title">新しいコメント</span>
      <button class="sr-pop-close" id="sr-pop-x">✕</button>
    </div>
    <div class="sr-pop-body">
      <textarea class="sr-ta" id="sr-new-text" placeholder="コメントを入力…"></textarea>
      <div class="sr-err" id="sr-new-err"></div>
      <div class="sr-pop-actions">
        <button class="sr-btn-cancel" id="sr-new-cancel">キャンセル</button>
        <button class="sr-btn-submit" id="sr-new-submit">追加</button>
      </div>
    </div>`);

  positionPopover(pop, cx, cy);

  document.getElementById('sr-pop-x').addEventListener('click', closePopover);
  document.getElementById('sr-new-cancel').addEventListener('click', closePopover);
  document.getElementById('sr-new-text').focus();

  document.getElementById('sr-new-submit').addEventListener('click', async () => {
    const text = document.getElementById('sr-new-text').value.trim();
    if (!text) return;
    const btn = document.getElementById('sr-new-submit');
    btn.disabled = true; btn.textContent = '追加中…';

    const comment = await sr_addComment({
      session_id: SR.sessionId,
      x_percent: xPct,
      y_percent: yPct,
      text,
      author: SR.userName
    });

    if (!comment) {
      btn.disabled = false; btn.textContent = '追加';
      const err = document.getElementById('sr-new-err');
      if (err) err.textContent = '送信に失敗しました';
      return;
    }
    SR.comments.push(comment);
    addPin(comment);
    renderSidebar();
    closePopover();
  });
}

// ── Comment detail popover ────────────────────────────
async function openCommentDetail(comment, cx, cy) {
  SR.selectedId = comment.id;
  highlightPin(comment.id);
  highlightListItem(comment.id);

  const replies = await sr_getReplies(comment.id);
  const num = SR.comments.findIndex(c => c.id === comment.id) + 1;
  const stLabel = { open: '未対応', fixed: '対応済', verified: '確認完了', rejected: '差し戻し' };
  const stTrans = {
    open:     [{ to: 'fixed',    label: '対応済にする' }],
    fixed:    [{ to: 'verified', label: '確認完了にする' }, { to: 'rejected', label: '差し戻す' }],
    verified: [{ to: 'open',     label: '未対応に戻す' }, { to: 'rejected', label: '差し戻す' }],
    rejected: [{ to: 'fixed',    label: '再対応済にする' }]
  };
  const transHtml = (stTrans[comment.status] || [])
    .map(t => `<button class="sr-st-btn sr-st-to-${t.to}" data-id="${comment.id}" data-next="${t.to}">${t.label}</button>`)
    .join('');

  const repliesHtml = replies.map(r => `
    <div class="sr-reply-card">
      <div class="sr-meta"><span class="sr-author">${esc(r.author)}</span></div>
      <div class="sr-text">${esc(r.text)}</div>
    </div>`).join('');

  const pop = createPopover(`
    <div class="sr-pop-hdr">
      <div class="sr-hdr-left">
        <span class="sr-pop-title">コメント #${num}</span>
        <span class="sr-hdr-status sr-st-${comment.status}">${stLabel[comment.status]}</span>
      </div>
      <button class="sr-pop-close" id="sr-pop-x">✕</button>
    </div>
    <div class="sr-pop-scroll">
      <div class="sr-comment-card">
        <div class="sr-meta"><span class="sr-author">${esc(comment.author)}</span></div>
        <div class="sr-text">${esc(comment.text)}</div>
        <div class="sr-det-actions">
          ${transHtml}
          ${comment.author === SR.userName ? `<button class="sr-del-btn" data-id="${comment.id}">🗑 削除</button>` : ''}
        </div>
      </div>
      ${repliesHtml ? `<div class="sr-replies">${repliesHtml}</div>` : ''}
      <div class="sr-rform">
        <textarea class="sr-ta" id="sr-reply-text" placeholder="返信を入力…" style="min-height:56px"></textarea>
        <div class="sr-err" id="sr-reply-err"></div>
        <div class="sr-pop-actions">
          <button class="sr-btn-submit" id="sr-reply-submit">返信</button>
        </div>
      </div>
    </div>`);

  positionPopover(pop, cx, cy);

  document.getElementById('sr-pop-x').addEventListener('click', closePopover);

  pop.querySelector('.sr-del-btn')?.addEventListener('click', async e => {
    if (!confirm('このコメントを削除しますか？')) return;
    const cid = e.currentTarget.dataset.id;
    await sr_deleteComment(cid);
    SR.comments = SR.comments.filter(c => c.id !== cid);
    SR.pins[cid]?.remove();
    delete SR.pins[cid];
    renderSidebar();
    closePopover();
  });

  pop.querySelectorAll('.sr-st-btn').forEach(btn => {
    btn.addEventListener('click', async e => {
      const newSt = e.currentTarget.dataset.next;
      const cid   = e.currentTarget.dataset.id;
      await sr_updateStatus(cid, newSt);
      const c = SR.comments.find(c => c.id === cid);
      if (c) {
        c.status = newSt;
        const pin = SR.pins[cid];
        if (pin) { pin.className = `sr-pin sr-pin-${newSt} sr-pin-sel`; }
      }
      renderSidebar();
      openCommentDetail({ ...comment, status: newSt }, cx, cy);
    });
  });

  document.getElementById('sr-reply-submit').addEventListener('click', async () => {
    const text = document.getElementById('sr-reply-text').value.trim();
    if (!text) return;
    const btn = document.getElementById('sr-reply-submit');
    btn.disabled = true; btn.textContent = '送信中…';
    const reply = await sr_addComment({
      session_id: SR.sessionId,
      x_percent: comment.x_percent,
      y_percent: comment.y_percent,
      text, author: SR.userName,
      parent_id: comment.id
    });
    if (!reply) {
      btn.disabled = false; btn.textContent = '返信';
      const err = document.getElementById('sr-reply-err');
      if (err) err.textContent = '送信に失敗しました';
      return;
    }
    openCommentDetail(comment, cx, cy);
  });
}

// ── Popover helpers ───────────────────────────────────
function createPopover(html) {
  document.getElementById('sr-popover')?.remove();
  const pop = document.createElement('div');
  pop.id = 'sr-popover';
  pop.className = 'sr-pop';
  pop.innerHTML = html;
  document.body.appendChild(pop);
  return pop;
}

function positionPopover(pop, cx, cy) {
  const OFFSET = 14;
  pop.style.left = (cx + OFFSET) + 'px';
  pop.style.top  = (cy + OFFSET) + 'px';
  requestAnimationFrame(() => {
    const pw = pop.offsetWidth, ph = pop.offsetHeight;
    const vw = window.innerWidth,  vh = window.innerHeight;
    let left = cx + OFFSET, top = cy + OFFSET;
    if (left + pw > vw - 8)  left = cx - pw - OFFSET;
    if (top  + ph > vh - 8)  top  = cy - ph - OFFSET;
    pop.style.left = Math.max(8, left) + 'px';
    pop.style.top  = Math.max(60, top) + 'px';
  });
}

function closePopover() {
  document.getElementById('sr-popover')?.remove();
  if (SR.selectedId) {
    SR.pins[SR.selectedId]?.classList.remove('sr-pin-sel');
    SR.selectedId = null;
  }
  document.querySelectorAll('.sr-list-item').forEach(el => el.classList.remove('sr-list-sel'));
}

// ── Pins ──────────────────────────────────────────────
function addPin(comment) {
  const overlay = document.getElementById('sr-overlay');
  if (!overlay) return;
  const num = SR.comments.findIndex(c => c.id === comment.id) + 1;
  const pin = document.createElement('div');
  pin.className = `sr-pin sr-pin-${comment.status}`;
  pin.dataset.id = comment.id;
  pin.style.left = comment.x_percent + '%';
  pin.style.top  = comment.y_percent + '%';
  pin.innerHTML  = `<span class="sr-pnum">${num}</span>`;

  pin.addEventListener('click', e => {
    e.stopPropagation();
    if (document.getElementById('sr-popover')) { closePopover(); return; }
    openCommentDetail(comment, e.clientX, e.clientY);
  });

  overlay.appendChild(pin);
  SR.pins[comment.id] = pin;
}

function clearPins() {
  Object.values(SR.pins).forEach(p => p.remove());
  SR.pins = {};
}

function highlightPin(id) {
  Object.values(SR.pins).forEach(p => p.classList.remove('sr-pin-sel'));
  SR.pins[id]?.classList.add('sr-pin-sel');
}

// ── Load comments ─────────────────────────────────────
async function loadComments() {
  if (!SR.sessionId) return;
  SR.comments = await sr_getComments(SR.sessionId);
  clearPins();
  SR.comments.forEach(addPin);
  renderSidebar();
}

// ── Sidebar ───────────────────────────────────────────
function renderSidebar() {
  const list  = document.getElementById('sr-comment-list');
  const badge = document.getElementById('sr-count-badge');
  badge.textContent = SR.comments.length;

  if (!SR.comments.length) {
    list.innerHTML = '<p class="sr-list-empty">コメントはまだありません</p>';
    return;
  }
  const stLabel = { open: '未対応', fixed: '対応済', verified: '確認完了', rejected: '差し戻し' };
  list.innerHTML = SR.comments.map((c, i) => `
    <div class="sr-list-item${c.id === SR.selectedId ? ' sr-list-sel' : ''}" data-id="${c.id}">
      <div class="sr-list-meta">
        <div class="sr-list-num sr-num-${c.status}">${i + 1}</div>
        <span class="sr-list-author">${esc(c.author)}</span>
        <span class="sr-list-status sr-st-${c.status}">${stLabel[c.status]}</span>
      </div>
      <div class="sr-list-text">${esc(c.text)}</div>
    </div>`).join('');

  list.querySelectorAll('.sr-list-item').forEach(el => {
    el.addEventListener('click', () => {
      const comment = SR.comments.find(c => c.id === el.dataset.id);
      if (!comment) return;
      const pin = SR.pins[comment.id];
      const cx = pin ? parseFloat(pin.style.left) / 100 * document.getElementById('sr-overlay').offsetWidth : window.innerWidth / 2;
      const cy = pin ? parseFloat(pin.style.top)  / 100 * document.getElementById('sr-overlay').offsetHeight : window.innerHeight / 2;
      const rect = document.getElementById('sr-overlay').getBoundingClientRect();
      openCommentDetail(comment, rect.left + cx, rect.top + cy);
    });
  });
}

function highlightListItem(id) {
  document.querySelectorAll('.sr-list-item').forEach(el => {
    el.classList.toggle('sr-list-sel', el.dataset.id === id);
  });
}

// ── Username ──────────────────────────────────────────
function updateUsernameLabel() {
  const label = document.getElementById('sr-username-label');
  if (label) label.textContent = SR.userName || '名前を設定';
}

function toggleNamePanel() {
  const existing = document.getElementById('sr-name-panel');
  if (existing) { existing.remove(); return; }

  const panel = document.createElement('div');
  panel.id = 'sr-name-panel';
  panel.innerHTML = `
    <input type="text" class="sr-name-inp" id="sr-name-inp"
      value="${esc(SR.userName)}" placeholder="名前を入力" maxlength="20">
    <button class="sr-name-ok" id="sr-name-ok">確定</button>`;
  document.body.appendChild(panel);

  const inp = document.getElementById('sr-name-inp');
  inp.focus();
  if (SR.userName) inp.select();

  const commit = () => {
    const name = inp.value.trim();
    if (name) { SR.userName = name; localStorage.setItem('sr_username', name); }
    updateUsernameLabel();
    panel.remove();
  };
  document.getElementById('sr-name-ok').addEventListener('click', commit);
  inp.addEventListener('keydown', e => {
    if (e.key === 'Enter') { e.preventDefault(); commit(); }
    if (e.key === 'Escape') panel.remove();
  });
}

// ── Share ─────────────────────────────────────────────
function shareSession() {
  if (!SR.sessionId) { showToast('先にURLを開いてください'); return; }
  navigator.clipboard.writeText(location.href)
    .then(() => showToast('URLをコピーしました'))
    .catch(() => showToast('コピーできませんでした'));
}

// ── Toast ─────────────────────────────────────────────
let toastTimer = null;
function showToast(msg) {
  const el = document.getElementById('sr-toast');
  el.textContent = msg;
  el.classList.add('sr-show');
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => el.classList.remove('sr-show'), 2000);
}

// ── Cursor alert ──────────────────────────────────────
function showCursorAlert(cx, cy, msg) {
  document.querySelector('.sr-cursor-alert')?.remove();
  const el = document.createElement('div');
  el.className = 'sr-cursor-alert';
  el.textContent = msg;
  el.style.left = (cx + 12) + 'px';
  el.style.top  = (cy - 36) + 'px';
  document.body.appendChild(el);
  setTimeout(() => el.remove(), 2500);
}

// ── Utility ───────────────────────────────────────────
function esc(str) {
  return String(str ?? '')
    .replace(/&/g,'&amp;').replace(/</g,'&lt;')
    .replace(/>/g,'&gt;').replace(/"/g,'&quot;');
}
