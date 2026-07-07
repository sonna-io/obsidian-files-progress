import { AbstractInputSuggest, App, PluginSettingTab, Setting, TFolder } from "obsidian";
import type FilesProgressPlugin from "./main";

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
			.setDesc("A note counts as 100% full at this many characters (unless a folder override applies).")
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
			.setDesc("Show a purple bar when a note exceeds the target, instead of staying green.")
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

		new Setting(containerEl).setName("Scope").setHeading();

		this.renderFolderList(
			containerEl,
			"Included folders",
			"If any folders are listed, progress bars only appear inside them. Leave empty to include the whole vault.",
			this.plugin.settings.includedFolders
		);

		this.renderFolderList(
			containerEl,
			"Excluded folders",
			"Notes inside these folders never get progress bars. Exclusions win over inclusions.",
			this.plugin.settings.excludedFolders
		);

		new Setting(containerEl).setName("Per-folder targets").setHeading();

		new Setting(containerEl)
			.setName("Folder overrides")
			.setDesc("Give specific folders their own target character count. The nearest ancestor override wins; everything else uses the default. Also available from the folder context menu.")
			.addButton((button) =>
				button.setButtonText("Add override").onClick(async () => {
					this.plugin.settings.folderTargets.push({
						path: "",
						target: this.plugin.settings.targetChars,
					});
					await this.plugin.saveSettings();
					this.display();
				})
			);

		this.plugin.settings.folderTargets.forEach((entry, index) => {
			const row = new Setting(containerEl);
			row.setClass("ofp-list-item");
			row.addSearch((search) => {
				new FolderSuggest(this.app, search.inputEl);
				search
					.setPlaceholder("Folder path")
					.setValue(entry.path)
					.onChange(async (value) => {
						entry.path = value;
						await this.plugin.saveSettings();
						this.plugin.settingsChanged();
					});
			});
			row.addText((text) => {
				text.inputEl.type = "number";
				text
					.setPlaceholder(String(this.plugin.settings.targetChars))
					.setValue(String(entry.target))
					.onChange(async (value) => {
						const parsed = Math.round(Number(value));
						if (!Number.isFinite(parsed) || parsed <= 0) return;
						entry.target = parsed;
						await this.plugin.saveSettings();
						this.plugin.settingsChanged();
					});
			});
			row.addExtraButton((button) =>
				button
					.setIcon("trash")
					.setTooltip("Remove override")
					.onClick(async () => {
						this.plugin.settings.folderTargets.splice(index, 1);
						await this.plugin.saveSettings();
						this.plugin.settingsChanged();
						this.display();
					})
			);
		});
	}

	private renderFolderList(
		containerEl: HTMLElement,
		name: string,
		desc: string,
		list: string[]
	) {
		new Setting(containerEl)
			.setName(name)
			.setDesc(desc)
			.addButton((button) =>
				button.setButtonText("Add folder").onClick(async () => {
					list.push("");
					await this.plugin.saveSettings();
					this.display();
				})
			);

		list.forEach((folder, index) => {
			const row = new Setting(containerEl);
			row.setClass("ofp-list-item");
			row.addSearch((search) => {
				new FolderSuggest(this.app, search.inputEl);
				search
					.setPlaceholder("Folder path")
					.setValue(folder)
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
}
