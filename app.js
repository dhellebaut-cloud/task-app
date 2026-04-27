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


function renderAll() {
  renderGroupSelect();
  renderGBar();
  renderList();
  setFilter(activeFilter);
  renderStatsBar();
  renderProfileBar();
  renderLinksShelf();
  renderProjects();
  document.getElementById('date-bar').textContent =
    new Date().toLocaleDateString('en-GB', { day: 'numeric', month: 'long', year: 'numeric' });
  const titleEl = document.getElementById('hdr-title');
  if (titleEl) titleEl.textContent = profile.appTitle || 'Tasks';
}

/* ── Links shelf ── */
function renderLinksShelf() {
  const shelf = document.getElementById('links-shelf');
  if (!shelf) return;

  const itemsHtml = links.map(l => {
    let domain = '';
    try { domain = new URL(l.url).hostname; } catch {}
    const title = esc(l.title || domain.replace(/^www\./, '') || l.url);
    return `<div class="lshelf-item">
      <img class="lshelf-fav" src="https://www.google.com/s2/favicons?domain=${domain}&sz=32" onerror="this.style.display='none'" />
      <a class="lshelf-link" href="${l.url}" target="_blank" rel="noopener noreferrer">${title}</a>
      <button class="lshelf-del" onclick="deleteLink('${l.id}')" title="Remove">×</button>
    </div>`;
  }).join('');

  shelf.innerHTML = `
    <div class="lshelf-hdr" onclick="toggleLinksShelf()">
      <svg class="lshelf-arrow${linksExpanded ? ' open' : ''}" width="8" height="8" viewBox="0 0 8 8" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><polyline points="1.5,2.5 4,5.5 6.5,2.5"/></svg>
      <span class="lshelf-title">Links</span>
      ${links.length ? `<span class="lshelf-count">${links.length}</span>` : ''}
    </div>
    ${linksExpanded ? `
      ${links.length ? `<div class="lshelf-list">${itemsHtml}</div>` : ''}
      <div class="lshelf-add-form">
        <input type="text" id="lshelf-title" class="lshelf-input" placeholder="Title..."
               onkeydown="if(event.key==='Enter')document.getElementById('lshelf-url').focus()" />
        <input type="url" id="lshelf-url" class="lshelf-input" placeholder="Paste URL..."
               onkeydown="if(event.key==='Enter')submitLink()" />
      </div>
    ` : ''}
  `;

  if (linksExpanded) {
    const urlInp = document.getElementById('lshelf-url');
    if (urlInp && !links.length) urlInp.focus();
  }
}

function toggleLinksShelf() {
  linksExpanded = !linksExpanded;
  renderLinksShelf();
}

function submitLink() {
  const urlInp   = document.getElementById('lshelf-url');
  const titleInp = document.getElementById('lshelf-title');
  if (!urlInp) return;
  let url = urlInp.value.trim();
  if (!url) return;
  if (!/^https?:\/\//i.test(url)) url = 'https://' + url;
  let title = titleInp ? titleInp.value.trim() : '';
  if (!title) {
    try { title = new URL(url).hostname.replace(/^www\./, ''); } catch { title = url; }
  }
  links.unshift({ id: 'l' + Date.now(), url, title, added: new Date().toISOString() });
  persist();
  renderLinksShelf();
  // Re-focus the title field for quick next entry
  const t = document.getElementById('lshelf-title');
  if (t) t.focus();
}

function deleteLink(id) {
  links = links.filter(l => l.id !== id);
  persist();
  renderLinksShelf();
}

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
let dragSubtaskId = null;
let dragSubtaskProjectId = null;
let gbarAddOpen  = false;
let selGBarColor = 'purple';
let editId       = null;    // task id being edited, null when creating
let nextId       = 1;
let selSettingsGroupColor  = 'purple';
let selSettingsPeopleColor = 'purple';
let profile                = { name: '', emoji: '', slackWebhook: '', slackTeamId: '', appTitle: '' };
let autoBackup             = { enabled: false, pat: '', gistId: '', lastBackupTime: '' };
let people                 = [];
let links                  = [];
let linksExpanded          = false;
let linksAddOpen           = false;
let projects               = [];
let selProjectColor        = 'teal';
let projPopupSubtasks      = [];
let addingSubtaskProjectId  = null;
let inlineSubtaskPriority   = false;
let inlineSubtaskWW         = false;
let wwChecked               = false;
let expandedSubtaskIds      = new Set();
let activeSettingsSection  = 'general';
let prioChecked  = false;    // state of priority checkbox in popup
let dueSel       = '';       // '' | 'today' | 'week' | 'date'
let taskEmoji    = '';
let statsConfig  = { enabled: false, period: 'week' };

/* ── Persistence (localStorage) ── */
function persist() {
  try {
    localStorage.setItem('tasks-app:tasks',   JSON.stringify(tasks));
    localStorage.setItem('tasks-app:groups',  JSON.stringify(groups));
    localStorage.setItem('tasks-app:people',  JSON.stringify(people));
    localStorage.setItem('tasks-app:profile', JSON.stringify(profile));
    localStorage.setItem('tasks-app:links',    JSON.stringify(links));
    localStorage.setItem('tasks-app:projects', JSON.stringify(projects));
    localStorage.setItem('tasks-app:nextId',   String(nextId));
  } catch (_) { /* storage unavailable */ }
}

function persistAutoBackup() {
  try { localStorage.setItem('tasks-app:autobackup', JSON.stringify(autoBackup)); } catch (_) {}
}

function loadFromStorage() {
  try {
    const t = localStorage.getItem('tasks-app:tasks');
    const g = localStorage.getItem('tasks-app:groups');
    const n = localStorage.getItem('tasks-app:nextId');
    const pe = localStorage.getItem('tasks-app:people');
    const pr = localStorage.getItem('tasks-app:profile');
    const li = localStorage.getItem('tasks-app:links');
    if (t)  tasks   = JSON.parse(t);
    if (g)  groups  = JSON.parse(g);
    if (pe) people  = JSON.parse(pe);
    if (pr) profile = JSON.parse(pr);
    if (li) links    = JSON.parse(li);
    const pj = localStorage.getItem('tasks-app:projects');
    if (pj) projects = JSON.parse(pj);
    if (n)  nextId   = parseInt(n, 10) || 1;
    const ab = localStorage.getItem('tasks-app:autobackup');
    if (ab) autoBackup = { ...autoBackup, ...JSON.parse(ab) };
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
  input.classList.toggle('empty', !input.value);
  updateDueBtns();
}

function onDueInputChange() {
  const input = document.getElementById('p-due');
  const val = input.value;
  input.classList.toggle('empty', !val);
  if (!val)                       dueSel = '';
  else if (val === getToday())    dueSel = 'today';
  else if (val === getEndOfWeek()) dueSel = 'week';
  else                            dueSel = 'date';
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

function linkify(s) {
  return s.replace(/(https?:\/\/[^\s<]+)/g,
    '<a href="$1" target="_blank" rel="noopener noreferrer">$1</a>');
}

function dueTxt(due) {
  if (!due) return null;
  const d     = new Date(due + 'T00:00:00');
  const today = new Date(getToday() + 'T00:00:00');
  const diff  = Math.round((d - today) / 864e5);
  const label = d.toLocaleDateString('en-GB', { day: 'numeric', month: 'short' });
  const cls   = diff < 0 ? 'ov' : diff <= 2 ? 'sn' : '';
  const pre   = diff < 0 ? 'Overdue · ' : diff === 0 ? 'Due today · ' : diff <= 2 ? diff + 'd · ' : '';
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
  renderProjects();
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
  document.getElementById('sps-name').value                = profile.name       || '';
  document.getElementById('sps-emoji').value               = profile.emoji      || '';
  document.getElementById('sps-emoji-display').textContent = profile.emoji      || '😀';
  document.getElementById('sps-slack-team').value          = profile.slackTeamId || '';
  document.getElementById('sps-app-title').value           = profile.appTitle   || '';
  document.getElementById('stats-toggle').classList.toggle('on', statsConfig.enabled);
  if (activeSettingsSection === 'backup') {
    document.getElementById('ab-toggle').classList.toggle('on', autoBackup.enabled);
    document.getElementById('ab-pat').value = autoBackup.pat || '';
    updateBackupStatus();
  }
}

function closeSettings() {
  document.getElementById('settings-overlay').classList.remove('vis');
  renderGroupSelect();
  renderGBar();
  renderFromChips();
}

function settingsOverlayClick(e) {
  if (e.target !== document.getElementById('settings-overlay')) return;
  if (window.getSelection().toString().length > 0) return;
  closeSettings();
}

function showSettingsSection(section) {
  activeSettingsSection = section;
  ['general', 'groups', 'people', 'backup', 'appearance'].forEach(s => {
    document.getElementById('sps-' + s).classList.toggle('active', s === section);
    document.getElementById('sp-nav-' + s).classList.toggle('active', s === section);
  });
  if (section === 'groups') renderSettingsGroups();
  if (section === 'people') renderSettingsPeople();
  if (section === 'backup') {
    document.getElementById('ab-toggle').classList.toggle('on', autoBackup.enabled);
    document.getElementById('ab-pat').value = autoBackup.pat || '';
    updateBackupStatus();
  }
  if (section === 'appearance') {
    renderColorThemePicker();
    renderDensityOptions();
    renderFontSizeOptions();
  }
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
  profile.name        = document.getElementById('sps-name').value.trim();
  profile.emoji       = document.getElementById('sps-emoji').value.trim();
  profile.slackTeamId = document.getElementById('sps-slack-team').value.trim();
  profile.appTitle    = document.getElementById('sps-app-title').value.trim();
  persist();
  renderProfileBar();
  const titleEl = document.getElementById('hdr-title');
  if (titleEl) titleEl.textContent = profile.appTitle || 'Tasks';
}

/* ── Export / Import ── */
function exportData() {
  const payload = JSON.stringify({ tasks, groups, people, profile, links, projects, nextId }, null, 2);
  const blob = new Blob([payload], { type: 'application/json' });
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  a.download = 'tasks-backup-' + new Date().toISOString().slice(0,10) + '.json';
  a.click();
  URL.revokeObjectURL(a.href);
}

function applyBackupData(d) {
  if (d.tasks)    tasks    = d.tasks;
  if (d.groups)   groups   = d.groups;
  if (d.people)   people   = d.people;
  if (d.profile)  profile  = d.profile;
  if (d.links)    links    = d.links;
  if (d.projects) projects = d.projects;
  if (d.nextId)   nextId   = d.nextId;
  persist();
  renderAll();
  openSettings('general');
}

function importData() {
  const input = document.createElement('input');
  input.type = 'file';
  input.accept = '.json';
  input.onchange = e => {
    const file = e.target.files[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = ev => {
      try { applyBackupData(JSON.parse(ev.target.result)); }
      catch (_) { alert('Invalid backup file.'); }
    };
    reader.readAsText(file);
  };
  input.click();
}

/* ── Auto backup (GitHub Gist) ── */
function toggleAutoBackup() {
  autoBackup.enabled = !autoBackup.enabled;
  document.getElementById('ab-toggle').classList.toggle('on', autoBackup.enabled);
  persistAutoBackup();
}

function saveAutoBackupPat() {
  autoBackup.pat = document.getElementById('ab-pat').value;
  persistAutoBackup();
}

function updateBackupStatus(msg) {
  const el = document.getElementById('ab-status');
  if (!el) return;
  if (msg) { el.textContent = msg; return; }
  if (autoBackup.lastBackupTime) {
    const d = new Date(autoBackup.lastBackupTime);
    el.textContent = 'Last backup: ' + d.toLocaleString('en-GB', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' });
  } else {
    el.textContent = 'Not yet backed up';
  }
}

async function runGistBackup(silent = false) {
  if (!autoBackup.pat) {
    if (!silent) updateBackupStatus('No PAT configured');
    return;
  }
  const payload = JSON.stringify({ tasks, groups, people, profile, links, projects, nextId }, null, 2);
  const reqBody = JSON.stringify({
    description: 'Tasks app backup',
    public: false,
    files: { 'tasks-backup.json': { content: payload } }
  });
  const headers = {
    'Authorization': 'token ' + autoBackup.pat,
    'Content-Type': 'application/json',
    'Accept': 'application/vnd.github+json',
    'X-GitHub-Api-Version': '2022-11-28'
  };
  try {
    const url = autoBackup.gistId
      ? 'https://api.github.com/gists/' + autoBackup.gistId
      : 'https://api.github.com/gists';
    const method = autoBackup.gistId ? 'PATCH' : 'POST';
    const res = await fetch(url, { method, headers, body: reqBody });
    if (res.ok) {
      const data = await res.json();
      autoBackup.gistId = data.id;
      autoBackup.lastBackupTime = new Date().toISOString();
      persistAutoBackup();
      if (!silent) updateBackupStatus();
    } else {
      if (!silent) updateBackupStatus('Backup failed (' + res.status + ')');
    }
  } catch (e) {
    if (!silent) updateBackupStatus('Network error');
  }
}

async function importFromGist() {
  if (!autoBackup.pat || !autoBackup.gistId) {
    updateBackupStatus('No backup found — back up first');
    return;
  }
  updateBackupStatus('Fetching…');
  try {
    const res = await fetch('https://api.github.com/gists/' + autoBackup.gistId, {
      headers: {
        'Authorization': 'token ' + autoBackup.pat,
        'Accept': 'application/vnd.github+json',
        'X-GitHub-Api-Version': '2022-11-28'
      }
    });
    if (!res.ok) { updateBackupStatus('Fetch failed (' + res.status + ')'); return; }
    const gist = await res.json();
    const content = gist.files['tasks-backup.json']?.content;
    if (!content) { updateBackupStatus('Backup file not found in Gist'); return; }
    applyBackupData(JSON.parse(content));
  } catch (e) {
    updateBackupStatus('Network error');
  }
}

function startBackupScheduler() {
  setInterval(() => {
    if (!autoBackup.enabled || !autoBackup.pat) return;
    const h = new Date().getHours();
    if (h < 9 || h >= 18) return;
    if (autoBackup.lastBackupTime) {
      if (Date.now() - new Date(autoBackup.lastBackupTime).getTime() < 60 * 60 * 1000) return;
    }
    runGistBackup(true);
  }, 60 * 1000);
}

function renderProfileBar() {
  const el = document.getElementById('profile-bar');
  if (!el) return;
  if (!profile.name && !profile.emoji) { el.innerHTML = ''; return; }
  const h = new Date().getHours();
  const greeting = h < 12 ? 'Good morning' : h < 18 ? 'Good afternoon' : 'Good evening';
  el.innerHTML =
    `${profile.emoji ? `<span class="profile-bar-emoji">${profile.emoji}</span>` : ''}
     ${profile.name  ? `<span class="profile-bar-greeting">${greeting},</span><span class="profile-bar-name">${esc(profile.name)}</span>` : ''}`;
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
  taskEmoji = '';
  const emojiDisplay = document.getElementById('task-emoji-display');
  if (emojiDisplay) { emojiDisplay.textContent = ''; emojiDisplay.closest('.task-emoji-btn')?.classList.remove('has-emoji'); }
  document.getElementById('task-emoji-picker')?.setAttribute('style', 'display:none');

  wwChecked = false;
  document.getElementById('ww-chk').classList.remove('on');
  document.getElementById('ww-label').classList.remove('on');
  document.getElementById('ww-est-row').style.display = 'none';
  document.getElementById('p-est-h').value = '';
  document.getElementById('p-est-m').value = '';
  ['p-title', 'p-from'].forEach(id => document.getElementById(id).value = '');
  document.getElementById('p-notes').innerHTML = '';
  const pDue = document.getElementById('p-due');
  pDue.value = '';
  pDue.classList.add('empty');
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
  if (e.target !== document.getElementById('overlay')) return;
  if (window.getSelection().toString().length > 0) return;
  closePopup();
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
    notes:    (() => { const el = document.getElementById('p-notes'); return el.innerText.trim() ? el.innerHTML : ''; })(),
    done:     false,
    created:  new Date().toISOString(),
    workWeek: wwChecked,
    estimate: wwChecked ? { h: parseInt(document.getElementById('p-est-h').value) || 0, m: parseInt(document.getElementById('p-est-m').value) || 0 } : null,
    emoji:    taskEmoji || '',
  };

  if (editId) {
    const existing = tasks.find(t => t.id === editId);
    task.done = existing ? existing.done : false;
    task.completedAt = existing ? (existing.completedAt || null) : null;
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
  taskEmoji = t.emoji || '';
  setTimeout(() => {
    const disp = document.getElementById('task-emoji-display');
    if (disp) { disp.textContent = taskEmoji; disp.closest('.task-emoji-btn')?.classList.toggle('has-emoji', !!taskEmoji); }
  }, 25);

  setTimeout(() => {
    document.getElementById('pop-title-text').textContent = 'Edit task';
    document.querySelector('#popup .btn-add').textContent = 'Save';
    document.getElementById('p-title').value  = t.title;
    document.getElementById('p-from').value   = t.from  || '';
    const pDueEdit = document.getElementById('p-due');
    pDueEdit.value = t.due || '';
    pDueEdit.classList.toggle('empty', !t.due);
    document.getElementById('p-group').value  = t.group || '';
    renderGroupChips();
    const notesEl = document.getElementById('p-notes');
    if (!t.notes) { notesEl.innerHTML = ''; }
    else if (/<[a-z]/i.test(t.notes)) { notesEl.innerHTML = t.notes; }
    else { notesEl.innerText = t.notes; }

    document.getElementById('prio-chk').classList.toggle('on', prioChecked);
    document.getElementById('prio-label').classList.toggle('on', prioChecked);
    wwChecked = t.workWeek || false;
    document.getElementById('ww-chk').classList.toggle('on', wwChecked);
    document.getElementById('ww-label').classList.toggle('on', wwChecked);
    document.getElementById('ww-est-row').style.display = wwChecked ? '' : 'none';
    document.getElementById('p-est-h').value = t.estimate?.h ?? '';
    document.getElementById('p-est-m').value = t.estimate?.m ?? '';

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
  if (t) {
    t.done = !t.done;
    t.completedAt = t.done ? new Date().toISOString() : null;
    persist();
    renderList();
    renderStatsBar();
  }
}

/* ── Expand / collapse task detail ── */
/* ── Quick note ── */
let quickNoteSelecting = false;
let quickNoteText      = '';

function qnoteFormat(cmd) {
  document.execCommand(cmd, false, null);
}

function openQuickNote() {
  const ed = document.getElementById('qnote-editor');
  ed.innerHTML = '';
  document.getElementById('qnote-overlay').classList.add('vis');
  setTimeout(() => ed.focus(), 50);
  ed.onkeydown = e => {
    if ((e.metaKey || e.ctrlKey) && e.key === 'b') { e.preventDefault(); qnoteFormat('bold'); }
    if ((e.metaKey || e.ctrlKey) && e.key === 'i') { e.preventDefault(); qnoteFormat('italic'); }
  };
}

function closeQuickNote() {
  document.getElementById('qnote-overlay').classList.remove('vis');
}

function qnoteOverlayClick(e) {
  if (e.target !== document.getElementById('qnote-overlay')) return;
  if (window.getSelection().toString().length > 0) return;
  closeQuickNote();
}

function quickNoteAttach() {
  const ed = document.getElementById('qnote-editor');
  if (!ed.innerText.trim()) return;
  quickNoteText = ed.innerHTML;
  closeQuickNote();
  quickNoteSelecting = true;
  document.body.classList.add('qnote-select');
  document.getElementById('qnote-select-banner').classList.add('vis');
}

function cancelNoteSelection() {
  quickNoteSelecting = false;
  quickNoteText = '';
  document.body.classList.remove('qnote-select');
  document.getElementById('qnote-select-banner').classList.remove('vis');
}

function selectTaskForNote(taskId) {
  const t = tasks.find(t => t.id === taskId);
  if (!t) return;
  if (t.notes) {
    const existing = /<[a-z]/i.test(t.notes)
      ? t.notes
      : esc(t.notes).replace(/\n/g, '<br>');
    t.notes = existing + '<br><br>' + quickNoteText;
  } else {
    t.notes = quickNoteText;
  }
  persist();
  renderList();
  cancelNoteSelection();
}

function quickNoteNewTask() {
  const ed = document.getElementById('qnote-editor');
  const plain = ed.innerText.trim();
  closeQuickNote();
  openPopup();
  if (plain) document.getElementById('p-notes').innerText = plain;
}

function renderNotes(notes) {
  if (!notes) return '';
  if (/<[a-z]/i.test(notes)) return notes;
  return linkify(esc(notes)).replace(/\n/g, '<br>');
}

function htmlToEditableText(html) {
  if (!html || !/<[a-z]/i.test(html)) return html || '';
  let t = html;
  // Preserve link text + URL
  t = t.replace(/<a\s[^>]*href="([^"]*)"[^>]*>([\s\S]*?)<\/a>/gi, (_, href, inner) => {
    const text = inner.replace(/<[^>]+>/g, '').trim();
    return text && text !== href ? `${text} (${href})` : href;
  });
  t = t.replace(/<br\s*\/?>/gi, '\n');
  t = t.replace(/<\/p>/gi, '\n');
  t = t.replace(/<li[^>]*>/gi, '• ').replace(/<\/li>/gi, '\n');
  t = t.replace(/<[^>]+>/g, '');
  t = t.replace(/&amp;/g, '&').replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&nbsp;/g, ' ').replace(/&quot;/g, '"');
  return t.replace(/\n{3,}/g, '\n\n').trim();
}

function isLongNote(notes) {
  const plain = notes.replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim();
  const hardBreaks = (notes.match(/<br\s*\/?>/gi) || []).length
                   + (notes.match(/<\/li>/gi) || []).length
                   + (notes.match(/\n/g) || []).length;
  return plain.length > 140 || hardBreaks >= 2;
}

function toggleNotes(id) {
  document.getElementById('notes-' + id)?.classList.toggle('expanded');
}

function toggleDet(id) {
  if (quickNoteSelecting) { selectTaskForNote(id); return; }
  document.getElementById('det-' + id)?.classList.toggle('op');
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

  const chkHtml = t.emoji
    ? `<div class="task-emoji-chk${t.done ? ' on' : ''}" onclick="event.stopPropagation();toggleCheck(${t.id})" title="${t.done ? 'Mark open' : 'Mark done'}">
         <span class="tec-emoji">${t.emoji}</span>
         <div class="tec-check"><div class="tick"></div></div>
       </div>`
    : `<div class="chk${t.done ? ' on' : ''}" onclick="event.stopPropagation();toggleCheck(${t.id})">
         <div class="tick"></div>
       </div>`;

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
        ${chkHtml}
        ${t.priority ? '<span class="prio-flag">!</span>' : ''}
        <div class="tmain">
          <div class="ttitle">${esc(t.title)}</div>
          ${due ? `<div class="tdue ${due.cls}">${due.label}</div>` : ''}
        </div>
        ${pingPerson ? `<button class="trow-ping" onclick="event.stopPropagation();pingPerson('${pingPerson.id}')">Ping ${esc(pingPerson.name)}</button>` : ''}
        <button class="trow-del" onclick="event.stopPropagation();delTask(${t.id})" title="Delete">Delete</button>
      </div>
      <div class="tdet" id="det-${t.id}">
        <div class="dg">
          ${t.from     ? `<span class="dl">From</span><span class="dv">${esc(t.from)}</span>` : ''}
          ${t.due      ? `<span class="dl">Due</span><span class="dv">${new Date(t.due).toLocaleDateString('en-GB', { weekday:'short', day:'numeric', month:'long' })}</span>` : ''}
          ${g          ? `<span class="dl">Group</span><span class="dv"><span style="display:inline-block;width:6px;height:6px;border-radius:50%;background:${g.color};margin-right:4px;vertical-align:middle"></span>${esc(g.name)}</span>` : ''}
        </div>
        ${t.notes ? `<div class="dnotes${isLongNote(t.notes) ? ' collapsible' : ''}" id="notes-${t.id}" onclick="toggleNotes(${t.id})">${renderNotes(t.notes)}</div>` : ''}
        <div class="det-ww-row">
          <div class="prio-chk-box${t.workWeek ? ' on' : ''}" onclick="event.stopPropagation();toggleTaskWW(${t.id})"><div class="tick"></div></div>
          <span class="prio-label${t.workWeek ? ' on' : ''}" onclick="event.stopPropagation();toggleTaskWW(${t.id})">Work week</span>
          ${t.workWeek ? `<div class="est-row" onclick="event.stopPropagation()">
            <input type="number" class="est-input" value="${t.estimate?.h || 0}" min="0" max="99"
                   onchange="updateTaskEstimate(${t.id},'h',this.value)" />
            <span class="est-unit">h</span>
            <input type="number" class="est-input" value="${t.estimate?.m || 0}" min="0" max="59"
                   onchange="updateTaskEstimate(${t.id},'m',this.value)" />
            <span class="est-unit">m</span>
          </div>` : ''}
        </div>
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
  document.getElementById('cnt-open').textContent     = tasks.filter(t => !t.done).length     + projects.filter(p => !p.archived).length;
  document.getElementById('cnt-done').textContent     = tasks.filter(t => t.done).length      + projects.filter(p => p.archived).length;
  document.getElementById('cnt-priority').textContent = tasks.filter(t => t.priority && !t.done).length;
  document.getElementById('cnt-all').textContent      = tasks.length + projects.length;
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
  document.querySelectorAll('.proj-hdr').forEach(h => h.classList.remove('gdrop-proj'));
}

function taskDragOverProject(e, projectId) {
  if (!dragTaskId) return;
  const task = tasks.find(t => t.id === dragTaskId);
  if (!task || task.done) return;
  e.preventDefault();
  e.dataTransfer.dropEffect = 'move';
  e.currentTarget.classList.add('gdrop-proj');
}

function taskDragLeaveProject(e) {
  e.currentTarget.classList.remove('gdrop-proj');
}

function taskDropOnProject(e, projectId) {
  e.preventDefault();
  e.currentTarget.classList.remove('gdrop-proj');
  if (!dragTaskId) return;
  const taskIndex = tasks.findIndex(t => t.id === dragTaskId);
  if (taskIndex === -1) return;
  const task = tasks[taskIndex];
  if (task.done) return;
  const project = projects.find(p => p.id === projectId);
  if (!project) return;

  const subtask = {
    id:       'st' + Date.now() + Math.random().toString(36).slice(2, 6),
    title:    task.title,
    done:     false,
    priority: task.priority,
    from:     task.from || '',
    due:      task.due || '',
    link:     '',
    notes:    task.notes || '',
    workWeek: task.workWeek || false,
    estimate: task.estimate || null,
    created:  task.created,
  };

  project.subtasks.push(subtask);
  tasks.splice(taskIndex, 1);
  dragTaskId = null;
  persist();
  renderList();
  renderProjects();
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
    renderWorkWeekBar();
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
    renderWorkWeekBar();
    return;
  }

  if (activeFilter === 'done' && tasks.some(t => t.done)) {
    const row = document.createElement('div');
    row.className = 'clear-done-row';
    row.innerHTML = `<button class="clear-done-btn" onclick="clearAllDone()">Clear all completed</button>`;
    el.appendChild(row);
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
  renderWorkWeekBar();
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

/* ── Ping ── */
function pingPerson(personId) {
  const p = people.find(x => x.id === personId);
  if (!p?.slackId) return;
  const team = profile.slackTeamId;
  // slack:// deep link opens the app directly without the redirect webpage
  const url = team
    ? `slack://user?team=${team}&id=${p.slackId}`
    : `slack://user?id=${p.slackId}`;
  window.location.href = url;
}

/* ── Projects ── */
function renderProjects() {
  const el = document.getElementById('plist');
  if (!el) return;
  const visible = projects.filter(p =>
    activeFilter === 'all' ? true :
    activeFilter === 'done' ? p.archived :
    !p.archived
  );
  el.innerHTML = visible.map(p => renderProjectCard(p)).join('');
  // re-focus inline add input if open
  if (addingSubtaskProjectId) {
    const inp = document.getElementById('proj-st-input-' + addingSubtaskProjectId);
    if (inp) inp.focus();
  }
  renderWorkWeekBar();
}

function renderProjectCard(p) {
  const total = p.subtasks.length;
  const done  = p.subtasks.filter(s => s.done).length;
  const pct   = total > 0 ? Math.round((done / total) * 100) : 0;
  const isComplete = total > 0 && done === total;
  const barColor   = isComplete ? '#1d9e75' : p.color;
  const dl         = p.deadline ? dueTxt(p.deadline) : null;

  const subtasksHtml = p.collapsed ? '' : p.subtasks.map(s => renderSubtaskRow(p.id, s, p.color)).join('');

  const addHtml = !p.collapsed ? (
    addingSubtaskProjectId === p.id
      ? `<div class="proj-st-add-row">
           <div class="proj-st-add-prio${inlineSubtaskPriority ? ' on' : ''}" onclick="toggleInlineSubtaskPriority()" title="Mark as priority">!</div>
           <input class="proj-st-add-input" id="proj-st-input-${p.id}" type="text" placeholder="New subtask..."
                  onkeydown="if(event.key==='Enter')submitInlineSubtask('${p.id}');if(event.key==='Escape')closeInlineSubtask()" />
           <div class="proj-st-add-ww${inlineSubtaskWW ? ' on' : ''}" onclick="toggleInlineSubtaskWW()" title="Add to work week">W</div>
         </div>
         <div class="proj-st-add-est${inlineSubtaskWW ? '' : ' hidden'}">
           <input type="number" class="est-input" id="proj-st-est-h-${p.id}" min="0" max="99" placeholder="0" />
           <span class="est-unit">h</span>
           <input type="number" class="est-input" id="proj-st-est-m-${p.id}" min="0" max="59" placeholder="0" />
           <span class="est-unit">m</span>
         </div>`
      : `<button class="proj-add-st-btn" onclick="openInlineSubtask('${p.id}')">
           <svg width="9" height="9" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round"><line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/></svg>
           Add subtask
         </button>`
  ) : '';

  const deadlineRow = !p.collapsed ? `
    <div class="proj-deadline-row">
      <span class="proj-deadline-lbl">Deadline</span>
      ${p.deadline
        ? `<span class="date-set-val">${new Date(p.deadline + 'T00:00:00').toLocaleDateString('en-GB', {day:'numeric', month:'short', year:'numeric'})}</span>
           <button class="date-clear-btn" onclick="event.stopPropagation();updateProjectField('${p.id}','deadline','')">×</button>`
        : `<span class="date-ph-wrap"><input class="proj-deadline-input empty" type="date"
                  onclick="event.stopPropagation()"
                  onchange="this.classList.remove('empty');if(this.value)updateProjectField('${p.id}','deadline',this.value)" /><span class="date-ph">dd/mm/yyyy</span></span>`
      }
    </div>` : '';

  return `<div class="proj-card" id="proj-${p.id}">
    <div class="proj-hdr" onclick="toggleProject('${p.id}')"
         ondragover="taskDragOverProject(event,'${p.id}')"
         ondragleave="taskDragLeaveProject(event)"
         ondrop="taskDropOnProject(event,'${p.id}')">
      <svg class="proj-arrow${p.collapsed ? '' : ' open'}" width="8" height="8" viewBox="0 0 8 8" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><polyline points="1.5,2.5 4,5.5 6.5,2.5"/></svg>
      <span class="proj-dot" style="background:${p.color}" title="Change colour" onclick="event.stopPropagation();toggleProjectColorPicker('${p.id}',this)"></span>
      <input class="proj-name-input" value="${esc(p.title)}" size="${Math.max(p.title.length, 3)}"
             onclick="event.stopPropagation()"
             oninput="this.size=Math.max(this.value.length,3)"
             onblur="updateProjectField('${p.id}','title',this.value.trim()||'${esc(p.title)}')"
             onkeydown="if(event.key==='Enter')this.blur();if(event.key==='Escape'){this.value='${esc(p.title)}';this.size=${Math.max(p.title.length,3)};this.blur()}" />
      <span class="proj-hdr-spacer"></span>
      ${isComplete ? '<span class="proj-complete-tag">Completed</span>' : ''}
      ${dl ? `<span class="proj-dl-chip${dl.cls ? ' ' + dl.cls : ''}">${dl.label}</span>` : ''}
      <span class="proj-count">${done}/${total}</span>
      ${p.archived
        ? `<button class="proj-archive-btn proj-revert-btn" onclick="event.stopPropagation();archiveProject('${p.id}')" title="Move back to open">Revert</button>
           <button class="proj-archive-btn proj-delete-btn" onclick="event.stopPropagation();deleteProject('${p.id}')" title="Delete permanently">Delete permanently</button>`
        : `<button class="proj-archive-btn" onclick="event.stopPropagation();archiveProject('${p.id}')" title="Archive">Archive</button>`
      }
    </div>
    <div class="proj-prog-wrap"><div class="proj-prog-bar" style="width:${pct}%;background:${barColor}"></div></div>
    ${!p.collapsed ? `<div class="proj-body">${deadlineRow}${subtasksHtml}${addHtml}</div>` : ''}
  </div>`;
}

function renderSubtaskRow(projectId, s, projColor) {
  const editing  = expandedSubtaskIds.has(s.id);
  const stDue    = s.due ? dueTxt(s.due) : null;
  const dueHtml  = stDue ? `<span class="proj-st-due${stDue.cls ? ' ' + stDue.cls : ''}">${stDue.label}</span>` : '';
  const extra = editing ? `
    <div class="proj-st-extra">
      <div class="prio-row">
        <div class="prio-chk-box${s.priority ? ' on' : ''}" onclick="toggleSubtaskPrio('${projectId}','${s.id}')"><div class="tick"></div></div>
        <span class="prio-label" onclick="toggleSubtaskPrio('${projectId}','${s.id}')">Priority</span>
      </div>
      <div class="pf">
        <div class="pfl">From</div>
        <input class="sp-input" type="text" value="${esc(s.from||'')}" placeholder="Name or team"
               onchange="updateSubtaskField('${projectId}','${s.id}','from',this.value)" />
      </div>
      <div class="pf">
        <div class="pfl">Due date</div>
        ${s.due
          ? `<div class="date-set-wrap">
               <span class="date-set-val">${new Date(s.due + 'T00:00:00').toLocaleDateString('en-GB', {day:'numeric', month:'short', year:'numeric'})}</span>
               <button class="date-clear-btn" onclick="updateSubtaskField('${projectId}','${s.id}','due','',true)">×</button>
             </div>`
          : `<span class="date-ph-wrap"><input class="sp-input sp-date-input empty" type="date"
                    onchange="this.classList.remove('empty');if(this.value)updateSubtaskField('${projectId}','${s.id}','due',this.value,true)" /><span class="date-ph">dd/mm/yyyy</span></span>`
        }
      </div>
      <div class="pf">
        <div class="pfl">Notes</div>
        <div class="st-note-toolbar">
          <button class="st-tb-btn" onmousedown="event.preventDefault()" onclick="stNoteFormat('bold','${s.id}')" title="Bold"><strong>B</strong></button>
          <button class="st-tb-btn" onmousedown="event.preventDefault()" onclick="stNoteFormat('italic','${s.id}')" title="Italic"><em>I</em></button>
          <button class="st-tb-btn" onmousedown="event.preventDefault()" onclick="stNoteFormat('insertUnorderedList','${s.id}')" title="Bullet list"><svg width="10" height="10" viewBox="0 0 16 16" fill="currentColor"><circle cx="2" cy="4" r="1.5"/><rect x="5" y="3" width="10" height="2" rx="1"/><circle cx="2" cy="9" r="1.5"/><rect x="5" y="8" width="10" height="2" rx="1"/><circle cx="2" cy="14" r="1.5"/><rect x="5" y="13" width="10" height="2" rx="1"/></svg></button>
          <button class="st-tb-btn" onmousedown="event.preventDefault()" onclick="stNoteFormat('strikeThrough','${s.id}')" title="Strikethrough"><s>S</s></button>
        </div>
        <div class="st-notes-editor" id="st-notes-${s.id}" contenteditable="true" data-placeholder="Notes..."
             onkeydown="if((event.metaKey||event.ctrlKey)&&event.key==='b'){event.preventDefault();stNoteFormat('bold','${s.id}');}if((event.metaKey||event.ctrlKey)&&event.key==='i'){event.preventDefault();stNoteFormat('italic','${s.id}');}"
             onblur="updateSubtaskField('${projectId}','${s.id}','notes',this.innerHTML)">${s.notes ? (/<[a-z]/i.test(s.notes) ? s.notes : esc(s.notes).replace(/\n/g,'<br>')) : ''}</div>
      </div>
      <div class="pf">
        <div class="pfl">Link</div>
        <div class="proj-st-link-row">
          <input class="sp-input" type="url" value="${esc(s.link||'')}" placeholder="https://drive.google.com/..."
                 onchange="updateSubtaskField('${projectId}','${s.id}','link',this.value)" />
          ${s.link ? `<a class="proj-st-link-open" href="${esc(s.link)}" target="_blank" rel="noopener noreferrer" onclick="event.stopPropagation()" title="Open link">
            <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6"/><polyline points="15 3 21 3 21 9"/><line x1="10" y1="14" x2="21" y2="3"/></a>` : ''}
        </div>
      </div>
      <div class="prio-row" style="margin-top:4px">
        <div class="prio-chk-box${s.workWeek ? ' on' : ''}" onclick="toggleSubtaskWW('${projectId}','${s.id}')"><div class="tick"></div></div>
        <span class="prio-label${s.workWeek ? ' on' : ''}" onclick="toggleSubtaskWW('${projectId}','${s.id}')">Add to work week</span>
      </div>
      ${s.workWeek ? `<div class="pf">
        <div class="pfl">Estimate</div>
        <div class="est-row">
          <input type="number" class="est-input" value="${s.estimate?.h || 0}" min="0" max="99"
                 onchange="updateSubtaskEstimate('${projectId}','${s.id}','h',this.value)" />
          <span class="est-unit">h</span>
          <input type="number" class="est-input" value="${s.estimate?.m || 0}" min="0" max="59"
                 onchange="updateSubtaskEstimate('${projectId}','${s.id}','m',this.value)" />
          <span class="est-unit">m</span>
        </div>
      </div>` : ''}
    </div>` : '';

  const chkStyle = projColor ? ` style="${s.done ? `background:${projColor};border-color:${projColor}` : `--proj-chk-hover:${projColor}`}"` : '';

  return `<div class="proj-st${s.done ? ' done' : ''}${editing ? ' editing' : ''}"
     ondragover="subtaskDragOver(event,'${projectId}','${s.id}')"
     ondragleave="event.currentTarget.classList.remove('st-drag-over')"
     ondrop="subtaskDrop(event,'${projectId}','${s.id}')">
    <div class="proj-st-row" onclick="toggleSubtaskExpand('${s.id}')">
      <div class="proj-st-drag" draggable="true" onclick="event.stopPropagation()"
           ondragstart="subtaskDragStart(event,'${projectId}','${s.id}')"
           ondragend="subtaskDragEnd()" title="Reorder">⠿</div>
      <div class="proj-st-check${s.done ? ' on' : ''}"${chkStyle} onclick="event.stopPropagation();toggleSubtaskDone('${projectId}','${s.id}')">
        ${s.done ? `<svg width="9" height="9" viewBox="0 0 12 12" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="2,6 5,9 10,3"/></svg>` : ''}
      </div>
      ${s.priority ? '<span class="proj-st-prio-flag">!</span>' : ''}
      <input class="proj-st-title" value="${esc(s.title)}" size="${Math.max(s.title.length, 6)}"
             onclick="event.stopPropagation()"
             oninput="this.size=Math.max(this.value.length,6)"
             onblur="updateSubtaskField('${projectId}','${s.id}','title',this.value.trim()||'${esc(s.title)}',true)"
             onkeydown="if(event.key==='Enter')this.blur();if(event.key==='Escape'){this.value='${esc(s.title)}';this.size=${Math.max(s.title.length,6)};this.blur()}" />
      <span class="proj-st-spacer"></span>
      ${dueHtml}
      ${s.link ? `<button class="proj-st-copy-btn" id="copy-btn-${s.id}" onclick="event.stopPropagation();copySubtaskLink('${s.id}','${esc(s.link)}')">Copy link</button>` : ''}
      <button class="proj-st-del" onclick="event.stopPropagation();deleteSubtask('${projectId}','${s.id}')">×</button>
    </div>
    ${extra}
  </div>`;
}

function toggleProject(id) {
  const p = projects.find(x => x.id === id);
  if (!p) return;
  p.collapsed = !p.collapsed;
  if (p.collapsed && addingSubtaskProjectId === id) addingSubtaskProjectId = null;
  persist();
  renderProjects();
}

function toggleSubtaskDone(projectId, subtaskId) {
  const p = projects.find(x => x.id === projectId);
  const s = p?.subtasks.find(x => x.id === subtaskId);
  if (!s) return;
  const wasAllDone = p.subtasks.length > 0 && p.subtasks.every(x => x.done);
  s.done = !s.done;
  s.completedAt = s.done ? new Date().toISOString() : null;
  const isNowAllDone = p.subtasks.length > 0 && p.subtasks.every(x => x.done);
  if (!wasAllDone && isNowAllDone) launchConfetti();
  persist();
  renderProjects();
  renderStatsBar();
}

function toggleSubtaskExpand(subtaskId) {
  expandedSubtaskIds.has(subtaskId) ? expandedSubtaskIds.delete(subtaskId) : expandedSubtaskIds.add(subtaskId);
  renderProjects();
}

function toggleSubtaskPrio(projectId, subtaskId) {
  const p = projects.find(x => x.id === projectId);
  const s = p?.subtasks.find(x => x.id === subtaskId);
  if (!s) return;
  s.priority = !s.priority;
  persist();
  renderProjects();
}

function updateSubtaskField(projectId, subtaskId, field, value, rerender = false) {
  const p = projects.find(x => x.id === projectId);
  const s = p?.subtasks.find(x => x.id === subtaskId);
  if (!s) return;
  s[field] = value;
  persist();
  if (rerender) renderProjects();
}

function updateProjectField(projectId, field, value) {
  const p = projects.find(x => x.id === projectId);
  if (!p) return;
  p[field] = value;
  persist();
  renderProjects();
}

/* ── Work week ── */
function toggleWWChk() {
  wwChecked = !wwChecked;
  document.getElementById('ww-chk').classList.toggle('on', wwChecked);
  document.getElementById('ww-label').classList.toggle('on', wwChecked);
  document.getElementById('ww-est-row').style.display = wwChecked ? '' : 'none';
}

function toggleTaskWW(id) {
  const t = tasks.find(x => x.id === id);
  if (!t) return;
  t.workWeek = !t.workWeek;
  if (!t.workWeek) t.estimate = null;
  persist();
  renderList();
  document.getElementById('det-' + id)?.classList.add('op');
}

function updateTaskEstimate(id, field, val) {
  const t = tasks.find(x => x.id === id);
  if (!t) return;
  if (!t.estimate) t.estimate = { h: 0, m: 0 };
  t.estimate[field] = Math.max(0, parseInt(val) || 0);
  persist();
  renderWorkWeekBar();
}

function toggleSubtaskWW(projectId, subtaskId) {
  const p = projects.find(x => x.id === projectId);
  const s = p?.subtasks.find(x => x.id === subtaskId);
  if (!s) return;
  s.workWeek = !s.workWeek;
  if (!s.workWeek) s.estimate = null;
  persist();
  renderProjects();
}

function updateSubtaskEstimate(projectId, subtaskId, field, val) {
  const p = projects.find(x => x.id === projectId);
  const s = p?.subtasks.find(x => x.id === subtaskId);
  if (!s) return;
  if (!s.estimate) s.estimate = { h: 0, m: 0 };
  s.estimate[field] = Math.max(0, parseInt(val) || 0);
  persist();
  renderWorkWeekBar();
}

function renderWorkWeekBar() {
  const wrap = document.getElementById('ww-wrap');
  if (!wrap) return;
  const toMin = e => (+(e?.h || 0)) * 60 + (+(e?.m || 0));
  const wwTasks    = tasks.filter(t => t.workWeek && t.estimate);
  const wwSubtasks = projects.flatMap(p => p.subtasks.filter(s => s.workWeek && s.estimate));
  const totalMin   = [...wwTasks, ...wwSubtasks].reduce((a, x) => a + toMin(x.estimate), 0);
  if (totalMin === 0) { wrap.innerHTML = ''; wrap.style.display = 'none'; return; }
  wrap.style.display = 'flex';
  const budget      = 38 * 60;
  const pct         = totalMin / budget * 100;
  const color       = pct >= 90 ? '#d85a30' : pct >= 70 ? '#ef9f27' : '#1d9e75';
  const fillPct     = Math.min(pct, 100);
  const overflow    = Math.max(0, totalMin - budget);
  const overflowPct = overflow / budget * 100;
  const totalH = Math.floor(totalMin / 60);
  const totalM = totalMin % 60;
  const label  = totalM ? `${totalH}h ${totalM}m` : `${totalH}h`;
  wrap.innerHTML = `
    <div class="ww-track">
      <div class="ww-main-bar">
        <div class="ww-fill" style="width:${fillPct}%;background:${color}"></div>
      </div>${overflow ? `
      <div class="ww-marker"></div>
      <div class="ww-overflow" style="width:${overflowPct}%;background:${color}"></div>` : ''}
    </div>
    <span class="ww-label">${label}</span>`;
}

let _dotPickerProjectId = null;
let _dotPickerOutside  = null;

function closeDotPicker() {
  document.getElementById('proj-dot-picker')?.remove();
  if (_dotPickerOutside) { document.removeEventListener('click', _dotPickerOutside); _dotPickerOutside = null; }
  _dotPickerProjectId = null;
}

function toggleProjectColorPicker(projectId, dotEl) {
  if (_dotPickerProjectId === projectId) { closeDotPicker(); return; }
  closeDotPicker();
  const p = projects.find(x => x.id === projectId);
  const curId = COLS.find(c => c.h === p.color)?.id || 'purple';
  const panel = document.createElement('div');
  panel.id = 'proj-dot-picker';
  panel.className = 'proj-dot-picker';
  document.body.appendChild(panel);
  const rect = dotEl.getBoundingClientRect();
  panel.style.top  = (rect.bottom + 4) + 'px';
  panel.style.left = (rect.left - 4)   + 'px';
  renderColorPicker('proj-dot-picker', curId, id => {
    closeDotPicker();
    updateProjectField(projectId, 'color', gc(id));
  });
  _dotPickerProjectId = projectId;
  _dotPickerOutside = e => { if (!panel.contains(e.target)) closeDotPicker(); };
  setTimeout(() => document.addEventListener('click', _dotPickerOutside), 0);
}

function openInlineSubtask(projectId) {
  addingSubtaskProjectId = projectId;
  inlineSubtaskPriority  = false;
  inlineSubtaskWW        = false;
  renderProjects();
}

function closeInlineSubtask() {
  addingSubtaskProjectId = null;
  inlineSubtaskPriority  = false;
  inlineSubtaskWW        = false;
  renderProjects();
}

function toggleInlineSubtaskWW() {
  inlineSubtaskWW = !inlineSubtaskWW;
  document.querySelector('.proj-st-add-ww')?.classList.toggle('on', inlineSubtaskWW);
  document.querySelectorAll('.proj-st-add-est').forEach(el => el.classList.toggle('hidden', !inlineSubtaskWW));
}

function toggleInlineSubtaskPriority() {
  inlineSubtaskPriority = !inlineSubtaskPriority;
  // re-render just the prio toggle without losing focus
  const btn = document.querySelector('.proj-st-add-prio');
  if (btn) btn.classList.toggle('on', inlineSubtaskPriority);
}

function submitInlineSubtask(projectId) {
  const inp = document.getElementById('proj-st-input-' + projectId);
  if (!inp) return;
  const title = inp.value.trim();
  if (!title) { closeInlineSubtask(); return; }
  const p = projects.find(x => x.id === projectId);
  if (!p) return;
  const estH = parseInt(document.getElementById('proj-st-est-h-' + projectId)?.value) || 0;
  const estM = parseInt(document.getElementById('proj-st-est-m-' + projectId)?.value) || 0;
  p.subtasks.push({ id: 'st' + Date.now() + Math.random().toString(36).slice(2,6), title, done: false, priority: inlineSubtaskPriority, workWeek: inlineSubtaskWW, estimate: inlineSubtaskWW ? { h: estH, m: estM } : null, from: '', due: '', link: '', notes: '', created: new Date().toISOString() });
  inlineSubtaskPriority = false;
  inlineSubtaskWW = false;
  persist();
  renderProjects(); // keeps add row open for rapid entry
}

function copySubtaskLink(subtaskId, url) {
  navigator.clipboard.writeText(url).then(() => {
    const btn = document.getElementById('copy-btn-' + subtaskId);
    if (!btn) return;
    btn.classList.add('copied');
    btn.innerHTML = '<svg width="9" height="9" viewBox="0 0 12 12" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><polyline points="2,6 5,9 10,3"/></svg> Copied';
    setTimeout(() => {
      btn.classList.remove('copied');
      btn.textContent = 'Copy link';
    }, 1800);
  });
}

function deleteSubtask(projectId, subtaskId) {
  const p = projects.find(x => x.id === projectId);
  if (!p) return;
  p.subtasks = p.subtasks.filter(s => s.id !== subtaskId);
  expandedSubtaskIds.delete(subtaskId);
  persist();
  renderProjects();
}

function archiveProject(id) {
  const p = projects.find(x => x.id === id);
  if (!p) return;
  p.archived = !p.archived;
  persist();
  renderProjects();
}

function deleteProject(id) {
  projects = projects.filter(x => x.id !== id);
  persist();
  renderProjects();
}

/* ── Project popup ── */
function openProjectPopup() {
  projPopupSubtasks = [];
  selProjectColor = 'teal';
  document.getElementById('proj-popup-name').value     = '';
  const projDl = document.getElementById('proj-popup-deadline');
  projDl.value = '';
  projDl.classList.add('empty');
  renderProjectPopupSubtasks();
  renderColorPicker('proj-popup-colors', selProjectColor, id => {
    selProjectColor = id;
    renderColorPicker('proj-popup-colors', selProjectColor, () => {});
  });
  document.getElementById('proj-overlay').classList.add('vis');
  setTimeout(() => document.getElementById('proj-popup-name').focus(), 50);
}

function closeProjectPopup() {
  document.getElementById('proj-overlay').classList.remove('vis');
}

function projOverlayClick(e) {
  if (e.target !== document.getElementById('proj-overlay')) return;
  if (window.getSelection().toString().length > 0) return;
  closeProjectPopup();
}

function renderProjectPopupSubtasks() {
  const el = document.getElementById('proj-popup-subtasks');
  if (!el) return;
  el.innerHTML = projPopupSubtasks.map((t, i) => `
    <div class="proj-popup-st-row">
      <input class="sp-input proj-popup-st-input" type="text" value="${esc(t)}" placeholder="Subtask title..."
             oninput="projPopupSubtasks[${i}]=this.value"
             onkeydown="if(event.key==='Enter')addProjPopupSubtask()" />
      <button class="proj-popup-st-del" onclick="removeProjPopupSubtask(${i})">×</button>
    </div>`).join('') +
    `<button class="proj-popup-add-st" onclick="addProjPopupSubtask()">
       <svg width="9" height="9" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round"><line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/></svg>
       Add subtask
     </button>`;
}

function addProjPopupSubtask() {
  projPopupSubtasks.push('');
  renderProjectPopupSubtasks();
  const inputs = document.querySelectorAll('.proj-popup-st-input');
  if (inputs.length) inputs[inputs.length - 1].focus();
}

function removeProjPopupSubtask(i) {
  projPopupSubtasks.splice(i, 1);
  renderProjectPopupSubtasks();
}

function submitProject() {
  const title    = document.getElementById('proj-popup-name').value.trim();
  if (!title) { document.getElementById('proj-popup-name').focus(); return; }
  const deadline = document.getElementById('proj-popup-deadline').value || '';
  const subtasks = projPopupSubtasks.filter(t => t.trim()).map(t => ({
    id: 'st' + Date.now() + Math.random().toString(36).slice(2,6),
    title: t.trim(), done: false, priority: false, from: '', due: '', link: '', notes: '',
    created: new Date().toISOString()
  }));
  projects.unshift({
    id: 'p' + Date.now(), title, color: gc(selProjectColor), deadline,
    subtasks, collapsed: true, archived: false, created: new Date().toISOString()
  });
  persist();
  renderProjects();
  closeProjectPopup();
}

/* ── Boot ── */
function toggleTheme() {
  const isLight = document.body.classList.toggle('light');
  localStorage.setItem('tasks-app:theme', isLight ? 'light' : 'dark');
  applyColorTheme(localStorage.getItem('tasks-app:color-theme') || 'default');
}

function loadTheme() {
  if (localStorage.getItem('tasks-app:theme') === 'light') {
    document.body.classList.add('light');
  }
}

/* ── Colour themes ── */
const COLOR_THEMES = [
  { id: 'default', label: 'Default', dark:  null, light: null },
  { id: 'blue',  label: 'Blue',
    dark:  { '--bg': '#0d0f14', '--bg2': '#131720', '--bg3': '#1a1f2c', '--bg4': '#222838', '--ac': '#4f87ef', '--ac2': '#2e62cc', '--ac3': '#90b8f8' },
    light: { '--bg': '#eff2f8', '--bg2': '#e5eaf4', '--bg3': '#d9e0ef', '--bg4': '#ccd5e8', '--ac': '#2563eb', '--ac2': '#4f83ef', '--ac3': '#1a4abf' } },
  { id: 'teal',  label: 'Teal',
    dark:  { '--bg': '#0d1412', '--bg2': '#111d1a', '--bg3': '#172522', '--bg4': '#1e2e2a', '--ac': '#14b8a6', '--ac2': '#0d8a7a', '--ac3': '#5eead4' },
    light: { '--bg': '#eef4f3', '--bg2': '#e3eeec', '--bg3': '#d6e9e6', '--bg4': '#c8e0dc', '--ac': '#0d9488', '--ac2': '#2bafa3', '--ac3': '#077168' } },
  { id: 'rose',  label: 'Rose',
    dark:  { '--bg': '#130d0f', '--bg2': '#1c1215', '--bg3': '#24181c', '--bg4': '#2d1e22', '--ac': '#f43f5e', '--ac2': '#c0183c', '--ac3': '#fda4af' },
    light: { '--bg': '#f8eff1', '--bg2': '#f1e5e8', '--bg3': '#ead9de', '--bg4': '#e2ccd3', '--ac': '#e11d48', '--ac2': '#f43f5e', '--ac3': '#be123c' } },
  { id: 'amber', label: 'Amber',
    dark:  { '--bg': '#130f0a', '--bg2': '#1c160e', '--bg3': '#251d12', '--bg4': '#2e2416', '--ac': '#f59e0b', '--ac2': '#c47d08', '--ac3': '#fcd34d' },
    light: { '--bg': '#f8f4ec', '--bg2': '#f2eadc', '--bg3': '#ecdfcc', '--bg4': '#e4d3ba', '--ac': '#d97706', '--ac2': '#f59e0b', '--ac3': '#b45309' } },
  { id: 'mono',  label: 'Mono',
    dark:  { '--bg': '#0f0f0f', '--bg2': '#161616', '--bg3': '#1e1e1e', '--bg4': '#272727', '--ac': '#94a3b8', '--ac2': '#64748b', '--ac3': '#cbd5e1' },
    light: { '--bg': '#f1f1f1', '--bg2': '#e8e8e8', '--bg3': '#dcdcdc', '--bg4': '#d0d0d0', '--ac': '#475569', '--ac2': '#64748b', '--ac3': '#334155' } },
];

function applyColorTheme(id) {
  const theme = COLOR_THEMES.find(t => t.id === id) || COLOR_THEMES[0];
  const vars = ['--bg', '--bg2', '--bg3', '--bg4', '--ac', '--ac2', '--ac3'];
  if (!theme.dark) {
    vars.forEach(v => document.body.style.removeProperty(v));
    return;
  }
  const isLight = document.body.classList.contains('light');
  const palette = theme[isLight ? 'light' : 'dark'];
  Object.entries(palette).forEach(([k, v]) => document.body.style.setProperty(k, v));
}

function saveColorTheme(id) {
  localStorage.setItem('tasks-app:color-theme', id);
  applyColorTheme(id);
  renderColorThemePicker();
}

function loadColorTheme() {
  applyColorTheme(localStorage.getItem('tasks-app:color-theme') || 'default');
}

function renderColorThemePicker() {
  const el = document.getElementById('sps-color-theme-swatches');
  if (!el) return;
  const current = localStorage.getItem('tasks-app:color-theme') || 'default';
  el.innerHTML = COLOR_THEMES.map(t => {
    const accentColor = t.dark ? t.dark['--ac'] : '#7f77dd';
    const active = t.id === current;
    return `<button class="ct-swatch${active ? ' ct-swatch-active' : ''}" title="${t.label}"
      style="background:${accentColor}" onclick="saveColorTheme('${t.id}')">
      ${t.id === 'default' ? '<span class="ct-swatch-label">Default</span>' : ''}
    </button>`;
  }).join('');
}

function initQnoteSmartPaste() {
  document.getElementById('qnote-editor').addEventListener('paste', e => {
    const sel = window.getSelection();
    if (!sel || sel.isCollapsed) return;
    const clipText = e.clipboardData?.getData('text/plain')?.trim();
    if (!clipText) return;
    let isUrl = false;
    try { const u = new URL(clipText); isUrl = u.protocol === 'http:' || u.protocol === 'https:'; } catch {}
    if (!isUrl) return;
    e.preventDefault();
    const range = sel.getRangeAt(0);
    const content = range.extractContents();
    const a = document.createElement('a');
    a.href = clipText;
    a.target = '_blank';
    a.rel = 'noopener noreferrer';
    a.style.color = '#f0882a';
    a.style.textDecoration = 'underline';
    a.style.textDecorationColor = '#f0882a';
    a.appendChild(content);
    range.insertNode(a);
    const next = document.createRange();
    next.setStartAfter(a);
    next.collapse(true);
    sel.removeAllRanges();
    sel.addRange(next);
  });
}

/* ── Clear all done ── */
function clearAllDone() {
  if (!confirm('Remove all completed tasks? This cannot be undone.')) return;
  tasks = tasks.filter(t => !t.done);
  persist();
  renderList();
  renderStatsBar();
}

/* ── Confetti ── */
function launchConfetti() {
  const canvas = document.createElement('canvas');
  canvas.style.cssText = 'position:fixed;inset:0;pointer-events:none;z-index:9999;width:100%;height:100%';
  canvas.width  = window.innerWidth;
  canvas.height = window.innerHeight;
  document.body.appendChild(canvas);
  const ctx    = canvas.getContext('2d');
  const colors = ['#7f77dd','#1d9e75','#ef9f27','#d85a30','#f43f5e','#14b8a6','#fcd34d'];
  const parts  = Array.from({ length: 70 }, () => ({
    x: Math.random() * canvas.width, y: -10,
    vx: (Math.random() - 0.5) * 4, vy: Math.random() * 3 + 2,
    size: Math.random() * 7 + 4, color: colors[Math.floor(Math.random() * colors.length)],
    angle: Math.random() * Math.PI * 2, spin: (Math.random() - 0.5) * 0.18, alpha: 1,
  }));
  let raf;
  function tick() {
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    let alive = 0;
    for (const p of parts) {
      p.x += p.vx; p.y += p.vy; p.vy += 0.12; p.angle += p.spin;
      if (p.y > canvas.height * 0.65) p.alpha -= 0.025;
      if (p.alpha <= 0) continue;
      alive++;
      ctx.save();
      ctx.translate(p.x, p.y); ctx.rotate(p.angle);
      ctx.globalAlpha = Math.max(0, p.alpha);
      ctx.fillStyle = p.color;
      ctx.fillRect(-p.size / 2, -p.size / 2, p.size, p.size * 0.55);
      ctx.restore();
    }
    if (alive > 0) raf = requestAnimationFrame(tick);
    else { canvas.remove(); cancelAnimationFrame(raf); }
  }
  tick();
}

/* ── Stats bar ── */
function loadStatsConfig() {
  try {
    const s = localStorage.getItem('tasks-app:stats');
    if (s) statsConfig = { ...statsConfig, ...JSON.parse(s) };
  } catch (_) {}
}
function saveStatsConfig() {
  localStorage.setItem('tasks-app:stats', JSON.stringify(statsConfig));
}
function toggleStatsEnabled() {
  statsConfig.enabled = !statsConfig.enabled;
  document.getElementById('stats-toggle').classList.toggle('on', statsConfig.enabled);
  saveStatsConfig();
  renderStatsBar();
}
function setStatsPeriod(p) {
  statsConfig.period = p;
  saveStatsConfig();
  renderStatsBar();
}
function renderStatsBar() {
  const el = document.getElementById('stats-bar');
  if (!el) return;
  if (!statsConfig.enabled) { el.innerHTML = ''; return; }
  const now   = new Date();
  const today = getToday();
  const allItems = [
    ...tasks.filter(t => t.done && t.completedAt),
    ...projects.flatMap(p => p.subtasks.filter(s => s.done && s.completedAt)),
  ];
  let count = 0;
  if (statsConfig.period === 'day') {
    count = allItems.filter(x => x.completedAt.slice(0, 10) === today).length;
  } else if (statsConfig.period === 'week') {
    const d = new Date(now); d.setDate(d.getDate() - (d.getDay() === 0 ? 6 : d.getDay() - 1)); d.setHours(0,0,0,0);
    count = allItems.filter(x => new Date(x.completedAt) >= d).length;
  } else {
    const d = new Date(now.getFullYear(), now.getMonth(), 1);
    count = allItems.filter(x => new Date(x.completedAt) >= d).length;
  }
  el.innerHTML = `<div class="stats-bar-inner">
    <span class="stats-count">${count}</span>
    <span class="stats-desc">completed</span>
    <div class="stats-period">
      ${['day','week','month'].map(p =>
        `<button class="spt${statsConfig.period === p ? ' on' : ''}" onclick="setStatsPeriod('${p}')">${p.charAt(0).toUpperCase() + p.slice(1)}</button>`
      ).join('')}
    </div>
  </div>`;
}

/* ── Task emoji picker ── */
const TASK_EMOJIS = [
  '📝','✅','🎯','🚀','💡','🔥','⭐','🏆','📌','📋',
  '🔧','🛠️','💼','📊','📈','🎨','🤝','💬','📱','💻',
  '🌐','📧','📞','🏠','🎉','🌟','💪','🧠','❤️','🔑',
  '🚗','✈️','🎵','📚','🌈','🦋','🌺','☕','🍎','🎮',
];
function toggleTaskEmojiPicker(e) {
  if (e) e.stopPropagation();
  const picker = document.getElementById('task-emoji-picker');
  if (!picker) return;
  if (picker.style.display !== 'none') { picker.style.display = 'none'; return; }
  picker.innerHTML = TASK_EMOJIS.map(em =>
    `<button type="button" class="emoji-opt${taskEmoji === em ? ' sel' : ''}" onclick="pickTaskEmoji('${em}')">${em}</button>`
  ).join('');
  picker.style.display = 'flex';
  setTimeout(() => document.addEventListener('click', taskEmojiOutside), 0);
}
function taskEmojiOutside(e) {
  const picker = document.getElementById('task-emoji-picker');
  const btn    = document.getElementById('task-emoji-btn');
  if (picker && !picker.contains(e.target) && btn && !btn.contains(e.target)) {
    picker.style.display = 'none';
    document.removeEventListener('click', taskEmojiOutside);
  }
}
function pickTaskEmoji(em) {
  taskEmoji = taskEmoji === em ? '' : em;
  const disp = document.getElementById('task-emoji-display');
  if (disp) { disp.textContent = taskEmoji; disp.closest('.task-emoji-btn')?.classList.toggle('has-emoji', !!taskEmoji); }
  document.getElementById('task-emoji-picker').style.display = 'none';
  document.removeEventListener('click', taskEmojiOutside);
}

/* ── Subtask rich text ── */
function stNoteFormat(cmd, subtaskId) {
  const el = document.getElementById('st-notes-' + subtaskId);
  if (el) { el.focus(); document.execCommand(cmd, false, null); }
}

/* ── Subtask drag to reorder ── */
function subtaskDragStart(e, projectId, subtaskId) {
  dragSubtaskId = subtaskId;
  dragSubtaskProjectId = projectId;
  e.dataTransfer.effectAllowed = 'move';
  e.stopPropagation();
}
function subtaskDragEnd() {
  dragSubtaskId = null;
  dragSubtaskProjectId = null;
  document.querySelectorAll('.proj-st').forEach(el => el.classList.remove('st-drag-over'));
}
function subtaskDragOver(e, projectId, subtaskId) {
  if (!dragSubtaskId || dragSubtaskProjectId !== projectId || dragSubtaskId === subtaskId) return;
  e.preventDefault();
  e.stopPropagation();
  document.querySelectorAll('.proj-st').forEach(el => el.classList.remove('st-drag-over'));
  e.currentTarget.classList.add('st-drag-over');
}
function subtaskDrop(e, projectId, subtaskId) {
  e.preventDefault();
  e.stopPropagation();
  e.currentTarget.classList.remove('st-drag-over');
  if (!dragSubtaskId || dragSubtaskProjectId !== projectId || dragSubtaskId === subtaskId) return;
  const p = projects.find(x => x.id === projectId);
  if (!p) return;
  const fromIdx = p.subtasks.findIndex(x => x.id === dragSubtaskId);
  const toIdx   = p.subtasks.findIndex(x => x.id === subtaskId);
  if (fromIdx === -1 || toIdx === -1) return;
  const [moved] = p.subtasks.splice(fromIdx, 1);
  p.subtasks.splice(toIdx, 0, moved);
  dragSubtaskId = null;
  dragSubtaskProjectId = null;
  persist();
  renderProjects();
}

/* ── Density mode ── */
function loadDensity()       { applyDensity(localStorage.getItem('tasks-app:density') || 'default'); }
function applyDensity(mode)  { document.body.classList.toggle('compact', mode === 'compact'); }
function saveDensity(mode)   { localStorage.setItem('tasks-app:density', mode); applyDensity(mode); renderDensityOptions(); }
function renderDensityOptions() {
  const el = document.getElementById('density-options');
  if (!el) return;
  const cur = localStorage.getItem('tasks-app:density') || 'default';
  el.innerHTML = [['default','Default'],['compact','Compact']].map(([id, label]) =>
    `<button class="density-btn${id === cur ? ' active' : ''}" onclick="saveDensity('${id}')">${label}</button>`
  ).join('');
}

/* ── Font size ── */
function loadFontSize()        { applyFontSize(localStorage.getItem('tasks-app:fontsize') || '100'); }
function applyFontSize(val)    { document.documentElement.style.zoom = parseInt(val) / 100; }
function saveFontSize(val)     { localStorage.setItem('tasks-app:fontsize', val); applyFontSize(val); renderFontSizeOptions(); }
function renderFontSizeOptions() {
  const el = document.getElementById('fontsize-options');
  if (!el) return;
  const cur = localStorage.getItem('tasks-app:fontsize') || '100';
  el.innerHTML = [['90','S'],['100','M'],['115','L'],['130','XL']].map(([v, label]) =>
    `<button class="fontsize-btn${v === cur ? ' active' : ''}" onclick="saveFontSize('${v}')">${label}</button>`
  ).join('');
}

function init() {
  loadTheme();
  loadColorTheme();
  loadDensity();
  loadFontSize();
  loadStatsConfig();
  loadFromStorage();
  renderAll();
  initQnoteSmartPaste();
  startBackupScheduler();
  document.addEventListener('keydown', e => {
    if (e.key !== 'Escape') return;
    if (document.getElementById('settings-overlay')?.classList.contains('vis')) { closeSettings(); return; }
    if (document.getElementById('overlay')?.classList.contains('vis'))          { closePopup();    return; }
    if (document.getElementById('proj-overlay')?.classList.contains('vis'))     { closeProjectPopup(); return; }
    if (document.getElementById('qnote-overlay')?.classList.contains('vis'))    { closeQuickNote(); return; }
  });
}

init();

document.addEventListener('wheel', function(e) {
  const overlays = ['overlay', 'proj-overlay', 'settings-overlay', 'qnote-overlay', 'ping-overlay'];
  if (overlays.some(id => document.getElementById(id)?.classList.contains('vis'))) return;
  const scrollArea = document.getElementById('scroll-area');
  if (!scrollArea) return;
  if (scrollArea.contains(e.target)) return;
  scrollArea.scrollTop += e.deltaY;
}, { passive: true });
