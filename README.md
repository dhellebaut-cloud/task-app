# Tasks App

A minimal, dark standalone task manager. Vanilla HTML/CSS/JS — no build step, no dependencies, no backend.

## Run it

Just open `index.html` in a browser. That's it.

```bash
# Or serve it locally with any static server, e.g.:
npx serve .
python3 -m http.server 8080
```

## Files

| File | What it does |
|------|-------------|
| `index.html` | Structure and markup |
| `style.css`  | All visual styles, CSS custom properties for theming |
| `app.js`     | All logic — state, rendering, localStorage persistence |

## Features

- Add tasks with a `+` button
- Quick add (title + colour) or detailed (from, due date, priority level, group, notes)
- Mark as priority — shows red dot, counted in the red pill
- Colour-coded left bar on each task card
- Expandable task detail
- Three filter pills: priority (red) / open (orange) / done (green)
- Groups — create named/coloured groups, filter by group tab
- Tasks persist via localStorage — survive page refreshes
- Edit and delete tasks
