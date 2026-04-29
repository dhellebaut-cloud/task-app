# Tasks App — Session Context

Read this file before making any changes. It gives full context with no prior knowledge assumed.

---

## What this app is

A personal, dark-themed task manager called **Tasks**, built as a single-page web app that runs by opening `index.html` in a browser. It can be installed as a PWA (Progressive Web App) through Chrome so it behaves like a native app. There is no server, no login, no database — everything is stored locally in the browser's `localStorage`.

The app is used by one person (the developer, Dennis) to manage personal and work tasks, projects with subtasks, quick-access links, and a 38-hour work-week time budget tracker.

---

## Tech stack

- **Vanilla HTML, CSS, JavaScript** — zero frameworks, zero build steps, zero npm
- **localStorage** for all data persistence (survives page refresh, lost if browser data is cleared)
- **PWA** — `manifest.json` + `sw.js` service worker enable "Add to Home Screen" / "Install" in Chrome
- **No backend** — all logic runs client-side in `app.js`
- Deployed to GitHub Pages at `https://dhellebaut-cloud.github.io/task-app/index.html`

---

## File structure

| File | Purpose |
|------|---------|
| `index.html` | App shell — all HTML structure, popup markup, settings panel, overlay divs. No content is hardcoded here; JS renders everything into named div containers. |
| `app.js` | All application logic — state management, rendering functions, event handlers, localStorage read/write. ~2300 lines, no imports. |
| `style.css` | All styling — dark theme CSS variables, layout, component styles. ~2400 lines. |
| `manifest.json` | PWA manifest — app name, icon, theme colour, display mode. |
| `sw.js` | Service worker — network-first strategy for `index.html`, `app.js`, `style.css`; cache-first for static assets. Enables offline use. Note: `supabase.min.js` is listed in the static assets array but that file no longer exists (leftover from a removed auth attempt — harmless). |
| `icon.svg` | App icon used for PWA install and home screen. |

---

## Data model (localStorage)

All data is serialised to JSON and stored under these keys:

| Key | What it stores |
|-----|---------------|
| `tasks-app:tasks` | Array of task objects |
| `tasks-app:groups` | Array of group objects |
| `tasks-app:people` | Array of people objects |
| `tasks-app:profile` | Single profile object (name, emoji, Slack team ID, app title) |
| `tasks-app:links` | Array of quick-access link objects |
| `tasks-app:projects` | Array of project objects (each with a `subtasks` array) |
| `tasks-app:nextId` | Auto-increment counter for task IDs |
| `tasks-app:theme` | `'light'` or `'dark'` |
| `tasks-app:color-theme` | Active colour preset ID (e.g. `'default'`, `'blue'`) |
| `tasks-app:density` | `'default'` or `'compact'` |
| `tasks-app:fontsize` | Zoom level as string: `'85'`, `'100'`, `'115'`, `'130'` |
| `tasks-app:autobackup` | Auto-backup config object (enabled, PAT, gist ID, last backup time) |

### Task object fields
```
id, title, priority (bool), from (string), due (ISO date string),
group (group id or ''), notes (HTML string), done (bool), created (ISO datetime),
workWeek (bool), estimate ({ h, m } or null), emoji (string or ''),
completedAt (ISO datetime or null)
```

### Project object fields
```
id, title, color (hex), emoji (string or ''), deadline (ISO date or ''),
subtasks (array), collapsed (bool), archived (bool), created (ISO datetime)
```

### Subtask object fields
```
id, title, done (bool), priority (bool), from, due, link, notes (HTML string),
workWeek (bool), estimate ({ h, m } or null), created, completedAt (ISO datetime or null)
```

### Group object fields
```
id, name, color (hex), emoji
```

### Person object fields
```
id, name, slackId, color (colour palette id), usageCount
```

---

## Colour palette

Seven named colours used throughout the app (groups, projects, people chips):

```javascript
purple #7f77dd  |  teal #1d9e75  |  coral #d85a30  |  amber #ef9f27
blue #378add    |  pink #d4537e  |  gray #888780
```

The helper `gc(id)` converts a colour name to its hex value. Tasks without a group use orange `#f0882a`.

---

## All current features

### Task management
- **Add task** via the "Add task" button → opens a popup with:
  - Title (required)
  - Optional emoji — emoji picker button next to the title; the chosen emoji replaces the checkbox on the card with an animated hover-reveal checkmark
  - Priority toggle ("Mark as priority") — shows a red `!` badge on the card
  - Work week toggle ("Add to work week") — reveals hour/minute estimate inputs
  - From field — free text, auto-suggests from the People list, quick-pick chips for frequent contacts
  - Group assignment — chip buttons for each group
  - Due date — "Today", "This week" quick buttons, or a custom date picker
  - Notes — rich text (bold, italic, bullet list via `contenteditable` + `execCommand`)
- **Edit task** — click Edit in the expanded detail, reopens same popup pre-filled
- **Delete task** — button in the collapsed row and in the expanded detail
- **Clear all done** — button at the top of the done task list to bulk-remove completed tasks
- **Done/undone toggle** — checkbox (or emoji) on each card; done tasks move to the "done" filter; `completedAt` timestamp recorded
- **Expand task detail** — click anywhere on the card row to expand; shows From, Due, Group, Notes, and a work week / estimate toggle
- **Work week toggle in detail** — can add/remove a task from the work week and set the estimate without reopening the edit popup

### Filters and groups
- **Four filter pills** in the header: Priority, Open (default), Done, All
- **Group tab bar** — shows all groups; click a tab to filter by that group; "All groups" tab to see everything
- **Add group** — `+` button in the group tab bar opens a small panel with name, emoji, and colour picker
- **Drag group tabs** to reorder them
- **Drag tasks** onto group tabs or group section headers to reassign group
- **Group section pills** — each group section header has a `+` hint that appears inside the pill on hover (text slides right to make room); clicking opens the add-task popup pre-assigned to that group

### Projects
- **Add project** via the "Add project" button → popup with name, colour, deadline, and initial subtasks
- **Project card** shows: collapse/expand arrow, coloured dot (click to change colour), optional emoji button (smiley icon, click to assign/clear an emoji), editable title (click to edit inline), deadline chip, done/total subtask count, Archive button
- **Subtask progress bar** — thin coloured bar showing % complete; turns green when all done; triggers confetti burst when project reaches 100%
- **Subtask rows** — done checkbox, priority flag, drag handle (⠿) to reorder, inline-editable title (click to edit), due date chip, copy link button (if link set), delete button
- **Expand subtask** — click the subtask row to expand details: From, Due date, rich-text Notes (bold/italic/bullets toolbar), Link, Work week toggle + estimate
- **Subtask drag to reorder** — drag the ⠿ handle to reorder subtasks within a project
- **Add subtask inline** — "Add subtask" button shows an input row with priority (`!`) and work week (`W`) toggles; Enter to submit, keeps row open for rapid entry; W toggle reveals h/m estimate fields
- **Archive project** — moves to "done" filter (archived); Revert button moves it back; Delete permanently removes it
- **Project colour picker** — clicking the coloured dot opens a floating swatch picker (body-level, so it clears `overflow:hidden` clipping); click outside to dismiss
- **Project emoji picker** — clicking the emoji button opens the same emoji grid used for tasks; ✕ option clears the emoji

### Work-week progress bar
- Shown just below the group tab bar (full-width, same visual band)
- **Hidden entirely** when no tasks or subtasks are marked "Add to work week" with an estimate
- Fills as a single bar based on total estimated hours across all work-week tasks and subtasks (both regular tasks and project subtasks)
- Colour thresholds based on % of 38 hours:
  - **Green** — below 70%
  - **Orange** — 70% to 90%
  - **Red** — 90% and above
- If total exceeds 38h: a vertical tick marker appears at the 38h point, and a red overflow segment extends past it
- Total hours label (e.g. `32h 30m`) shown at the right end

### Links shelf
- Collapsible shelf just below the add buttons
- Add links with a title and URL; favicon auto-fetched from Google
- Shows link count when collapsed; click to expand/collapse

### Profile bar
- Shows at the top of the scroll area when a name and/or emoji is set in Settings → General
- Displays the profile emoji (large) above a time-based greeting + name on the same line:
  - Good morning (before 12), Good afternoon (12–18), Good evening (after 18)
- **Greeting auto-refreshes** every hour via `setInterval`
- **Motivational quotes** — every 5–12 minutes, the greeting/name area fades out and a short quote types in character by character (`showMotivationalQuote`), stays for 6 seconds, then fades out and the greeting returns. The emoji stays visible throughout (only the nameline div fades). 24 quotes in the `QUOTES` array. Skipped if any overlay is open. First quote fires 1.5s after page load. The `showingQuote` flag prevents any `renderProfileBar()` call from overwriting the quote mid-display.

### Confetti
- Canvas-free CSS `@keyframes confetti-fall` animation using DOM `<div>` elements
- Fires via `launchConfetti()` when all subtasks in a project are marked done
- 72 particles, random colours from the app palette, random drift and duration

### Settings (⚙ button top-left)
- **General** — display name, avatar emoji picker, custom app title, Slack team ID, Export/Import JSON backup, auto-backup to GitHub Gist (PAT-based)
- **Appearance** — dark/light theme toggle, 6 colour theme presets, density mode (Default/Compact), font size (S/M/L/XL via `document.documentElement.style.zoom`)
- **Groups** — add/remove groups with name, colour
- **People** — add/remove people with name and optional Slack User ID; most-used appear first

### Colour theme presets
Six presets applied as inline styles on `document.body` (overrides both `:root` and `body.light` CSS vars):
- **Default** — original purple accent
- **Blue** — blue accent
- **Teal** — teal accent
- **Rose** — warm rose accent
- **Amber** — amber accent
- **Mono** — greyscale

Stored in `tasks-app:color-theme`. Re-applied on theme toggle so dark/light switching preserves the chosen preset.

### Density and font size
- **Compact mode** — `body.compact` class reduces padding on task rows, task cards, subtask rows, and project cards
- **Font size** — four levels (85/100/115/130) applied via `document.documentElement.style.zoom`; stored in `tasks-app:fontsize`

### Slack ping
- If a task's "from" name matches a person in People who has a Slack User ID configured, a "Ping [name]" button appears on the card
- Clicking it opens a `slack://` deep link to start a DM in the Slack app

### Keyboard shortcuts
- **Escape** closes whichever overlay is open (settings, add-task popup, add-project popup, quick note)

### Scrolling and layout
- Header (title + pills), group tab bar, work-week bar, and add buttons are all fixed at the top
- Everything below the add buttons (links shelf, projects, task list) scrolls as one unit in `#scroll-area`
- Wheel events are forwarded from `document` to `#scroll-area` so scrolling works from anywhere on screen
- Scrollbar is hidden (but scrolling still works)

---

## Design decisions

- **Dark theme** — near-black background (`#0f0f0f`), layered dark greys for panels and cards
- **No external fonts** — uses the system sans-serif stack and a monospace accent for the brand name
- **Single popup** for add and edit — same form, same HTML, different mode
- **Less is more** — no categories beyond groups, no recurring tasks, no priorities beyond a single flag
- **Inline editing where possible** — project title, subtask title are editable in place; no popup needed
- **Colour is informational** — task bar colour = group colour; due date chips turn amber (soon) or red (overdue); work-week bar changes colour as budget fills
- **Everything is a function** — no classes, no modules; all functions are global, called directly from inline `onclick` handlers in HTML strings
- **Theming via inline styles** — colour themes are applied as `document.body.style.setProperty(...)` so they have higher specificity than both `:root` and `body.light` CSS vars
- **Rich text in notes** — both task notes and subtask notes use `contenteditable` divs with `document.execCommand()` for bold/italic/bullets; stored as HTML strings

---

## Known limitations / things to be aware of

- **No cross-device sync** — localStorage is browser-local; use Export/Import to move data between devices
- **PWA install is Chrome-only** for the best experience (Safari has limited PWA support)
- **Service worker references `supabase.min.js`** in its static cache list — this file doesn't exist. It causes a silent cache failure on install but does not break anything
- **Task expanded state is DOM-only** — when `renderList()` is called (e.g. toggling work week), all cards are recreated and expanded details collapse. Worked around in `toggleTaskWW()` by re-adding the `.op` class after render
- **Subtask expanded state** is tracked in a `Set` called `expandedSubtaskIds` so it survives re-renders
- **GitHub Pages deployment** — pushing many commits in rapid succession cancels in-progress deployments, leaving the site on a stale version. If the live site looks outdated, check `gh run list` for cancelled runs and push an empty commit to trigger a fresh deploy

---

## How to start a new Claude Code session

1. Open this project folder in Claude Code
2. Read `CONTEXT.md` (this file) before making any changes
3. If you need to understand a specific feature or function in depth, read the relevant section of `app.js` or `style.css` — do not assume based on the context file alone
4. All changes must be made to the files in this folder; the app is deployed to GitHub Pages by committing and pushing to the `main` branch of the `dhellebaut-cloud/task-app` repository
5. **Always push to the live site after changes** — commit and push to main; GitHub Pages deploys automatically
