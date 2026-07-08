# Files Progress

An Obsidian plugin that enhances the file explorer with the tiniest possible horizontal progress bar under each markdown file, showing how "full" the note is relative to a target character count.

## Features

- **Tiny, seamless bars** — a 2px (configurable 1–4px) bar rendered inside Obsidian's native file explorer rows, aligned with the file name indentation, using theme variables so it blends with any theme.
- **Fullness by character count** — a note is 100% full at the target character count (default **3600**, configurable globally, per folder, and per note via frontmatter).
- **Custom color palettes** — palettes define the colors at 0%, 50%, 100%, and past the target, blended smoothly in between. Three presets ship (Default red→yellow→green, Ocean, Violet); create, edit, and delete palettes with color pickers. Assign a default palette, per-folder palettes, or a per-note palette via frontmatter.
- **Progress view** — a sidebar view listing every note in scope with its completion. Sort by completion, name, folder path, character count, or recent modification; group by folder (collapsible, with per-folder averages); filter by name; see vault-wide stats (average completion, notes at/over target). Click a row to open the note.
- **Folder & file scoping** — include only specific folders, exclude folders, and force-include or force-exclude individual notes. Togglable from the context menu of any folder or note, or with the "Toggle progress bar for active note" command. Scope lists follow file renames automatically.
- **Frontmatter control** — three configurable properties: `progress` (include/exclude a note: any value includes, `false`/`no` excludes — overrides folder scope), `progress-target` (per-note target character count), and `progress-palette` (per-note palette by name).
- **Per-folder overrides** — give any folder its own target and/or palette; the nearest ancestor override wins. Configurable in settings or from the folder context menu ("Progress settings…").
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
| Highlight overflowing notes | on | Use the palette's overflow color past the target |
| Folder progress bars | off | Aggregate (average) bar on folders |
| Status bar | on | Character count / target for the active note |
| Default palette | Default | Palette used when nothing overrides it |
| Palettes | 3 presets | Editable palettes: 0% · 50% · 100% · overflow colors |
| Included / excluded folders | — | Folder-level scope |
| Included / excluded files | — | Note-level scope (strongest) |
| Scope property | `progress` | Frontmatter include/exclude keyword |
| Target property | `progress-target` | Frontmatter per-note target |
| Palette property | `progress-palette` | Frontmatter per-note palette |
| Folder overrides | — | Per-folder target and/or palette |

**Scope precedence** (most specific wins): excluded files → included files → frontmatter scope property → excluded folders → included folders → everything in.
**Target precedence**: frontmatter → nearest folder override → global default. **Palette precedence**: frontmatter → nearest folder override → default palette.

Commands: `Recalculate all progress bars`, `Open progress view` (also via the ribbon gauge icon), `Toggle progress bar for active note`.

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
