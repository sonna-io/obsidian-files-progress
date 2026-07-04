# Files Progress

An Obsidian plugin that enhances the file explorer with the tiniest possible horizontal progress bar under each markdown file, showing how "full" the note is relative to a target character count.

## Features

- **Tiny, seamless bars** — a 2px (configurable 1–4px) bar rendered inside Obsidian's native file explorer rows, aligned with the file name indentation, using theme variables so it blends with any theme.
- **Fullness by character count** — a note is 100% full at the target character count (default **3600**, configurable).
- **Color reflects fullness** — smooth hue gradient from red (empty) through yellow to green (full). Notes that exceed the target turn purple (optional).
- **Live updates** — bars update as you type/save, and on file create, delete, and rename. Folder expansion, new explorer panes, and deferred views are handled automatically.
- **Cheap** — file contents are read once via Obsidian's cached read; subsequent updates reuse the content already provided by the metadata cache. DOM writes are deduplicated and batched per animation frame.

## Settings

| Setting | Default | Description |
| --- | --- | --- |
| Target character count | 3600 | Character count at which a note is 100% full |
| Exclude frontmatter | off | Ignore the YAML frontmatter block when counting |
| Bar thickness | 2px | Height of the bar (1–4px) |
| Highlight overflowing notes | on | Purple bar when a note exceeds the target |

A `Recalculate all progress bars` command is available in the command palette.

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
