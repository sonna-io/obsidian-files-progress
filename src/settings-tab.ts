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
import { DEFAULT_SETTINGS } from "./types";
import type { Palette, PaletteColors } from "./types";

interface SettingDefinitionRender {
	name: string;
	desc?: string;
	searchable?: boolean;
	render: (setting: Setting) => void;
}

interface SettingDefinitionGroup {
	type: "group";
	heading: string;
	items: SettingDefinitionRender[];
}

type SettingDefinitionItem = SettingDefinitionRender | SettingDefinitionGroup;

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
		this.containerEl.empty();
		for (const definition of this.getSettingDefinitions()) {
			if ("type" in definition) {
				new Setting(this.containerEl).setName(definition.heading).setHeading();
				for (const item of definition.items) this.displayDefinition(item);
			} else {
				this.displayDefinition(definition);
			}
		}
	}

	private displayDefinition(definition: SettingDefinitionRender) {
		const setting = new Setting(this.containerEl).setName(definition.name);
		if (definition.desc) setting.setDesc(definition.desc);
		definition.render(setting);
	}

	getSettingDefinitions(): SettingDefinitionItem[] {
		return [
			this.renderSetting(
				"Target character count",
				"A note counts as 100% full at this many characters (unless a folder or frontmatter override applies).",
				(setting) => {
					setting.addText((text) =>
						text
							.setPlaceholder("3600")
							.setValue(String(this.plugin.settings.targetChars))
							.onChange(async (value) => {
								const parsed = Math.round(Number(value));
								if (!Number.isFinite(parsed) || parsed <= 0) return;
								this.plugin.settings.targetChars = parsed;
								await this.plugin.saveSettings();
								this.plugin.settingsChanged();
							})
					);
				}
			),
			this.renderSetting(
				"Exclude frontmatter",
				"Ignore the YAML frontmatter block when counting characters.",
				(setting) => {
					setting.addToggle((toggle) =>
						toggle
							.setValue(this.plugin.settings.excludeFrontmatter)
							.onChange(async (value) => {
								this.plugin.settings.excludeFrontmatter = value;
								await this.plugin.saveSettings();
								await this.plugin.scanVault(true);
							})
					);
				}
			),
			this.appearanceDefinitions(),
			this.paletteDefinitions(),
			this.scopeDefinitions(),
			this.frontmatterDefinitions(),
			this.folderRuleDefinitions(),
		];
	}

	private renderSetting(
		name: string,
		desc: string,
		render: SettingDefinitionRender["render"]
	): SettingDefinitionRender {
		return { name, desc, render };
	}

	private appearanceDefinitions(): SettingDefinitionGroup {
		return {
			type: "group",
			heading: "Appearance",
			items: [
				this.renderSetting("Bar thickness", "Height of the progress bar, in pixels.", (setting) => {
					setting.addSlider((slider) =>
						slider
							.setLimits(1, 4, 1)
							.setValue(this.plugin.settings.barThickness)
							.onChange(async (value) => {
								this.plugin.settings.barThickness = value;
								await this.plugin.saveSettings();
								this.plugin.applyBarThickness();
							})
					);
				}),
				this.renderSetting(
					"Highlight overflowing notes",
					"Use the palette's overflow color when a note exceeds the target.",
					(setting) => {
						setting.addToggle((toggle) =>
							toggle
								.setValue(this.plugin.settings.highlightOverflow)
								.onChange(async (value) => {
									this.plugin.settings.highlightOverflow = value;
									await this.plugin.saveSettings();
									this.plugin.settingsChanged();
								})
						);
					}
				),
				this.renderSetting(
					"Folder progress bars",
					"Show an aggregate bar on folders: the average completion of the notes inside.",
					(setting) => {
						setting.addToggle((toggle) =>
							toggle
								.setValue(this.plugin.settings.showFolderBars)
								.onChange(async (value) => {
									this.plugin.settings.showFolderBars = value;
									await this.plugin.saveSettings();
									this.plugin.settingsChanged();
								})
						);
					}
				),
				this.renderSetting(
					"Status bar",
					"Show the active note's character count and completion in the status bar.",
					(setting) => {
						setting.addToggle((toggle) =>
							toggle
								.setValue(this.plugin.settings.showStatusBar)
								.onChange(async (value) => {
									this.plugin.settings.showStatusBar = value;
									await this.plugin.saveSettings();
									this.plugin.settingsChanged();
								})
						);
					}
				),
			],
		};
	}

	// ---------- palettes ----------

	private paletteDefinitions(): SettingDefinitionGroup {
		const items: SettingDefinitionRender[] = [
			this.renderSetting(
				"Default palette",
				"Used everywhere no folder or frontmatter palette override applies.",
				(setting) => {
					setting.addDropdown((dropdown) => {
						for (const palette of this.plugin.settings.palettes) {
							dropdown.addOption(palette.name, palette.name);
						}
						dropdown
							.setValue(this.plugin.defaultPalette().name)
							.onChange(async (value) => {
								this.plugin.settings.defaultPalette = value;
								await this.plugin.saveSettings();
								this.plugin.settingsChanged();
							});
					});
				}
			),
			this.renderSetting(
				"Palettes",
				"Colors, in order: empty (0%) · halfway (50%) · full (100%) · over target · gauge background. Fullness blends smoothly between the first three. The gauge background defaults to Obsidian's theme-aware track color (reset button restores it). The moon button adds a dark-mode variant, used automatically when Obsidian's appearance (including “adapt to system”) resolves to dark.",
				(setting) => {
					setting.addButton((button) =>
						button.setButtonText("Add palette").onClick(async () => {
							let name = "New palette";
							for (
								let i = 2;
								this.plugin.settings.palettes.some((palette) => palette.name === name);
								i++
							) {
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
				}
			),
		];

		this.plugin.settings.palettes.forEach((palette, index) => {
			items.push(this.paletteRowDefinition(palette, index, false));
			if (palette.dark) items.push(this.paletteRowDefinition(palette, index, true));
		});

		return { type: "group", heading: "Color palettes", items };
	}

	private paletteRowDefinition(
		palette: Palette,
		index: number,
		isDark: boolean
	): SettingDefinitionRender {
		return {
			name: isDark ? `${palette.name} dark palette` : `${palette.name} palette`,
			searchable: false,
			render: (setting) => {
				setting.setName("");
				this.renderPaletteRow(setting, palette, index, isDark);
			},
		};
	}

	private renderPaletteRow(
		row: Setting,
		palette: Palette,
		index: number,
		isDark: boolean
	) {
		const colors = isDark ? palette.dark : palette.light;
		if (!colors) return;
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

	private scopeDefinitions(): SettingDefinitionGroup {
		return {
			type: "group",
			heading: "Scope",
			items: [
				...this.pathListDefinitions(
					"Included folders",
					"If any folders are listed, progress bars only appear inside them (plus explicitly included files). Leave empty to include the whole vault.",
					this.plugin.settings.includedFolders,
					"folder"
				),
				...this.pathListDefinitions(
					"Excluded folders",
					"Notes inside these folders never get progress bars, unless a file-level or frontmatter override includes them.",
					this.plugin.settings.excludedFolders,
					"folder"
				),
				...this.pathListDefinitions(
					"Included files",
					"These notes always get a progress bar, regardless of folder scope or frontmatter. Strongest include.",
					this.plugin.settings.includedFiles,
					"file"
				),
				...this.pathListDefinitions(
					"Excluded files",
					"These notes never get a progress bar. Strongest exclude — wins over everything.",
					this.plugin.settings.excludedFiles,
					"file"
				),
			],
		};
	}

	private pathListDefinitions(
		name: string,
		desc: string,
		list: string[],
		kind: "folder" | "file"
	): SettingDefinitionRender[] {
		const definitions: SettingDefinitionRender[] = [
			this.renderSetting(name, desc, (setting) => {
				setting.addButton((button) =>
					button
						.setButtonText(kind === "folder" ? "Add folder" : "Add file")
						.onClick(async () => {
							list.push("");
							await this.plugin.saveSettings();
							this.display();
						})
				);
			}),
		];

		list.forEach((path, index) => {
			definitions.push({
				name: path || `${kind} path`,
				searchable: false,
				render: (row) => {
					row.setName("");
					row.setClass("ofp-list-item");
					let suggest: FolderSuggest | FileSuggest | null = null;
					row.addSearch((search) => {
						suggest =
							kind === "folder"
								? new FolderSuggest(this.app, search.inputEl)
								: new FileSuggest(this.app, search.inputEl);
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
					return () => suggest?.close();
				},
			});
		});

		return definitions;
	}

	// ---------- frontmatter properties ----------

	private frontmatterDefinitions(): SettingDefinitionGroup {
		return {
			type: "group",
			heading: "Frontmatter properties",
			items: [
				this.renderSetting(
					"Scope property",
					"Notes with this frontmatter property are included (any value) or excluded (false / no / 0), overriding folder scope. Empty disables.",
					(setting) => {
						setting.addText((text) =>
							text
								.setPlaceholder(DEFAULT_SETTINGS.scopeProperty)
								.setValue(this.plugin.settings.scopeProperty)
								.onChange(async (value) => {
									this.plugin.settings.scopeProperty = value.trim();
									await this.plugin.saveSettings();
									this.plugin.settingsChanged();
								})
						);
					}
				),
				this.renderSetting(
					"Manual progress property",
					"Use this frontmatter property for a manual completion percentage from 1 to 100. Decimal values are supported and override character-based progress. Empty disables.",
					(setting) => {
						setting.addText((text) =>
							text
								.setPlaceholder(DEFAULT_SETTINGS.manualProgressProperty)
								.setValue(this.plugin.settings.manualProgressProperty)
								.onChange(async (value) => {
									this.plugin.settings.manualProgressProperty = value.trim();
									await this.plugin.saveSettings();
									this.plugin.settingsChanged();
								})
						);
					}
				),
				this.renderSetting(
					"Target property",
					"Per-note target character count, e.g. progress-target: 5000. Wins over folder targets. Empty disables.",
					(setting) => {
						setting.addText((text) =>
							text
								.setPlaceholder(DEFAULT_SETTINGS.targetProperty)
								.setValue(this.plugin.settings.targetProperty)
								.onChange(async (value) => {
									this.plugin.settings.targetProperty = value.trim();
									await this.plugin.saveSettings();
									this.plugin.settingsChanged();
								})
						);
					}
				),
				this.renderSetting(
					"Palette property",
					"Per-note palette by name, e.g. progress-palette: Ocean. Wins over folder palettes. Empty disables.",
					(setting) => {
						setting.addText((text) =>
							text
								.setPlaceholder(DEFAULT_SETTINGS.paletteProperty)
								.setValue(this.plugin.settings.paletteProperty)
								.onChange(async (value) => {
									this.plugin.settings.paletteProperty = value.trim();
									await this.plugin.saveSettings();
									this.plugin.settingsChanged();
								})
						);
					}
				),
			],
		};
	}

	// ---------- folder rules ----------

	private folderRuleDefinitions(): SettingDefinitionGroup {
		const items: SettingDefinitionRender[] = [
			this.renderSetting(
				"Per-folder target and palette",
				"Give specific folders their own target character count and/or color palette. The nearest ancestor override wins. Also available from the folder context menu.",
				(setting) => {
					setting.addButton((button) =>
						button.setButtonText("Add override").onClick(async () => {
							this.plugin.settings.folderRules.push({ path: "" });
							await this.plugin.saveSettings();
							this.display();
						})
					);
				}
			),
		];

		this.plugin.settings.folderRules.forEach((rule, index) => {
			items.push({
				name: rule.path || "Folder override",
				searchable: false,
				render: (row) => {
					row.setName("");
					row.setClass("ofp-list-item");
					let suggest: FolderSuggest | null = null;
					row.addSearch((search) => {
						suggest = new FolderSuggest(this.app, search.inputEl);
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
						for (const palette of this.plugin.settings.palettes) {
							dropdown.addOption(palette.name, palette.name);
						}
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
					return () => suggest?.close();
				},
			});
		});

		return { type: "group", heading: "Folder overrides", items };
	}
}
