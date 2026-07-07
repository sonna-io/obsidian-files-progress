# Files Progress

An Obsidian plugin that enhances the file explorer with the tiniest possible horizontal progress bar under each markdown file, showing how "full" the note is relative to a target character count.

## Features

- **Tiny, seamless bars** — a 2px (configurable 1–4px) bar rendered inside Obsidian's native file explorer rows, aligned with the file name indentation, using theme variables so it blends with any theme.
- **Fullness by character count** — a note is 100% full at the target character count (default **3600**, configurable globally and per folder).
- **Color reflects fullness** — smooth hue gradient from red (empty) through yellow to green (full). Notes that exceed the target turn purple (optional).
- **Progress view** — a sidebar view listing every note in scope with its completion. Sort by completion, name, folder path, character count, or recent modification; group by folder (collapsible, with per-folder averages); filter by name; see vault-wide stats (average completion, notes at/over target). Click a row to open the note.
- **Folder scoping** — include only specific folders, or exclude folders entirely (exclusions win). Also togglable from the folder context menu ("Hide/Show progress bars").
- **Per-folder targets** — give any folder its own target character count; the nearest ancestor override wins. Configurable in settings or from the folder context menu ("Set progress target…").
- **Folder progress bars** *(optional)* — folders show an aggregate bar with the average completion of the notes inside.
- **Status bar** — the active note's `characters / target · %` at a glance; click it to open the progress view.
- **Live updates** — bars update as you type/save, and on file create, delete, and rename. Folder expansion, new explorer panes, and deferred views are handled automatically.
- **Cheap** — file contents are read once via Obsidian's cached read; subsequent updates reuse the content already provided by the metadata cache. DOM writes are deduplicated and batched per animation frame.

## Settings

| Setting | Default | Description |
| --- | --- | --- |
| Target character count | 3600 | Character count at which a note is 100% full |
| Exclude frontmatter | off | Ignore the YAML frontmatter block when counting |
| Bar thickness | 2px | Height of the bar (1–4px) |
| Highlight overflowing notes | on | Purple bar when a note exceeds the target |
| Folder progress bars | off | Aggregate (average) bar on folders |
| Status bar | on | Character count / target for the active note |
| Included folders | — | If set, only these folders get bars |
| Excluded folders | — | These folders never get bars |
| Folder overrides | — | Per-folder target character counts |

Commands: `Recalculate all progress bars`, `Open progress view` (also available via the ribbon gauge icon).

## Installation

### Before the plugin is approved in the community directory (via BRAT)

The plugin can be installed **right now**, without waiting for Obsidian's review:

1. Install the [BRAT](https://obsidian.md/plugins?id=obsidian42-brat) plugin from the community directory.
2. In BRAT settings, choose **Add beta plugin** and enter this repository's URL.
3. BRAT installs the latest GitHub release and keeps it auto-updated.

### Manual install

Download `main.js`, `manifest.json`, and `styles.css` from the [latest release](../../releases/latest) into `<vault>/.obsidian/plugins/files-progress/`, then enable **Files Progress** in *Settings → Community plugins*.

### Community directory

Once approved by the Obsidian team, the plugin will be installable directly from *Settings → Community plugins*.

## Development

```bash
npm install
npm run dev    # watch mode
npm run build  # type-check + production bundle
```

Copy `main.js`, `manifest.json`, and `styles.css` into `<vault>/.obsidian/plugins/files-progress/`.
