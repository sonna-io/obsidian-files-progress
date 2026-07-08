import {
	AbstractInputSuggest,
	App,
	Notice,
	PluginSettingTab,
	Setting,
	TFile,
	TFolder,
} from "obsidian";
import type FilesProgressPlugin from "./main";
import { Palette, PaletteColors } from "./types";

class FolderSuggest extends AbstractInputSuggest<TFolder> {
	private textInputEl: HTMLInputElement;

	constructor(app: App, textInputEl: HTMLInputElement) {
		super(app, textInputEl);
		this.textInputEl = textInputEl;
	}

	getSuggestions(query: string): TFolder[] {
		const q = query.toLowerCase();
		return this.app.vault
			.getAllLoadedFiles()
			.filter(
				(f): f is TFolder =>
					f instanceof TFolder && f.path !== "/" && f.path.toLowerCase().includes(q)
			)
			.slice(0, 50);
	}

	renderSuggestion(folder: TFolder, el: HTMLElement) {
		el.setText(folder.path);
	}

	selectSuggestion(folder: TFolder) {
		this.textInputEl.value = folder.path;
		this.textInputEl.trigger("input");
		this.close();
	}
}

class FileSuggest extends AbstractInputSuggest<TFile> {
	private textInputEl: HTMLInputElement;

	constructor(app: App, textInputEl: HTMLInputElement) {
		super(app, textInputEl);
		this.textInputEl = textInputEl;
	}

	getSuggestions(query: string): TFile[] {
		const q = query.toLowerCase();
		return this.app.vault
			.getMarkdownFiles()
			.filter((f) => f.path.toLowerCase().includes(q))
			.slice(0, 50);
	}

	renderSuggestion(file: TFile, el: HTMLElement) {
		el.setText(file.path);
	}

	selectSuggestion(file: TFile) {
		this.textInputEl.value = file.path;
		this.textInputEl.trigger("input");
		this.close();
	}
}

export class FilesProgressSettingTab extends PluginSettingTab {
	plugin: FilesProgressPlugin;

	constructor(app: App, plugin: FilesProgressPlugin) {
		super(app, plugin);
		this.plugin = plugin;
	}

	display() {
		const { containerEl } = this;
		containerEl.empty();

		new Setting(containerEl)
			.setName("Target character count")
			.setDesc("A note counts as 100% full at this many characters (unless a folder or frontmatter override applies).")
			.addText((text) =>
				text
					.setPlaceholder("3600")
					.setValue(String(this.plugin.settings.targetChars))
					.onChange(async (value) => {
						const parsed = Number(value);
						if (!Number.isFinite(parsed) || parsed <= 0) return;
						this.plugin.settings.targetChars = Math.round(parsed);
						await this.plugin.saveSettings();
						this.plugin.settingsChanged();
					})
			);

		new Setting(containerEl)
			.setName("Exclude frontmatter")
			.setDesc("Ignore the YAML frontmatter block when counting characters.")
			.addToggle((toggle) =>
				toggle
					.setValue(this.plugin.settings.excludeFrontmatter)
					.onChange(async (value) => {
						this.plugin.settings.excludeFrontmatter = value;
						await this.plugin.saveSettings();
						await this.plugin.scanVault(true);
					})
			);

		new Setting(containerEl).setName("Appearance").setHeading();

		new Setting(containerEl)
			.setName("Bar thickness")
			.setDesc("Height of the progress bar, in pixels.")
			.addSlider((slider) =>
				slider
					.setLimits(1, 4, 1)
					.setValue(this.plugin.settings.barThickness)
					.setDynamicTooltip()
					.onChange(async (value) => {
						this.plugin.settings.barThickness = value;
						await this.plugin.saveSettings();
						this.plugin.applyBarThickness();
					})
			);

		new Setting(containerEl)
			.setName("Highlight overflowing notes")
			.setDesc("Use the palette's overflow color when a note exceeds the target.")
			.addToggle((toggle) =>
				toggle
					.setValue(this.plugin.settings.highlightOverflow)
					.onChange(async (value) => {
						this.plugin.settings.highlightOverflow = value;
						await this.plugin.saveSettings();
						this.plugin.settingsChanged();
					})
			);

		new Setting(containerEl)
			.setName("Folder progress bars")
			.setDesc("Show an aggregate bar on folders: the average completion of the notes inside.")
			.addToggle((toggle) =>
				toggle
					.setValue(this.plugin.settings.showFolderBars)
					.onChange(async (value) => {
						this.plugin.settings.showFolderBars = value;
						await this.plugin.saveSettings();
						this.plugin.settingsChanged();
					})
			);

		new Setting(containerEl)
			.setName("Status bar")
			.setDesc("Show the active note's character count and completion in the status bar.")
			.addToggle((toggle) =>
				toggle
					.setValue(this.plugin.settings.showStatusBar)
					.onChange(async (value) => {
						this.plugin.settings.showStatusBar = value;
						await this.plugin.saveSettings();
						this.plugin.settingsChanged();
					})
			);

		this.displayPalettes(containerEl);
		this.displayScope(containerEl);
		this.displayFrontmatter(containerEl);
		this.displayFolderRules(containerEl);
	}

	// ---------- palettes ----------

	private displayPalettes(containerEl: HTMLElement) {
		new Setting(containerEl).setName("Color palettes").setHeading();

		new Setting(containerEl)
			.setName("Default palette")
			.setDesc("Used everywhere no folder or frontmatter palette override applies.")
			.addDropdown((dropdown) => {
				for (const p of this.plugin.settings.palettes) dropdown.addOption(p.name, p.name);
				dropdown
					.setValue(this.plugin.defaultPalette().name)
					.onChange(async (value) => {
						this.plugin.settings.defaultPalette = value;
						await this.plugin.saveSettings();
						this.plugin.settingsChanged();
					});
			});

		new Setting(containerEl)
			.setName("Palettes")
			.setDesc("Colors, in order: empty (0%) · halfway (50%) · full (100%) · over target · gauge background. Fullness blends smoothly between the first three. The gauge background defaults to Obsidian's theme-aware track color (reset button restores it). The moon button adds a dark-mode variant, used automatically when Obsidian's appearance (including “adapt to system”) resolves to dark.")
			.addButton((button) =>
				button.setButtonText("Add palette").onClick(async () => {
					let name = "New palette";
					for (let i = 2; this.plugin.settings.palettes.some((p) => p.name === name); i++) {
						name = `New palette ${i}`;
					}
					this.plugin.settings.palettes.push({
						name,
						light: {
							start: "#c32222",
							mid: "#c3c322",
							end: "#22c322",
							overflow: "#a882ff",
							track: "",
						},
					});
					await this.plugin.saveSettings();
					this.display();
				})
			);

		this.plugin.settings.palettes.forEach((palette, index) => {
			this.renderPaletteRow(containerEl, palette, index, false);
			if (palette.dark) this.renderPaletteRow(containerEl, palette, index, true);
		});
	}

	private renderPaletteRow(
		containerEl: HTMLElement,
		palette: Palette,
		index: number,
		isDark: boolean
	) {
		const colors = isDark ? palette.dark! : palette.light;
		const row = new Setting(containerEl);
		row.setClass("ofp-list-item");

		if (isDark) {
			row.setClass("ofp-palette-dark");
			row.controlEl.createSpan({ cls: "ofp-palette-label", text: "Dark" });
		} else {
			row.addText((text) =>
				text
					.setPlaceholder("Palette name")
					.setValue(palette.name)
					.onChange(async (value) => {
						const newName = value.trim();
						if (!newName) return;
						this.renamePaletteReferences(palette.name, newName);
						palette.name = newName;
						await this.plugin.saveSettings();
						this.plugin.settingsChanged();
					})
			);
		}

		const colorKeys: (keyof Omit<PaletteColors, "track">)[] = [
			"start",
			"mid",
			"end",
			"overflow",
		];
		for (const key of colorKeys) {
			row.addColorPicker((picker) =>
				picker.setValue(colors[key]).onChange(async (value) => {
					colors[key] = value;
					await this.plugin.saveSettings();
					this.plugin.settingsChanged();
				})
			);
		}

		row.addColorPicker((picker) =>
			picker.setValue(colors.track || "#808080").onChange(async (value) => {
				colors.track = value;
				await this.plugin.saveSettings();
				this.plugin.settingsChanged();
			})
		);
		row.addExtraButton((button) =>
			button
				.setIcon("rotate-ccw")
				.setTooltip(
					colors.track
						? "Reset gauge background to theme default"
						: "Gauge background: theme default"
				)
				.onClick(async () => {
					if (!colors.track) return;
					colors.track = "";
					await this.plugin.saveSettings();
					this.plugin.settingsChanged();
					this.display();
				})
		);

		if (!isDark) {
			if (!palette.dark) {
				row.addExtraButton((button) =>
					button
						.setIcon("moon")
						.setTooltip("Add dark mode variant")
						.onClick(async () => {
							palette.dark = { ...palette.light };
							await this.plugin.saveSettings();
							this.plugin.settingsChanged();
							this.display();
						})
				);
			}
			row.addExtraButton((button) =>
				button
					.setIcon("trash")
					.setTooltip("Delete palette")
					.onClick(async () => {
						if (this.plugin.settings.palettes.length <= 1) {
							new Notice("At least one palette is required.");
							return;
						}
						if (palette.name === this.plugin.settings.defaultPalette) {
							new Notice("Pick a different default palette first.");
							return;
						}
						this.plugin.settings.palettes.splice(index, 1);
						await this.plugin.saveSettings();
						this.plugin.settingsChanged();
						this.display();
					})
			);
		} else {
			row.addExtraButton((button) =>
				button
					.setIcon("x")
					.setTooltip("Remove dark variant")
					.onClick(async () => {
						delete palette.dark;
						await this.plugin.saveSettings();
						this.plugin.settingsChanged();
						this.display();
					})
			);
		}
	}

	private renamePaletteReferences(oldName: string, newName: string) {
		if (this.plugin.settings.defaultPalette === oldName) {
			this.plugin.settings.defaultPalette = newName;
		}
		for (const rule of this.plugin.settings.folderRules) {
			if (rule.palette === oldName) rule.palette = newName;
		}
	}

	// ---------- scope ----------

	private displayScope(containerEl: HTMLElement) {
		new Setting(containerEl).setName("Scope").setHeading();

		this.renderPathList(
			containerEl,
			"Included folders",
			"If any folders are listed, progress bars only appear inside them (plus explicitly included files). Leave empty to include the whole vault.",
			this.plugin.settings.includedFolders,
			"folder"
		);

		this.renderPathList(
			containerEl,
			"Excluded folders",
			"Notes inside these folders never get progress bars, unless a file-level or frontmatter override includes them.",
			this.plugin.settings.excludedFolders,
			"folder"
		);

		this.renderPathList(
			containerEl,
			"Included files",
			"These notes always get a progress bar, regardless of folder scope or frontmatter. Strongest include.",
			this.plugin.settings.includedFiles,
			"file"
		);

		this.renderPathList(
			containerEl,
			"Excluded files",
			"These notes never get a progress bar. Strongest exclude — wins over everything.",
			this.plugin.settings.excludedFiles,
			"file"
		);
	}

	private renderPathList(
		containerEl: HTMLElement,
		name: string,
		desc: string,
		list: string[],
		kind: "folder" | "file"
	) {
		new Setting(containerEl)
			.setName(name)
			.setDesc(desc)
			.addButton((button) =>
				button.setButtonText(kind === "folder" ? "Add folder" : "Add file").onClick(async () => {
					list.push("");
					await this.plugin.saveSettings();
					this.display();
				})
			);

		list.forEach((path, index) => {
			const row = new Setting(containerEl);
			row.setClass("ofp-list-item");
			row.addSearch((search) => {
				if (kind === "folder") new FolderSuggest(this.app, search.inputEl);
				else new FileSuggest(this.app, search.inputEl);
				search
					.setPlaceholder(kind === "folder" ? "Folder path" : "Note path")
					.setValue(path)
					.onChange(async (value) => {
						list[index] = value;
						await this.plugin.saveSettings();
						this.plugin.settingsChanged();
					});
			});
			row.addExtraButton((button) =>
				button
					.setIcon("trash")
					.setTooltip("Remove")
					.onClick(async () => {
						list.splice(index, 1);
						await this.plugin.saveSettings();
						this.plugin.settingsChanged();
						this.display();
					})
			);
		});
	}

	// ---------- frontmatter properties ----------

	private displayFrontmatter(containerEl: HTMLElement) {
		new Setting(containerEl).setName("Frontmatter properties").setHeading();

		new Setting(containerEl)
			.setName("Scope property")
			.setDesc("Notes with this frontmatter property are included (any value) or excluded (false / no / 0), overriding folder scope. Empty disables.")
			.addText((text) =>
				text
					.setPlaceholder("progress")
					.setValue(this.plugin.settings.scopeProperty)
					.onChange(async (value) => {
						this.plugin.settings.scopeProperty = value.trim();
						await this.plugin.saveSettings();
						this.plugin.settingsChanged();
					})
			);

		new Setting(containerEl)
			.setName("Target property")
			.setDesc("Per-note target character count, e.g. progress-target: 5000. Wins over folder targets. Empty disables.")
			.addText((text) =>
				text
					.setPlaceholder("progress-target")
					.setValue(this.plugin.settings.targetProperty)
					.onChange(async (value) => {
						this.plugin.settings.targetProperty = value.trim();
						await this.plugin.saveSettings();
						this.plugin.settingsChanged();
					})
			);

		new Setting(containerEl)
			.setName("Palette property")
			.setDesc("Per-note palette by name, e.g. progress-palette: Ocean. Wins over folder palettes. Empty disables.")
			.addText((text) =>
				text
					.setPlaceholder("progress-palette")
					.setValue(this.plugin.settings.paletteProperty)
					.onChange(async (value) => {
						this.plugin.settings.paletteProperty = value.trim();
						await this.plugin.saveSettings();
						this.plugin.settingsChanged();
					})
			);
	}

	// ---------- folder rules ----------

	private displayFolderRules(containerEl: HTMLElement) {
		new Setting(containerEl).setName("Folder overrides").setHeading();

		new Setting(containerEl)
			.setName("Per-folder target and palette")
			.setDesc("Give specific folders their own target character count and/or color palette. The nearest ancestor override wins. Also available from the folder context menu.")
			.addButton((button) =>
				button.setButtonText("Add override").onClick(async () => {
					this.plugin.settings.folderRules.push({ path: "" });
					await this.plugin.saveSettings();
					this.display();
				})
			);

		this.plugin.settings.folderRules.forEach((rule, index) => {
			const row = new Setting(containerEl);
			row.setClass("ofp-list-item");
			row.addSearch((search) => {
				new FolderSuggest(this.app, search.inputEl);
				search
					.setPlaceholder("Folder path")
					.setValue(rule.path)
					.onChange(async (value) => {
						rule.path = value;
						await this.plugin.saveSettings();
						this.plugin.settingsChanged();
					});
			});
			row.addText((text) => {
				text.inputEl.type = "number";
				text
					.setPlaceholder(String(this.plugin.settings.targetChars))
					.setValue(rule.target ? String(rule.target) : "")
					.onChange(async (value) => {
						const parsed = Math.round(Number(value));
						if (value.trim() === "") delete rule.target;
						else if (Number.isFinite(parsed) && parsed > 0) rule.target = parsed;
						else return;
						await this.plugin.saveSettings();
						this.plugin.settingsChanged();
					});
			});
			row.addDropdown((dropdown) => {
				dropdown.addOption("", "Inherit palette");
				for (const p of this.plugin.settings.palettes) dropdown.addOption(p.name, p.name);
				dropdown.setValue(rule.palette ?? "").onChange(async (value) => {
					if (value) rule.palette = value;
					else delete rule.palette;
					await this.plugin.saveSettings();
					this.plugin.settingsChanged();
				});
			});
			row.addExtraButton((button) =>
				button
					.setIcon("trash")
					.setTooltip("Remove override")
					.onClick(async () => {
						this.plugin.settings.folderRules.splice(index, 1);
						await this.plugin.saveSettings();
						this.plugin.settingsChanged();
						this.display();
					})
			);
		});
	}
}
