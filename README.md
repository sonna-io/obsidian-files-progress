# Files Progress

See the state of your notes without opening them.

Files Progress adds a slim, color-coded progress bar below each Markdown note in Obsidian's File Explorer. It also provides a dedicated sidebar for reviewing progress across your vault.

It works automatically from note length. You are free to set an exact percentage whenever length is not a meaningful measure.

**Quick links:** [Install](#installation) · [Get started](#getting-started) · [Set manual progress](#set-progress-manually-without-editing-code) · [Troubleshoot](#troubleshooting)

## Why use Files Progress?

Large vaults make it easy to lose track of unfinished drafts, short reference notes, and documents that have grown beyond their intended size.

Files Progress gives writers, researchers, students, and knowledge workers a quiet visual overview without turning every note into a task.

- See which notes are barely started, halfway complete, or full.
- Review all tracked notes from one sortable sidebar.
- Give projects and folders different targets or colors.
- Set an exact percentage for work that cannot be measured by length.
- Hide progress from notes or folders where it is not useful.
- Apply the same change to several selected notes or folders at once.

The bars are intentionally tiny. They add useful context while keeping Obsidian's File Explorer familiar and uncluttered.

## Installation

Files Progress is currently distributed through BRAT while its Community directory listing is pending.

### Install with BRAT

BRAT is a community plugin that installs beta plugins from GitHub and keeps them updated. Obsidian's developer documentation recommends it for beta testing.

1. Open **Settings → Community plugins** in Obsidian.
2. Select **Browse**, search for **BRAT**, then install and enable it.
3. Open **Settings → BRAT**.
4. Select **Add beta plugin**.
5. Enter `sonna-io/obsidian-files-progress`.
6. Confirm the installation, then enable **Files Progress** under Community plugins.

Use that exact repository name. Similar spellings such as `obsidian-fles-progress` will not work.

### Install manually

Manual installation is intended for advanced users:

1. Download `main.js`, `manifest.json`, and `styles.css` from the [latest release](../../releases/latest).
2. Create `<your vault>/.obsidian/plugins/files-progress/`.
3. Place the three files in that folder.
4. Reload Obsidian.
5. Enable **Files Progress** under **Settings → Community plugins**.

Files Progress requires Obsidian 1.5.7 or newer.

### Community directory availability

A GitHub release does not automatically place a plugin in Obsidian's Community plugins browser.

The plugin must first complete Obsidian's [Community directory submission and review](https://docs.obsidian.md/Plugins/Releasing/Submit%20your%20plugin). After approval, future updates will be available directly in Obsidian.

## Getting started

After enabling the plugin, Markdown notes in the File Explorer receive a progress bar automatically.

By default, a note reaches 100% at 3,600 characters. You can change this target under **Settings → Files Progress**.

Select the gauge icon in Obsidian's ribbon to open the **Files Progress** sidebar. The status bar also shows progress for the active note and opens the sidebar when selected.

You do not need to add Properties to every note. Automatic character-based progress works immediately.

## Understanding the progress bar

The filled width represents the note's current progress. The default palette moves from red through yellow to green as the note approaches its target.

A note can exceed 100%. When overflow highlighting is enabled, notes beyond their target use the palette's overflow color.

The smallest non-zero values remain visible as a thin sliver, so recently started notes do not look empty.

Characters include letters, spaces, punctuation, and line breaks. Bars refresh as notes change and follow file creation, deletion, and renaming.

### How automatic progress is calculated

```text
progress = note character count ÷ effective target
```

The effective target comes from the first available source:

1. The note's `progress-target` Property.
2. The nearest folder target override.
3. The global target in plugin settings.

Enable **Exclude frontmatter** if Obsidian Properties should not count toward the note's character total.

## Everyday use

### File Explorer context menu

Right-click a Markdown note or folder to access Files Progress actions:

- **Progress settings…** — apply several choices from one window.
- **Show/Hide progress bar** — control whether the selected item participates.
- **Set manual progress…** — assign an exact percentage to selected notes.
- **Set progress target…** — change the target for notes or folders.
- **Set color palette…** — choose a palette for notes or folders.
- **Clear progress overrides…** — return selected items to inherited defaults.

Obsidian's native multi-selection is supported. Select several files or folders in the File Explorer, then right-click the selection to apply one action to all of them.

Folder actions create folder rules. They do not add or remove Properties from every note inside the folder.

### Files Progress sidebar

The sidebar lists every included note with its percentage, character count, target, and optional folder path.

You can sort by completion, name, folder path, character count, or modification time. Grouping by folder adds collapsible headers and folder averages.

Select a note to open it. On desktop, use Ctrl/Cmd-click to toggle items and Shift-click to select a range. Right-click any selected row to apply an action to the complete selection.

Folder headers can also be selected and configured when **Group by folder** is enabled.

### Filter a large vault

The sidebar filter supports ordinary text and a few optional patterns:

| Filter | Meaning |
| --- | --- |
| `draft` | Paths or filenames containing “draft” |
| `Daily*` | Names starting with “Daily” |
| `Projects/**` | Everything below the Projects folder |
| `!Archive` | Exclude paths containing “Archive” |
| `draft, !old` | Include draft results except old ones |

Buttons beside the filter enable case matching, whole-word matching, or regular expressions. Most users can simply type part of a filename or folder name.

## Set progress manually without editing code

Use manual progress when a note's completion is based on research, review, approvals, or another measure that character count cannot represent.

### From the context menu

1. Right-click the note.
2. Select **Set manual progress…**.
3. Enter a number from 1 through 100.
4. Select **Apply**.

Decimals are supported, such as `42.5`.

The manual value is used consistently in the File Explorer, progress sidebar, folder averages, and status bar.

### From Obsidian Properties

You can make the same change in the note's Properties area:

1. Open the note.
2. Select **Add property** at the top of the note.
3. Name the Property `progress-percent`.
4. Enter a number from 1 through 100.

For example, `progress-percent: 50` displays the note at exactly 50%, even if its folder has a different target.

Delete the Property, clear it through the context menu, or choose **Clear / inherit** to return to automatic progress.

The Property name is configurable. If you rename it under **Settings → Files Progress → Frontmatter properties**, use that name in your notes instead.

### YAML example for advanced users

Obsidian stores Properties as YAML at the beginning of a Markdown file. These values are equivalent:

```yaml
---
progress-percent: 50
---
```

```yaml
---
progress-percent: "50.0"
---
```

Valid numeric or quoted values from 1 through 100 are accepted. Invalid values are ignored, and the plugin safely returns to automatic calculation.

## Choose which notes show progress

Every Markdown note is included by default. Use context-menu actions or the **Scope** section in plugin settings to focus on the parts of your vault that matter.

- Included files are always shown unless the same file is explicitly excluded.
- Excluded files are always hidden and have the strongest priority.
- Included folders can limit progress to selected areas of the vault.
- Excluded folders hide their contents unless a file-level or Property override includes a note.

The optional `progress` Property controls one note directly:

```yaml
---
progress: true
---
```

Use `progress: false`, `progress: no`, or `progress: 0` to exclude a note. Any other non-empty value includes it.

Manual progress does not change visibility. A hidden note remains hidden until its scope is changed.

## Folder targets and palettes

Folders can inherit a shared target and palette without modifying their notes.

Right-click a folder and choose **Progress settings…**, or add a folder override under plugin settings. The rule applies to notes in that folder and its subfolders.

When several folder rules apply, the nearest parent folder wins. A note-level Property still takes priority over its folder rule.

Optional folder progress bars show the average completion of included notes below each folder. Each note contributes no more than 100% to that average.

## Color palettes

Files Progress includes three palettes:

- **Default** — red to yellow to green.
- **Ocean** — light blue to deep blue.
- **Violet** — pale violet to deep violet.

Create or edit palettes under **Settings → Files Progress → Palettes**. Each palette controls colors at 0%, 50%, 100%, overflow, and the unfilled background.

Palettes can include a separate dark-mode version. When it is omitted, the light palette is reused. The plugin follows Obsidian's current light, dark, or system-adaptive appearance.

Assign palettes globally, by folder, or to individual notes. Use the `progress-palette` Property for direct note control.

## Settings reference

### General and appearance

| Setting | Default | What it does |
| --- | --- | --- |
| Target character count | 3,600 | Defines 100% for automatic progress |
| Exclude frontmatter | Off | Ignores the Properties block when counting |
| Bar thickness | 2 px | Sets the bar height from 1–4 px |
| Highlight overflowing notes | On | Uses the overflow color above 100% |
| Folder progress bars | Off | Shows average progress below folders |
| Status bar | On | Shows progress for the active note |
| Default palette | Default | Selects the vault-wide palette |

### Scope and folder rules

| Setting | What it does |
| --- | --- |
| Included folders | Limits or restores progress for folder trees |
| Excluded folders | Hides progress for folder trees |
| Included files | Forces progress on for individual notes |
| Excluded files | Forces progress off for individual notes |
| Folder overrides | Assigns folder targets and palettes |

### Frontmatter Properties

“Frontmatter” is the technical name for Obsidian's Properties block at the start of a note.

| Setting | Default Property | Purpose |
| --- | --- | --- |
| Scope property | `progress` | Includes or excludes one note |
| Manual progress property | `progress-percent` | Sets completion from 1–100 |
| Target property | `progress-target` | Sets the note's character target |
| Palette property | `progress-palette` | Selects a palette by name |

Leave a Property-name setting empty to disable that type of note-level override.

## Commands

Open Obsidian's Command palette to use:

- **Files Progress: Recalculate all progress bars**
- **Files Progress: Open progress view**
- **Files Progress: Toggle progress bar for active note**

The recalculate command is useful after changing many notes outside Obsidian or when a displayed count appears stale.

## Troubleshooting

### A menu action opens an empty window

Update Files Progress through BRAT, then fully reload Obsidian. Disabling and re-enabling the plugin also reloads its JavaScript.

If the problem continues, confirm that the installed plugin reports version 1.5.0 or newer.

### Manual progress is ignored

Check the following:

1. The Property name matches **Manual progress property** in plugin settings.
2. The value is a number from 1 through 100.
3. The note is not hidden by file or folder scope.
4. Files Progress has been reloaded after an update.

Values such as `50`, `50.0`, `"50"`, and `"50.0"` are supported.

### A progress bar is missing

- Confirm that the file is a Markdown note ending in `.md`.
- Right-click the note and choose **Show progress bar**.
- Review included and excluded folders in plugin settings.
- Run **Recalculate all progress bars** from the Command palette.

### BRAT reports an incompatible Obsidian version

Confirm that BRAT is using `sonna-io/obsidian-files-progress` and that Files Progress 1.5.0 or newer is available.

The previous 1.4.0 beta accidentally required Obsidian 1.13. Files Progress 1.5.0 restores support for Obsidian 1.5.7 and newer.

### BRAT cannot find the plugin

Use the exact repository name `sonna-io/obsidian-files-progress`. Remove any failed entry with a misspelled name, then add the correct repository again.

## Privacy and performance

Files Progress works locally inside your vault.

- It reads Markdown text only to calculate character counts.
- It does not read the contents of non-Markdown files.
- It does not send vault data over the network.
- It includes no telemetry, advertising, or account requirement.
- It uses Obsidian's cached reads and batches visual updates.

Automatic progress is read-only. Notes are changed only when you explicitly apply a note-level setting that writes or clears one of the configured Properties.

## Compatibility

- Minimum Obsidian version: **1.5.7**.
- Desktop-only: **No**.
- Keyboard multi-selection shortcuts are desktop-specific.
- Bars and palettes follow Obsidian themes and pop-out windows.

## Feedback and support

Found a problem or have an idea? Open a [GitHub issue](../../issues) and include:

- Your Obsidian and Files Progress versions.
- Whether the issue appears in the File Explorer, progress sidebar, or both.
- The relevant Property names and values, with private note content removed.
- A screenshot when the problem is visual.

## Development

The remaining sections are for contributors and plugin maintainers.

```bash
npm install
npm run dev    # watch mode
npm run build  # type-check and production bundle
npm run check  # lint, automated tests, type-check, and build
```


The script copies only `main.js`, `manifest.json`, and `styles.css`, then verifies their SHA-256 hashes. Reload Obsidian or disable and re-enable Files Progress afterward.

### Release

Update `manifest.json`, `package.json`, and `versions.json`, commit the release on a clean `main` branch, then run:

```powershell
.\publish.ps1
```

The script runs all checks before pushing the version tag. GitHub Actions rebuilds and attests the release assets, and the script downloads them to verify metadata and hashes.

Do not move an existing version tag or replace its release assets. Publish corrections under a new semantic version.

## License

Files Progress is released under the [MIT License](LICENSE).
