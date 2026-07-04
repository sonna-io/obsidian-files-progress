import { App, Plugin, PluginSettingTab, Setting, TFile } from "obsidian";

interface FilesProgressSettings {
	targetChars: number;
	excludeFrontmatter: boolean;
	barThickness: number;
	highlightOverflow: boolean;
}

const DEFAULT_SETTINGS: FilesProgressSettings = {
	targetChars: 3600,
	excludeFrontmatter: false,
	barThickness: 2,
	highlightOverflow: true,
};

/** Minimal shape of the (undocumented) file explorer view internals we rely on. */
interface FileExplorerItem {
	selfEl?: HTMLElement;
	titleEl?: HTMLElement;
}

interface FileExplorerView {
	fileItems?: Record<string, FileExplorerItem>;
	containerEl?: HTMLElement;
}

const FRONTMATTER_RE = /^---\r?\n[\s\S]*?\r?\n---(?:\r?\n|$)/;

export default class FilesProgressPlugin extends Plugin {
	settings: FilesProgressSettings = DEFAULT_SETTINGS;

	private counts = new Map<string, number>();
	private pendingReads = new Set<string>();
	private observers: { observer: MutationObserver; el: HTMLElement }[] = [];
	private refreshQueued = false;

	async onload() {
		await this.loadSettings();
		this.addSettingTab(new FilesProgressSettingTab(this.app, this));
		this.applyBarThickness();

		// Fires on every content change of a markdown file and hands us the
		// new content, so no extra disk read is needed.
		this.registerEvent(
			this.app.metadataCache.on("changed", (file, data) => {
				this.counts.set(file.path, this.countChars(data));
				this.updateFile(file.path);
			})
		);

		this.registerEvent(
			this.app.vault.on("create", (file) => {
				if (file instanceof TFile && file.extension === "md" && !this.counts.has(file.path)) {
					void this.readCount(file);
				}
			})
		);

		this.registerEvent(
			this.app.vault.on("delete", (file) => {
				this.counts.delete(file.path);
			})
		);

		this.registerEvent(
			this.app.vault.on("rename", (file, oldPath) => {
				const count = this.counts.get(oldPath);
				this.counts.delete(oldPath);
				if (count !== undefined) this.counts.set(file.path, count);
				this.scheduleRefresh();
			})
		);

		// Catches newly created explorer leaves and deferred views finishing loading.
		this.registerEvent(
			this.app.workspace.on("layout-change", () => this.attachToExplorers())
		);

		this.addCommand({
			id: "recalculate",
			name: "Recalculate all progress bars",
			callback: () => void this.scanVault(true),
		});

		this.app.workspace.onLayoutReady(() => {
			this.attachToExplorers();
			void this.scanVault();
		});
	}

	onunload() {
		for (const { observer } of this.observers) observer.disconnect();
		this.observers = [];
		document.body.style.removeProperty("--ofp-thickness");
		for (const bar of Array.from(document.querySelectorAll(".ofp-bar"))) bar.remove();
		for (const host of Array.from(document.querySelectorAll(".ofp-host"))) {
			host.removeClass("ofp-host");
		}
	}

	async loadSettings() {
		this.settings = Object.assign({}, DEFAULT_SETTINGS, await this.loadData());
	}

	async saveSettings() {
		await this.saveData(this.settings);
	}

	applyBarThickness() {
		document.body.style.setProperty("--ofp-thickness", `${this.settings.barThickness}px`);
	}

	// ---------- character counting ----------

	countChars(content: string): number {
		let text = content;
		if (this.settings.excludeFrontmatter) {
			text = text.replace(FRONTMATTER_RE, "");
		}
		return text.length;
	}

	private async readCount(file: TFile) {
		if (this.pendingReads.has(file.path)) return;
		this.pendingReads.add(file.path);
		try {
			const content = await this.app.vault.cachedRead(file);
			this.counts.set(file.path, this.countChars(content));
			this.updateFile(file.path);
		} catch {
			// File vanished mid-read; it stays undecorated.
		} finally {
			this.pendingReads.delete(file.path);
		}
	}

	async scanVault(force = false) {
		const queue = this.app.vault
			.getMarkdownFiles()
			.filter((file) => force || !this.counts.has(file.path));
		const worker = async () => {
			for (let file = queue.pop(); file; file = queue.pop()) {
				await this.readCount(file);
			}
		};
		await Promise.all(Array.from({ length: 8 }, worker));
		this.scheduleRefresh();
	}

	// ---------- explorer integration ----------

	private explorerViews(): FileExplorerView[] {
		return this.app.workspace
			.getLeavesOfType("file-explorer")
			.map((leaf) => leaf.view as unknown as FileExplorerView)
			.filter((view) => Boolean(view?.fileItems));
	}

	private attachToExplorers() {
		for (const view of this.explorerViews()) {
			const el = view.containerEl;
			if (!el || this.observers.some((entry) => entry.el === el)) continue;
			const observer = new MutationObserver((mutations) => {
				// Re-decorate when the explorer renders new rows (folder expand,
				// new files, sort changes) — but ignore our own bar insertions.
				for (const mutation of mutations) {
					for (const node of Array.from(mutation.addedNodes)) {
						if (
							node instanceof HTMLElement &&
							!node.hasClass("ofp-bar") &&
							!node.hasClass("ofp-fill")
						) {
							this.scheduleRefresh();
							return;
						}
					}
				}
			});
			observer.observe(el, { childList: true, subtree: true });
			this.observers.push({ observer, el });
		}
		this.scheduleRefresh();
	}

	scheduleRefresh() {
		if (this.refreshQueued) return;
		this.refreshQueued = true;
		requestAnimationFrame(() => {
			this.refreshQueued = false;
			this.refreshAll();
		});
	}

	private refreshAll() {
		for (const view of this.explorerViews()) {
			const items = view.fileItems as Record<string, FileExplorerItem>;
			for (const path in items) {
				this.decorate(items[path], path);
			}
		}
	}

	private updateFile(path: string) {
		for (const view of this.explorerViews()) {
			const item = view.fileItems?.[path];
			if (item) this.decorate(item, path);
		}
	}

	private decorate(item: FileExplorerItem, path: string) {
		const el = item.selfEl ?? item.titleEl;
		if (!el) return;

		// fileItems also holds folders and non-markdown files: no bar for those.
		if (!path.toLowerCase().endsWith(".md")) {
			el.querySelector(":scope > .ofp-bar")?.remove();
			el.removeClass("ofp-host");
			return;
		}

		el.addClass("ofp-host");
		let bar = el.querySelector(":scope > .ofp-bar") as HTMLElement | null;
		if (!bar) {
			bar = el.createDiv({ cls: "ofp-bar" });
			bar.createDiv({ cls: "ofp-fill" });
		}
		const fill = bar.firstElementChild as HTMLElement;

		const count = this.counts.get(path);
		if (count === undefined) {
			const file = this.app.vault.getAbstractFileByPath(path);
			if (file instanceof TFile) void this.readCount(file);
		}

		const target = this.settings.targetChars;
		const ratio = count !== undefined && target > 0 ? count / target : 0;
		const overflow = ratio > 1 && this.settings.highlightOverflow;

		let widthPct = Math.min(1, ratio) * 100;
		// Keep a visible sliver for barely-started notes.
		if (ratio > 0 && widthPct < 3) widthPct = 3;

		const width = `${widthPct.toFixed(1)}%`;
		const color = overflow
			? "var(--color-purple, #a882ff)"
			: `hsl(${Math.round(Math.min(1, ratio) * 120)}, 70%, 45%)`;

		// Obsidian indents rows with an inline padding-inline-start; mirror it
		// so the bar starts exactly under the file name.
		const inset = el.style.paddingInlineStart || "";

		const signature = `${width}|${color}|${inset}`;
		if (bar.dataset.ofp === signature) return;
		bar.dataset.ofp = signature;

		if (inset) bar.style.insetInlineStart = inset;
		fill.style.width = width;
		fill.style.backgroundColor = color;
		bar.toggleClass("ofp-overflow", overflow);
	}
}

class FilesProgressSettingTab extends PluginSettingTab {
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
			.setDesc("A note counts as 100% full at this many characters.")
			.addText((text) =>
				text
					.setPlaceholder("3600")
					.setValue(String(this.plugin.settings.targetChars))
					.onChange(async (value) => {
						const parsed = Number(value);
						if (!Number.isFinite(parsed) || parsed <= 0) return;
						this.plugin.settings.targetChars = Math.round(parsed);
						await this.plugin.saveSettings();
						this.plugin.scheduleRefresh();
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
						this.plugin.scheduleRefresh();
					})
			);
	}
}
