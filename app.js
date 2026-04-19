/* ============================================================
   Tasks App — app.js
   Vanilla JS, zero dependencies.

   Data model
   ----------
   Task {
     id:       number          -- auto-incremented
     title:    string
     color:    string          -- colour id, e.g. 'purple'
     priority: boolean         -- flagged as priority
     from:     string          -- who requested the task
     due:      string          -- ISO date string, e.g. '2025-06-01'
     prio:     string          -- priority level: 'high' | 'medium' | 'low' | ''
     group:    string          -- group id, or '' for ungrouped
     notes:    string
     done:     boolean
     created:  string          -- ISO datetime string
   }

   Group {
     id:    string             -- e.g. 'g1715000000000'
     name:  string
     color: string             -- hex colour
   }

   Storage
   -------
   Tasks and groups are persisted to localStorage so they survive
   page refreshes. Keys: 'tasks-app:tasks', 'tasks-app:groups'
   ============================================================ */

/* ── Colour palette ── */
const COLS = [
  { id: 'purple', h: '#7f77dd' },
  { id: 'teal',   h: '#1d9e75' },
  { id: 'coral',  h: '#d85a30' },
  { id: 'amber',  h: '#ef9f27' },
  { id: 'blue',   h: '#378add' },
  { id: 'pink',   h: '#d4537e' },
  { id: 'gray',   h: '#888780' },
];

/* ── State ── */
let tasks        = [];
let groups       = [];
let activeGroup  = 'all';
let activeFilter = 'open';  // 'open' | 'priority' | 'done' | 'all'
let dragTaskId   = null;
let dragGroupId  = null;
let gbarAddOpen  = false;
let selGBarColor = 'purple';
let editId       = null;    // task id being edited, null when creating
let nextId       = 1;
let selSettingsGroupColor  = 'purple';
let selSettingsPeopleColor = 'purple';
let profile                = { name: '', emoji: '', slackWebhook: '', slackTeamId: '' };
let pingPersonId           = null;
let people                 = [];
let activeSettingsSection  = 'general';
let prioChecked  = false;    // state of priority checkbox in popup
let dueSel       = '';       // '' | 'today' | 'week' | 'date'

/* ── Persistence (localStorage) ── */
function persist() {
  try {
    localStorage.setItem('tasks-app:tasks',   JSON.stringify(tasks));
    localStorage.setItem('tasks-app:groups',  JSON.stringify(groups));
    localStorage.setItem('tasks-app:people',  JSON.stringify(people));
    localStorage.setItem('tasks-app:profile', JSON.stringify(profile));
    localStorage.setItem('tasks-app:nextId',  String(nextId));
  } catch (_) { /* storage unavailable */ }
}

function loadFromStorage() {
  try {
    const t = localStorage.getItem('tasks-app:tasks');
    const g = localStorage.getItem('tasks-app:groups');
    const n = localStorage.getItem('tasks-app:nextId');
    const pe = localStorage.getItem('tasks-app:people');
    const pr = localStorage.getItem('tasks-app:profile');
    if (t)  tasks   = JSON.parse(t);
    if (g)  groups  = JSON.parse(g);
    if (pe) people  = JSON.parse(pe);
    if (pr) profile = JSON.parse(pr);
    if (n)  nextId  = parseInt(n, 10) || 1;
  } catch (_) { /* ignore corrupt data */ }
}

const ORANGE = '#f0882a';

/* ── Helpers ── */
function gc(id) {
  return (COLS.find(c => c.id === id) || COLS[0]).h;
}

function taskColor(t) {
  if (t.group) {
    const g = groups.find(g => g.id === t.group);
    if (g) return g.color;
  }
  return ORANGE;
}

function toDateStr(d) {
  return d.getFullYear() + '-' +
    String(d.getMonth() + 1).padStart(2, '0') + '-' +
    String(d.getDate()).padStart(2, '0');
}
function getToday()     { return toDateStr(new Date()); }
function getEndOfWeek() {
  const d = new Date();
  const toSunday = (7 - d.getDay()) % 7;
  d.setDate(d.getDate() + (toSunday || 7));
  return toDateStr(d);
}

function selectDue(type) {
  const input = document.getElementById('p-due');
  if (dueSel === type) {
    dueSel = '';
    input.value = '';
  } else {
    dueSel = type;
    if (type === 'today') input.value = getToday();
    else if (type === 'week') input.value = getEndOfWeek();
  }
  updateDueBtns();
}

function onDueInputChange() {
  const val = document.getElementById('p-due').value;
  if (!val)                  dueSel = '';
  else if (val === getToday())      dueSel = 'today';
  else if (val === getEndOfWeek())  dueSel = 'week';
  else                       dueSel = 'date';
  updateDueBtns();
}

function updateDueBtns() {
  document.getElementById('due-today').classList.toggle('on', dueSel === 'today');
  document.getElementById('due-week').classList.toggle('on',  dueSel === 'week');
}

function esc(s) {
  return String(s || '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;');
}

function dueTxt(due) {
  if (!due) return null;
  const d    = new Date(due);
  const now  = new Date();
  const diff = Math.round((d - now) / 864e5);
  const label = d.toLocaleDateString('en-GB', { day: 'numeric', month: 'short' });
  const cls  = diff < 0 ? 'ov' : diff <= 2 ? 'sn' : '';
  const pre  = diff < 0 ? 'Overdue · ' : diff === 0 ? 'Today · ' : diff <= 2 ? diff + 'd · ' : '';
  return { label: pre + label, cls };
}

/* ── Colour picker ── */
function renderColorPicker(elId, cur, onPick) {
  const el = document.getElementById(elId);
  el.innerHTML = '';
  COLS.forEach(c => {
    const d = document.createElement('div');
    d.className = 'csw' + (cur === c.id ? ' sel' : '');
    d.style.background = c.h;
    d.title = c.id;
    d.onclick = () => { onPick(c.id); renderColorPicker(elId, c.id, onPick); };
    el.appendChild(d);
  });
}

/* ── Pill filter ── */
function setFilter(f) {
  activeFilter = f;
  ['priority', 'open', 'done', 'all'].forEach(x => {
    document.getElementById('pill-' + x).classList.toggle('active', activeFilter === x);
  });
  renderList();
}

/* ── Group tab bar ── */
function renderGBar() {
  const bar = document.getElementById('gbar');
  bar.innerHTML = '';
  bar.style.display = 'flex';
  if (!groups.length) {
    const addBtn = makeGBarAddBtn();
    bar.appendChild(addBtn);
    return;
  }

  const all = document.createElement('button');
  all.className = 'gtab' + (activeGroup === 'all' ? ' active' : '');
  all.textContent = 'All groups';
  all.onclick = () => selGroup('all');
  bar.appendChild(all);

  groups.forEach(g => {
    const b = document.createElement('button');
    b.className = 'gtab' + (activeGroup === g.id ? ' active' : '');
    b.dataset.gid = g.id;
    b.draggable = true;
    b.innerHTML = `<span class="gdot" style="background:${g.color}"></span>${g.emoji ? g.emoji + ' ' : ''}${esc(g.name)}`;
    b.onclick = () => { if (!dragGroupId) selGroup(g.id); };

    b.addEventListener('dragstart', e => {
      dragGroupId = g.id;
      dragTaskId  = null;
      e.dataTransfer.effectAllowed = 'move';
      b.classList.add('gdrag-source');
    });
    b.addEventListener('dragend', () => {
      dragGroupId = null;
      bar.querySelectorAll('.gtab').forEach(t => t.classList.remove('gdrag-before', 'gdrag-after', 'gdrag-source'));
    });

    b.addEventListener('dragover', e => {
      e.preventDefault();
      if (dragGroupId && dragGroupId !== g.id) {
        bar.querySelectorAll('.gtab').forEach(t => t.classList.remove('gdrag-before', 'gdrag-after'));
        const rect = b.getBoundingClientRect();
        const mid  = rect.left + rect.width / 2;
        if (e.clientX < mid) b.classList.add('gdrag-before');
        else                  b.classList.add('gdrag-after');
      } else if (dragTaskId) {
        b.classList.add('gdrop');
      }
    });
    b.addEventListener('dragleave', () => {
      b.classList.remove('gdrop', 'gdrag-before', 'gdrag-after');
    });
    b.addEventListener('drop', e => {
      e.preventDefault();
      b.classList.remove('gdrop', 'gdrag-before', 'gdrag-after');
      if (dragGroupId && dragGroupId !== g.id) {
        const fromIdx = groups.findIndex(x => x.id === dragGroupId);
        const toIdx   = groups.findIndex(x => x.id === g.id);
        if (fromIdx === -1 || toIdx === -1) return;
        const rect = b.getBoundingClientRect();
        const mid  = rect.left + rect.width / 2;
        const insertAfter = e.clientX >= mid;
        const [moved] = groups.splice(fromIdx, 1);
        const finalIdx = groups.findIndex(x => x.id === g.id);
        groups.splice(insertAfter ? finalIdx + 1 : finalIdx, 0, moved);
        dragGroupId = null;
        persist();
        renderGBar();
        renderList();
      } else if (dragTaskId) {
        taskDropOnGroup(e, g.id);
      }
    });

    bar.appendChild(b);
  });

  bar.appendChild(makeGBarAddBtn());
}

function makeGBarAddBtn() {
  const btn = document.createElement('button');
  btn.className = 'gtab-add';
  btn.title = 'Add group';
  btn.innerHTML = `<svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round"><line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/></svg>`;
  btn.onclick = e => { e.stopPropagation(); openGBarAdd(btn); };
  return btn;
}

function openGBarAdd(btn) {
  if (gbarAddOpen) { closeGBarAdd(); return; }
  gbarAddOpen  = true;
  selGBarColor = 'purple';

  let panel = document.getElementById('gbar-add-panel');
  if (!panel) {
    panel = document.createElement('div');
    panel.id = 'gbar-add-panel';
    document.body.appendChild(panel);
  }

  panel.innerHTML = `
    <div class="gap-row1">
      <input type="text" id="gap-emoji" class="sp-input sp-emoji-input" placeholder="📁" maxlength="2" />
      <input type="text" id="gap-name" class="sp-input gap-name-input" placeholder="Group name..."
             onkeydown="if(event.key==='Enter')submitGBarAdd();if(event.key==='Escape')closeGBarAdd()" />
    </div>
    <div class="crow" id="gap-colors"></div>
    <div class="gap-actions">
      <button class="btn-cancel" onclick="closeGBarAdd()">Cancel</button>
      <button class="btn-add" onclick="submitGBarAdd()">Add</button>
    </div>`;

  renderColorPicker('gap-colors', selGBarColor, id => { selGBarColor = id; });

  const rect = btn.getBoundingClientRect();
  panel.style.top   = (rect.bottom + 6) + 'px';
  panel.style.right = (window.innerWidth - rect.right) + 'px';
  panel.classList.add('vis');

  setTimeout(() => document.getElementById('gap-name')?.focus(), 50);
  setTimeout(() => document.addEventListener('click', gbarAddOutsideClick), 0);
}

function gbarAddOutsideClick(e) {
  const panel = document.getElementById('gbar-add-panel');
  if (panel && !panel.contains(e.target)) closeGBarAdd();
}

function closeGBarAdd() {
  gbarAddOpen = false;
  document.getElementById('gbar-add-panel')?.classList.remove('vis');
  document.removeEventListener('click', gbarAddOutsideClick);
}

function submitGBarAdd() {
  const name  = document.getElementById('gap-name')?.value.trim();
  const emoji = document.getElementById('gap-emoji')?.value.trim();
  if (!name) return;
  groups.push({ id: 'g' + Date.now(), name, emoji: emoji || '', color: gc(selGBarColor) });
  persist();
  closeGBarAdd();
  renderGBar();
  renderList();
  renderGroupSelect();
}

function selGroup(id) {
  activeGroup = id;
  renderGBar();
  renderList();
}

/* ── Group chips (inside popup) ── */
function renderGroupChips() {
  const el = document.getElementById('group-chips');
  if (!el) return;
  if (!groups.length) { el.innerHTML = ''; return; }
  const cur = document.getElementById('p-group').value;
  el.innerHTML = groups.map(g =>
    `<button type="button" class="group-chip${cur === g.id ? ' sel' : ''}"
             data-id="${g.id}"
             style="border-color:${g.color}40;color:${g.color};--gc:${g.color}"
             onclick="selectGroupChip('${g.id}')">
      ${esc(g.name)}
    </button>`
  ).join('');
}

function selectGroupChip(id) {
  const inp = document.getElementById('p-group');
  inp.value = inp.value === id ? '' : id;
  renderGroupChips();
}

function renderGroupSelect() { renderGroupChips(); }

/* ── Settings ── */
function openSettings(section) {
  activeSettingsSection = section || 'general';
  document.getElementById('settings-overlay').classList.add('vis');
  showSettingsSection(activeSettingsSection);
  selSettingsGroupColor  = 'purple';
  selSettingsPeopleColor = 'purple';
  renderColorPicker('sps-g-colors', selSettingsGroupColor,  id => { selSettingsGroupColor  = id; });
  renderColorPicker('sps-p-colors', selSettingsPeopleColor, id => { selSettingsPeopleColor = id; });
  document.getElementById('sps-name').value         = profile.name  || '';
  document.getElementById('sps-emoji').value        = profile.emoji || '';
  document.getElementById('sps-emoji-display').textContent = profile.emoji || '😀';
  document.getElementById('sps-slack-webhook').value = profile.slackWebhook || '';
  document.getElementById('sps-slack-team').value    = profile.slackTeamId  || '';
}

function closeSettings() {
  document.getElementById('settings-overlay').classList.remove('vis');
  renderGroupSelect();
  renderGBar();
  renderFromChips();
}

function settingsOverlayClick(e) {
  if (e.target === document.getElementById('settings-overlay')) closeSettings();
}

function showSettingsSection(section) {
  activeSettingsSection = section;
  ['general', 'groups', 'people'].forEach(s => {
    document.getElementById('sps-' + s).classList.toggle('active', s === section);
    document.getElementById('sp-nav-' + s).classList.toggle('active', s === section);
  });
  if (section === 'groups') renderSettingsGroups();
  if (section === 'people') renderSettingsPeople();
}

const AVATAR_EMOJIS = [
  '🐶','🐱','🐭','🐹','🐰','🦊','🐻','🐼','🐨','🐯',
  '🦁','🐮','🐷','🐸','🐵','🐔','🐧','🐦','🦆','🦅',
  '🦉','🦇','🐺','🐗','🐴','🦄','🐝','🐛','🦋','🐌',
  '🐢','🐍','🦎','🦕','🐙','🦑','🦀','🐡','🐬','🐳',
];

function toggleEmojiPicker() {
  const picker = document.getElementById('emoji-picker');
  if (picker.style.display !== 'none') { picker.style.display = 'none'; return; }
  picker.innerHTML = AVATAR_EMOJIS.map(e =>
    `<button type="button" class="emoji-opt" onclick="pickEmoji('${e}')">${e}</button>`
  ).join('');
  picker.style.display = 'flex';
  setTimeout(() => document.addEventListener('click', emojiPickerOutside), 0);
}

function emojiPickerOutside(e) {
  const wrap = document.querySelector('.emoji-pick-wrap');
  if (wrap && !wrap.contains(e.target)) {
    document.getElementById('emoji-picker').style.display = 'none';
    document.removeEventListener('click', emojiPickerOutside);
  }
}

function pickEmoji(e) {
  document.getElementById('sps-emoji').value        = e;
  document.getElementById('sps-emoji-display').textContent = e;
  document.getElementById('emoji-picker').style.display   = 'none';
  document.removeEventListener('click', emojiPickerOutside);
  saveProfile();
}

function saveProfile() {
  profile.name         = document.getElementById('sps-name').value.trim();
  profile.emoji        = document.getElementById('sps-emoji').value.trim();
  profile.slackWebhook = document.getElementById('sps-slack-webhook').value.trim();
  profile.slackTeamId  = document.getElementById('sps-slack-team').value.trim();
  persist();
  renderProfileBar();
}

function renderProfileBar() {
  const el = document.getElementById('profile-bar');
  if (!el) return;
  if (!profile.name && !profile.emoji) { el.innerHTML = ''; return; }
  el.innerHTML =
    `${profile.emoji ? `<span class="profile-bar-emoji">${profile.emoji}</span>` : ''}
     ${profile.name  ? `<span class="profile-bar-name">${esc(profile.name)}</span>` : ''}`;
}

/* ── Settings: Groups ── */
function renderSettingsGroups() {
  const el = document.getElementById('sps-group-list');
  if (!el) return;
  if (!groups.length) { el.innerHTML = '<div class="sp-empty">No groups yet.</div>'; return; }
  el.innerHTML = groups.map(g => `
    <div class="sp-list-item">
      <span class="sp-item-swatch" style="background:${g.color}"></span>
      <span class="sp-item-name">${esc(g.name)}</span>
      <button class="sp-item-rm" onclick="removeSettingsGroup('${g.id}')">×</button>
    </div>`).join('');
}

function addSettingsGroup() {
  const name = document.getElementById('sps-g-name').value.trim();
  if (!name) return;
  groups.push({ id: 'g' + Date.now(), name, emoji: '', color: gc(selSettingsGroupColor) });
  document.getElementById('sps-g-name').value = '';
  persist();
  renderSettingsGroups();
  renderGBar();
}

function removeSettingsGroup(id) {
  groups = groups.filter(g => g.id !== id);
  tasks.forEach(t => { if (t.group === id) t.group = ''; });
  if (activeGroup === id) activeGroup = 'all';
  persist();
  renderSettingsGroups();
  renderGBar();
  renderList();
}

/* ── Settings: People ── */
function renderSettingsPeople() {
  const el = document.getElementById('sps-people-list');
  if (!el) return;
  if (!people.length) { el.innerHTML = '<div class="sp-empty">No people yet.</div>'; return; }
  const sorted = [...people].sort((a, b) => (b.usageCount || 0) - (a.usageCount || 0));
  el.innerHTML = sorted.map(p => `
    <div class="sp-list-item sp-person-row" id="sp-person-${p.id}">
      <span class="sp-item-swatch" style="background:${gc(p.color)}"></span>
      <div class="sp-person-view">
        <span class="sp-item-name">${esc(p.name)}</span>
        ${p.slackId ? `<span class="sp-item-slack" title="${esc(p.slackId)}">Slack ✓</span>` : '<span class="sp-item-slack-empty">No Slack ID</span>'}
      </div>
      <div class="sp-person-edit" style="display:none">
        <input class="sp-input sp-grow" value="${esc(p.name)}" id="sp-edit-name-${p.id}" placeholder="Name" />
        <input class="sp-input sp-grow" value="${esc(p.slackId || '')}" id="sp-edit-slack-${p.id}" placeholder="Slack User ID" />
      </div>
      <div class="sp-person-actions">
        <button class="sp-item-edit" onclick="togglePersonEdit('${p.id}')">Edit</button>
        <button class="sp-item-save" style="display:none" onclick="savePersonEdit('${p.id}')">Save</button>
        <button class="sp-item-rm" onclick="removeSettingsPerson('${p.id}')">×</button>
      </div>
    </div>`).join('');
}

function togglePersonEdit(id) {
  const row   = document.getElementById('sp-person-' + id);
  const view  = row.querySelector('.sp-person-view');
  const edit  = row.querySelector('.sp-person-edit');
  const editBtn = row.querySelector('.sp-item-edit');
  const saveBtn = row.querySelector('.sp-item-save');
  const isEditing = edit.style.display !== 'none';
  view.style.display  = isEditing ? 'flex'  : 'none';
  edit.style.display  = isEditing ? 'none'  : 'flex';
  editBtn.style.display = isEditing ? 'inline-block' : 'none';
  saveBtn.style.display = isEditing ? 'none' : 'inline-block';
  if (!isEditing) document.getElementById('sp-edit-name-' + id)?.focus();
}

function savePersonEdit(id) {
  const p = people.find(x => x.id === id);
  if (!p) return;
  const name    = document.getElementById('sp-edit-name-'  + id)?.value.trim();
  const slackId = document.getElementById('sp-edit-slack-' + id)?.value.trim();
  if (!name) return;
  p.name    = name;
  p.slackId = slackId;
  persist();
  renderSettingsPeople();
  renderFromChips();
}

function addSettingsPerson() {
  const name    = document.getElementById('sps-p-name').value.trim();
  const slackId = document.getElementById('sps-p-slack').value.trim();
  if (!name) return;
  people.push({ id: 'p' + Date.now(), name, emoji: '', slackId, color: selSettingsPeopleColor, usageCount: 0 });
  document.getElementById('sps-p-name').value  = '';
  document.getElementById('sps-p-slack').value = '';
  persist();
  renderSettingsPeople();
}

function removeSettingsPerson(id) {
  people = people.filter(p => p.id !== id);
  persist();
  renderSettingsPeople();
  renderFromChips();
}

/* ── From-field people chips ── */
function renderFromChips() {
  const el = document.getElementById('from-chips');
  if (!el) return;
  if (!people.length) { el.innerHTML = ''; return; }
  const sorted = [...people]
    .sort((a, b) => (b.usageCount || 0) - (a.usageCount || 0))
    .slice(0, 6);
  el.innerHTML = sorted.map(p =>
    `<button type="button" class="from-chip" data-id="${p.id}" onclick="selectFromPerson('${p.id}')">
      ${p.emoji ? `<span>${p.emoji}</span>` : ''}${esc(p.name)}
    </button>`
  ).join('');
}

function onFromInput() {
  const val = document.getElementById('p-from').value.trim().toLowerCase();
  const el  = document.getElementById('from-suggestions');
  if (!val) { el.innerHTML = ''; el.style.display = 'none'; return; }
  const matches = people.filter(p => p.name.toLowerCase().startsWith(val));
  if (!matches.length) { el.innerHTML = ''; el.style.display = 'none'; return; }
  el.innerHTML = matches.map(p =>
    `<div class="from-sug-item" onmousedown="pickFromSuggestion('${p.id}')">${esc(p.name)}</div>`
  ).join('');
  el.style.display = 'block';
}

function pickFromSuggestion(id) {
  const p = people.find(x => x.id === id);
  if (!p) return;
  document.getElementById('p-from').value = p.name;
  document.getElementById('from-suggestions').style.display = 'none';
  document.querySelectorAll('.from-chip').forEach(c =>
    c.classList.toggle('sel', c.dataset.id === id)
  );
}

function hideFromSuggestions() {
  setTimeout(() => {
    const el = document.getElementById('from-suggestions');
    if (el) el.style.display = 'none';
  }, 100);
}

function selectFromPerson(id) {
  const p = people.find(x => x.id === id);
  if (!p) return;
  document.getElementById('p-from').value = p.name;
  document.querySelectorAll('.from-chip').forEach(c =>
    c.classList.toggle('sel', c.dataset.id === id)
  );
}

/* ── Popup: open / close / toggle ── */
function openPopup() {
  editId = null;
  prioChecked = false;
  dueSel = '';

  ['p-title', 'p-from', 'p-notes'].forEach(id => document.getElementById(id).value = '');
  document.getElementById('p-due').value   = '';
  document.getElementById('p-group').value = '';
  document.getElementById('prio-chk').classList.remove('on');
  document.getElementById('prio-label').classList.remove('on');
  document.getElementById('pop-title-text').textContent = 'New task';
  document.querySelector('#popup .btn-add').textContent  = 'Add task';
  updateDueBtns();

  document.getElementById('overlay').classList.add('vis');
  document.getElementById('popup').style.display = 'block';

  renderFromChips();
  renderGroupChips();
  setTimeout(() => document.getElementById('p-title').focus(), 50);
}

function closePopup() {
  document.getElementById('overlay').classList.remove('vis');
}

function overlayClick(e) {
  if (e.target === document.getElementById('overlay')) closePopup();
}

function togglePrioChk() {
  prioChecked = !prioChecked;
  document.getElementById('prio-chk').classList.toggle('on', prioChecked);
  document.getElementById('prio-label').classList.toggle('on', prioChecked);
}

/* ── Submit (add or update) ── */
function submitTask() {
  const title = document.getElementById('p-title').value.trim();
  if (!title) return;

  const task = {
    id:       editId || nextId++,
    title,
    priority: prioChecked,
    from:     document.getElementById('p-from').value.trim(),
    due:      document.getElementById('p-due').value,
    group:    document.getElementById('p-group').value,
    notes:    document.getElementById('p-notes').value.trim(),
    done:     false,
    created:  new Date().toISOString(),
  };

  if (editId) {
    const existing = tasks.find(t => t.id === editId);
    task.done = existing ? existing.done : false;
    tasks = tasks.map(t => t.id === editId ? task : t);
  } else {
    tasks.unshift(task);
  }

  if (task.from) {
    const person = people.find(p => p.name.toLowerCase() === task.from.toLowerCase());
    if (person) person.usageCount = (person.usageCount || 0) + 1;
  }

  editId = null;
  persist();
  closePopup();
  renderList();
}

/* ── Edit ── */
function startEdit(id) {
  const t = tasks.find(x => x.id === id);
  if (!t) return;

  openPopup();
  editId = id;
  prioChecked = t.priority || false;

  setTimeout(() => {
    document.getElementById('pop-title-text').textContent = 'Edit task';
    document.querySelector('#popup .btn-add').textContent = 'Save';
    document.getElementById('p-title').value  = t.title;
    document.getElementById('p-from').value   = t.from  || '';
    document.getElementById('p-due').value    = t.due   || '';
    document.getElementById('p-group').value  = t.group || '';
    renderGroupChips();
    document.getElementById('p-notes').value  = t.notes || '';

    document.getElementById('prio-chk').classList.toggle('on', prioChecked);
    document.getElementById('prio-label').classList.toggle('on', prioChecked);

    const due = t.due || '';
    if (!due)                    dueSel = '';
    else if (due === getToday())      dueSel = 'today';
    else if (due === getEndOfWeek())  dueSel = 'week';
    else                         dueSel = 'date';
    updateDueBtns();

  }, 20);
}

/* ── Delete ── */
function delTask(id) {
  tasks = tasks.filter(t => t.id !== id);
  persist();
  renderList();
}

/* ── Check / uncheck ── */
function toggleCheck(id) {
  const t = tasks.find(x => x.id === id);
  if (t) { t.done = !t.done; persist(); renderList(); }
}

/* ── Expand / collapse task detail ── */
function toggleDet(id) {
  document.getElementById('det-' + id).classList.toggle('op');
  document.getElementById('arr-' + id).classList.toggle('op');
}

/* ── Build a single task card DOM node ── */
function taskProgressBar(t, col) {
  if (!t.due) return '';
  const now      = Date.now();
  const dueMs    = new Date(t.due).getTime() + 86400000;
  const daysLeft = (dueMs - now) / 86400000;
  const window   = 7; // days — tasks due beyond this show no bar
  const pct      = Math.min(1, Math.max(0, 1 - daysLeft / window));
  if (pct === 0) return '';
  const alpha = Math.round((0.05 + pct * 0.17) * 255).toString(16).padStart(2, '0');
  return `<div class="task-prog" style="width:${pct * 100}%;background:${col}${alpha}"></div>`;
}

function makeCard(t) {
  const col        = taskColor(t);
  const due        = dueTxt(t.due);
  const g          = groups.find(g => g.id === t.group);
  const pingPerson = t.from ? people.find(p => p.name.toLowerCase() === t.from.toLowerCase()) : null;

  const card = document.createElement('div');
  card.className = 'tc' + (t.done ? ' done' : '');
  card.dataset.id = t.id;

  card.innerHTML = `
    ${taskProgressBar(t, col)}
    <div class="tbar" style="background:${col}" draggable="true"
         ondragstart="taskDragStart(event,${t.id})" ondragend="taskDragEnd()">
      <div class="tbar-grip">
        <div class="tbar-line"></div><div class="tbar-line"></div><div class="tbar-line"></div>
      </div>
    </div>
    <div class="tbody">
      <div class="trow" onclick="toggleDet(${t.id})">
        <div class="chk${t.done ? ' on' : ''}"
             onclick="event.stopPropagation();toggleCheck(${t.id})">
          <div class="tick"></div>
        </div>
        ${t.priority ? '<span class="prio-flag">!</span>' : ''}
        <div class="tmain">
          <div class="ttitle">${esc(t.title)}</div>
          ${due ? `<div class="tdue ${due.cls}">${due.label}</div>` : ''}
        </div>
        ${pingPerson ? `<button class="trow-ping" onclick="event.stopPropagation();openPingPopup('${pingPerson.id}','${esc(t.title).replace(/'/g,"\\'")}')">Ping ${esc(pingPerson.name)}</button>` : ''}
        <button class="trow-del" onclick="event.stopPropagation();delTask(${t.id})" title="Delete">Delete</button>
      </div>
      <div class="tdet" id="det-${t.id}">
        <div class="dg">
          ${t.from     ? `<span class="dl">From</span><span class="dv">${esc(t.from)}</span>` : ''}
          ${t.due      ? `<span class="dl">Due</span><span class="dv">${new Date(t.due).toLocaleDateString('en-GB', { weekday:'short', day:'numeric', month:'long' })}</span>` : ''}
          ${g          ? `<span class="dl">Group</span><span class="dv"><span style="display:inline-block;width:6px;height:6px;border-radius:50%;background:${g.color};margin-right:4px;vertical-align:middle"></span>${esc(g.name)}</span>` : ''}
        </div>
        ${t.notes ? `<div class="dnotes">${esc(t.notes)}</div>` : ''}
        <div class="dacts">
          <button class="dact" onclick="startEdit(${t.id})">Edit</button>
          <button class="dact del" onclick="delTask(${t.id})">Delete</button>
        </div>
      </div>
    </div>`;

  card.addEventListener('dragover', e => {
    if (dragTaskId && dragTaskId !== t.id) { e.preventDefault(); card.classList.add('gdrop-card'); }
  });
  card.addEventListener('dragleave', () => card.classList.remove('gdrop-card'));
  card.addEventListener('drop', e => {
    e.preventDefault();
    card.classList.remove('gdrop-card');
    if (!dragTaskId || dragTaskId === t.id) return;
    const dragged = tasks.find(x => x.id === dragTaskId);
    if (dragged) { dragged.group = t.group; persist(); renderList(); }
    dragTaskId = null;
  });

  return card;
}

/* ── Update pill counts ── */
function updateCounts() {
  document.getElementById('cnt-open').textContent     = tasks.filter(t => !t.done).length;
  document.getElementById('cnt-done').textContent     = tasks.filter(t => t.done).length;
  document.getElementById('cnt-priority').textContent = tasks.filter(t => t.priority && !t.done).length;
  document.getElementById('cnt-all').textContent      = tasks.length;
}

/* ── Drag and drop ── */
function taskDragStart(e, id) {
  dragTaskId = id;
  e.dataTransfer.effectAllowed = 'move';
  const card = e.currentTarget.closest('.tc');
  if (card) e.dataTransfer.setDragImage(card, 24, 24);
}

function taskDragEnd() {
  dragTaskId = null;
  document.querySelectorAll('.gtab').forEach(t => t.classList.remove('gdrop'));
}

function taskDropOnGroup(e, groupId) {
  e.preventDefault();
  e.currentTarget.classList.remove('gdrop');
  if (!dragTaskId) return;
  const task = tasks.find(t => t.id === dragTaskId);
  if (task) { task.group = groupId; persist(); renderList(); }
  dragTaskId = null;
}

/* ── Render task list ── */
function renderList() {
  updateCounts();
  const el = document.getElementById('tlist');

  const visible = tasks.filter(t => {
    if (activeGroup !== 'all' && t.group !== activeGroup) return false;
    if (activeFilter === 'open')     return !t.done;
    if (activeFilter === 'done')     return t.done;
    if (activeFilter === 'priority') return t.priority && !t.done;
    return true;
  });

  if (!tasks.length) {
    el.innerHTML = `<div class="empty">No tasks yet.</div>`;
    return;
  }

  el.innerHTML = '';

  if (!visible.length) {
    const empty = document.createElement('div');
    empty.className = 'empty';
    empty.textContent =
      activeFilter === 'done'     ? 'No completed tasks yet.' :
      activeFilter === 'priority' ? 'No priority tasks.'      :
                                    'No open tasks.';
    el.appendChild(empty);
    return;
  }

  if (activeGroup === 'all' && groups.length) {
    const byGroup   = {};
    const ungrouped = [];
    visible.forEach(t => {
      if (t.group) (byGroup[t.group] = byGroup[t.group] || []).push(t);
      else ungrouped.push(t);
    });

    ungrouped.forEach(t => el.appendChild(makeCard(t)));
    const filledGroups = groups.filter(g =>  byGroup[g.id]?.length);
    const emptyGroups  = groups.filter(g => !byGroup[g.id]?.length);
    [...filledGroups, ...emptyGroups].forEach(g => {
      appendSec(el, g.name, g.color, g.emoji, g.id);
      (byGroup[g.id] || []).forEach(t => el.appendChild(makeCard(t)));
    });
  } else {
    visible.forEach(t => el.appendChild(makeCard(t)));
  }
}

/* ── Append a group section header ── */
function openPopupForGroup(groupId) {
  openPopup();
  setTimeout(() => {
    document.getElementById('p-group').value = groupId;
  renderGroupChips();
  }, 25);
}

function appendSec(el, name, color, emoji, groupId) {
  const h = document.createElement('div');
  h.className = 'sec-hdr';
  const pillStyle = color ? `style="--gc:${color};background:${color}1a;border-color:${color}40;color:${color}"` : '';
  const pillTag = groupId ? 'button' : 'div';
  const pillExtra = groupId ? `onclick="openPopupForGroup('${groupId}')" title="Add task to ${name}"` : '';
  h.innerHTML = `
    <${pillTag} class="sec-pill" ${pillStyle} ${pillExtra}>
      ${emoji ? `<span>${emoji}</span>` : ''}
      ${name}
    </${pillTag}>
    <div class="sec-line"></div>`;
  if (groupId !== undefined) {
    h.addEventListener('dragover',  e => { e.preventDefault(); h.classList.add('gdrop-sec'); });
    h.addEventListener('dragleave', () => h.classList.remove('gdrop-sec'));
    h.addEventListener('drop', e => {
      e.preventDefault();
      h.classList.remove('gdrop-sec');
      if (!dragTaskId) return;
      const dragged = tasks.find(t => t.id === dragTaskId);
      if (dragged) { dragged.group = groupId; persist(); renderList(); }
      dragTaskId = null;
    });
  }
  el.appendChild(h);
}

/* ── Ping popup ── */
function openPingPopup(personId, taskTitle) {
  const p = people.find(x => x.id === personId);
  if (!p) return;
  pingPersonId = personId;

  document.getElementById('ping-title').textContent = `Ping ${p.name}`;
  document.getElementById('ping-msg').value = 'Hi!';
  document.getElementById('ping-url').value = '';
  document.getElementById('ping-no-webhook').style.display = profile.slackWebhook ? 'none' : 'block';
  document.getElementById('ping-open-btn').style.display   = p.slackId ? 'inline-flex' : 'none';

  document.getElementById('ping-overlay').classList.add('vis');
  setTimeout(() => {
    const ta = document.getElementById('ping-msg');
    ta.focus();
    ta.setSelectionRange(ta.value.length, ta.value.length);
  }, 50);
}

function closePingPopup() {
  document.getElementById('ping-overlay').classList.remove('vis');
  pingPersonId = null;
}

function pingOverlayClick(e) {
  if (e.target === document.getElementById('ping-overlay')) closePingPopup();
}

function openInSlack() {
  const p = people.find(x => x.id === pingPersonId);
  if (!p?.slackId) return;
  const teamPart = profile.slackTeamId ? `?team=${profile.slackTeamId}&id=${p.slackId}` : `?id=${p.slackId}`;
  window.location.href = `slack://channel${teamPart}`;
}

async function sendPing() {
  const msg = document.getElementById('ping-msg').value.trim();
  if (!msg) return;
  if (!profile.slackWebhook) {
    document.getElementById('ping-no-webhook').style.display = 'block';
    return;
  }
  const p       = people.find(x => x.id === pingPersonId);
  const mention = p?.slackId ? `<@${p.slackId}> ` : '';
  const url     = document.getElementById('ping-url').value.trim();
  const text    = mention + msg + (url ? '\n' + url : '');
  const btn     = document.querySelector('#ping-popup .btn-add');
  btn.textContent = 'Sending…';
  btn.disabled    = true;
  try {
    await fetch(profile.slackWebhook, {
      method: 'POST',
      mode: 'no-cors',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ text }),
    });
    closePingPopup();
  } catch (_) {
    btn.textContent = 'Send';
    btn.disabled    = false;
  }
}

/* ── Boot ── */
function init() {
  loadFromStorage();
  renderProfileBar();
  document.getElementById('date-bar').textContent =
    new Date().toLocaleDateString('en-GB', { day: 'numeric', month: 'long', year: 'numeric' });
  renderGroupSelect();
  renderGBar();
  renderList();
  setFilter('open');
}

init();
