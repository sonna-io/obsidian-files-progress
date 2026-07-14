import {
	Modal,
	Notice,
	Plugin,
	Setting,
	TFile,
	TFolder,
} from "obsidian";
import {
	BUILT_IN_PALETTES,
	Completion,
	DEFAULT_SETTINGS,
	FilesProgressSettings,
	FolderRule,
	Palette,
	formatManualPercent,
	isDarkTheme,
	normalizeSettings,
	paletteColor,
	parseManualProgress,
	parentPath,
	resolveCompletion,
	resolveColors,
} from "./types";
import { FilesProgressSettingTab } from "./settings-tab";
import { ProgressView, VIEW_TYPE_PROGRESS } from "./view";

/** Minimal shape of the (undocumented) file explorer view internals we rely on. */
interface FileExplorerItem {
	selfEl?: HTMLElement;
	titleEl?: HTMLElement;
}

interface FileExplorerView {
	fileItems?: Record<string, FileExplorerItem>;
	containerEl?: HTMLElement;
}

interface FolderAggregate {
	sum: number;
	n: number;
}

const FRONTMATTER_RE = /^---\r?\n[\s\S]*?\r?\n---(?:\r?\n|$)/;

function isRecord(value: unknown): value is Record<string, unknown> {
	return typeof value === "object" && value !== null && !Array.isArray(value);
}

export default class FilesProgressPlugin extends Plugin {
	settings: FilesProgressSettings = DEFAULT_SETTINGS;
	readonly counts = new Map<string, number>();

	private pendingReads = new Set<string>();
	private observers: { observer: MutationObserver; el: HTMLElement }[] = [];
	private refreshQueued = false;
	private statusBarEl: HTMLElement | null = null;

	async onload() {
		await this.loadSettings();
		this.addSettingTab(new FilesProgressSettingTab(this.app, this));
		this.applyBarThickness();

		this.registerView(VIEW_TYPE_PROGRESS, (leaf) => new ProgressView(leaf, this));
		this.addRibbonIcon("gauge", "Files progress", () => void this.activateView());

		this.statusBarEl = this.addStatusBarItem();
		this.statusBarEl.addClass("mod-clickable");
		this.statusBarEl.setAttr("aria-label", "Files progress: characters / target");
		this.statusBarEl.onClickEvent(() => void this.activateView());
		this.statusBarEl.hide();

		// Fires on every content change of a markdown file and hands us the new
		// content, so no extra disk read is needed. Frontmatter edits also land
		// here, which keeps scope/manual/target/palette properties live.
		this.registerEvent(
			this.app.metadataCache.on("changed", (file, data) => {
				this.counts.set(file.path, this.countChars(data));
				this.updateFile(file.path);
				if (this.settings.showFolderBars) this.scheduleRefresh();
				if (this.app.workspace.getActiveFile()?.path === file.path) {
					this.updateStatusBar();
				}
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
				this.scheduleRefresh();
				this.notifyView();
			})
		);

		this.registerEvent(
			this.app.vault.on("rename", (file, oldPath) => {
				const count = this.counts.get(oldPath);
				this.counts.delete(oldPath);
				if (count !== undefined) this.counts.set(file.path, count);
				this.fixPathsOnRename(file.path, oldPath);
				this.scheduleRefresh();
				this.notifyView();
			})
		);

		// Catches newly created explorer leaves and deferred views finishing loading.
		this.registerEvent(
			this.app.workspace.on("layout-change", () => this.attachToExplorers())
		);

		// Re-resolve palettes when the theme flips between light and dark
		// (including "adapt to system" switches).
		this.registerEvent(
			this.app.workspace.on("css-change", () => {
				this.scheduleRefresh();
				this.notifyView();
			})
		);

		this.registerEvent(
			this.app.workspace.on("active-leaf-change", () => this.updateStatusBar())
		);
		this.registerEvent(this.app.workspace.on("file-open", () => this.updateStatusBar()));

		this.registerEvent(
			this.app.workspace.on("file-menu", (menu, file, source) => {
				if (file instanceof TFolder && file.path !== "/") {
					if (source !== VIEW_TYPE_PROGRESS) menu.addSeparator();
					menu.addItem((item) =>
						item
							.setTitle("Progress settings…")
							.setIcon("gauge")
							.onClick(() => new FolderRuleModal(this, file.path).open())
					);
					const isExcluded = this.settings.excludedFolders.some(
						(f) => f.trim() === file.path
					);
					menu.addItem((item) =>
						item
							.setTitle(isExcluded ? "Show progress bars" : "Hide progress bars")
							.setIcon(isExcluded ? "eye" : "eye-off")
							.onClick(async () => {
								if (isExcluded) {
									this.settings.excludedFolders = this.settings.excludedFolders.filter(
										(f) => f.trim() !== file.path
									);
								} else {
									this.settings.excludedFolders.push(file.path);
								}
								await this.saveSettings();
								this.settingsChanged();
							})
					);
				} else if (file instanceof TFile && file.extension === "md") {
					if (source !== VIEW_TYPE_PROGRESS) menu.addSeparator();
					menu.addItem((item) =>
						item
							.setTitle("Progress settings…")
							.setIcon("gauge")
							.onClick(() => new FileProgressModal(this, file).open())
					);
					const included = this.isIncluded(file.path);
					menu.addItem((item) =>
						item
							.setTitle(included ? "Hide progress bar" : "Show progress bar")
							.setIcon(included ? "eye-off" : "eye")
							.onClick(() => void this.toggleFileScope(file.path))
					);
				}
			})
		);

		this.addCommand({
			id: "recalculate",
			name: "Recalculate all progress bars",
			callback: () => void this.scanVault(true),
		});
		this.addCommand({
			id: "open-view",
			name: "Open progress view",
			callback: () => void this.activateView(),
		});
		this.addCommand({
			id: "toggle-file",
			name: "Toggle progress bar for active note",
			checkCallback: (checking) => {
				const file = this.app.workspace.getActiveFile();
				if (!file || file.extension !== "md") return false;
				if (!checking) void this.toggleFileScope(file.path);
				return true;
			},
		});

		this.app.workspace.onLayoutReady(() => {
			this.attachToExplorers();
			void this.scanVault();
		});
	}

	onunload() {
		for (const { observer } of this.observers) observer.disconnect();
		for (const doc of this.pluginDocuments()) {
			doc.body.style.removeProperty("--ofp-thickness");
			for (const bar of Array.from(doc.querySelectorAll(".ofp-bar"))) bar.remove();
			for (const host of Array.from(doc.querySelectorAll(".ofp-host"))) {
				host.removeClass("ofp-host");
			}
		}
		this.observers = [];
	}

	async loadSettings() {
		const data: unknown = await this.loadData();
		this.settings = normalizeSettings(data);
	}

	async saveSettings() {
		await this.saveData(this.settings);
	}

	applyBarThickness() {
		for (const doc of this.pluginDocuments()) {
			doc.body.style.setProperty("--ofp-thickness", `${this.settings.barThickness}px`);
		}
	}

	private pluginDocuments(): Set<Document> {
		const documents = new Set([activeDocument, ...this.observers.map(({ el }) => el.doc)]);
		for (const leaf of this.app.workspace.getLeavesOfType(VIEW_TYPE_PROGRESS)) {
			if (leaf.view instanceof ProgressView) documents.add(leaf.view.contentEl.doc);
		}
		return documents;
	}

	/** Re-apply everything after a settings change. */
	settingsChanged() {
		this.applyBarThickness();
		this.scheduleRefresh();
		this.updateStatusBar();
		this.notifyView();
	}

	// ---------- scope ----------

	private matchesFolder(path: string, folderRaw: string): boolean {
		const folder = folderRaw.trim().replace(/^\/+|\/+$/g, "");
		if (!folder) return false;
		return path === folder || path.startsWith(folder + "/");
	}

	frontmatterValue(path: string, property: string): unknown {
		const key = property.trim();
		if (!key) return undefined;
		const frontmatter: unknown = this.app.metadataCache.getCache(path)?.frontmatter;
		return isRecord(frontmatter) ? frontmatter[key] : undefined;
	}

	frontmatterPropertyConflict(): string | undefined {
		const entries = [
			["Scope", this.settings.scopeProperty],
			["Manual progress", this.settings.manualProgressProperty],
			["Target", this.settings.targetProperty],
			["Palette", this.settings.paletteProperty],
		] as const;
		const owners = new Map<string, string>();
		for (const [label, rawKey] of entries) {
			const key = rawKey.trim();
			if (!key) continue;
			const owner = owners.get(key);
			if (owner) return `${owner} and ${label.toLowerCase()} use the same property (${key}).`;
			owners.set(key, label);
		}
		return undefined;
	}

	/**
	 * Scope precedence, most specific first:
	 * excluded files > included files > frontmatter scope property >
	 * excluded folders > included folders > default (in scope).
	 */
	isIncluded(path: string): boolean {
		const s = this.settings;
		if (s.excludedFiles.some((f) => f.trim() === path)) return false;
		if (s.includedFiles.some((f) => f.trim() === path)) return true;
		const scopeKey = s.scopeProperty.trim();
		if (scopeKey) {
			const value = this.frontmatterValue(path, scopeKey);
			if (value !== undefined && value !== null) {
				return !(value === false || value === "false" || value === "no" || value === 0);
			}
		}
		if (s.excludedFolders.some((f) => this.matchesFolder(path, f))) return false;
		const included = s.includedFolders.filter((f) => f.trim());
		if (included.length && !included.some((f) => this.matchesFolder(path, f))) return false;
		return true;
	}

	/** Add or remove a file-level scope override so the bar toggles. */
	async toggleFileScope(path: string) {
		const s = this.settings;
		if (this.isIncluded(path)) {
			s.includedFiles = s.includedFiles.filter((f) => f.trim() !== path);
			if (this.isIncluded(path)) s.excludedFiles.push(path);
		} else {
			s.excludedFiles = s.excludedFiles.filter((f) => f.trim() !== path);
			if (!this.isIncluded(path)) s.includedFiles.push(path);
		}
		await this.saveSettings();
		this.settingsChanged();
	}

	/** Keep scope lists and folder rules valid when files/folders are renamed. */
	private fixPathsOnRename(newPath: string, oldPath: string) {
		const s = this.settings;
		let changed = false;
		const fix = (p: string): string => {
			const trimmed = p.trim();
			if (trimmed === oldPath) {
				changed = true;
				return newPath;
			}
			if (trimmed.startsWith(oldPath + "/")) {
				changed = true;
				return newPath + trimmed.slice(oldPath.length);
			}
			return p;
		};
		s.includedFiles = s.includedFiles.map(fix);
		s.excludedFiles = s.excludedFiles.map(fix);
		s.includedFolders = s.includedFolders.map(fix);
		s.excludedFolders = s.excludedFolders.map(fix);
		for (const rule of s.folderRules) rule.path = fix(rule.path);
		if (changed) void this.saveSettings();
	}

	// ---------- targets ----------

	private folderRule(dir: string): FolderRule | undefined {
		return this.settings.folderRules.find(
			(r) => r.path.trim().replace(/^\/+|\/+$/g, "") === dir
		);
	}

	targetFor(filePath: string): number {
		const key = this.settings.targetProperty.trim();
		if (key) {
			const raw = this.frontmatterValue(filePath, key);
			if (raw !== undefined && raw !== null) {
				const parsed = Math.round(Number(raw));
				if (Number.isFinite(parsed) && parsed > 0) return parsed;
			}
		}
		return this.targetForFolder(parentPath(filePath));
	}

	targetForFolder(dir: string): number {
		while (dir) {
			const rule = this.folderRule(dir);
			if (rule?.target && rule.target > 0) return rule.target;
			dir = parentPath(dir);
		}
		return this.settings.targetChars;
	}

	completionFor(filePath: string, count: number): Completion {
		const target = this.targetFor(filePath);
		const key = this.settings.manualProgressProperty.trim();
		const manualValue = key ? this.frontmatterValue(filePath, key) : undefined;
		return resolveCompletion(count, target, manualValue);
	}

	// ---------- palettes ----------

	private findPalette(name: unknown): Palette | undefined {
		if (typeof name !== "string" || !name.trim()) return undefined;
		const q = name.trim().toLowerCase();
		return this.settings.palettes.find((p) => p.name.trim().toLowerCase() === q);
	}

	defaultPalette(): Palette {
		return (
			this.findPalette(this.settings.defaultPalette) ??
			this.settings.palettes[0] ??
			BUILT_IN_PALETTES[0]
		);
	}

	paletteFor(filePath: string): Palette {
		const key = this.settings.paletteProperty.trim();
		if (key) {
			const raw = this.frontmatterValue(filePath, key);
			const palette = this.findPalette(raw);
			if (palette) return palette;
		}
		return this.paletteForFolder(parentPath(filePath));
	}

	paletteForFolder(dir: string): Palette {
		while (dir) {
			const palette = this.findPalette(this.folderRule(dir)?.palette);
			if (palette) return palette;
			dir = parentPath(dir);
		}
		return this.defaultPalette();
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
		this.updateStatusBar();
	}

	// ---------- status bar ----------

	updateStatusBar() {
		const el = this.statusBarEl;
		if (!el) return;
		const file = this.app.workspace.getActiveFile();
		if (
			!this.settings.showStatusBar ||
			!file ||
			file.extension !== "md" ||
			!this.isIncluded(file.path)
		) {
			el.hide();
			return;
		}
		const count = this.counts.get(file.path);
		if (count === undefined) {
			el.hide();
			return;
		}
		const completion = this.completionFor(file.path, count);
		const pct =
			completion.manualPercent !== undefined
				? formatManualPercent(completion.manualPercent)
				: String(Math.round(completion.ratio * 100));
		const source = completion.manualPercent !== undefined ? `${pct}% manual · ` : "";
		el.setText(
			completion.manualPercent !== undefined
				? `${source}${count.toLocaleString()} / ${completion.target.toLocaleString()}`
				: `${count.toLocaleString()} / ${completion.target.toLocaleString()} · ${pct}%`
		);
		el.show();
	}

	// ---------- progress view ----------

	async activateView() {
		const existing = this.app.workspace.getLeavesOfType(VIEW_TYPE_PROGRESS);
		if (existing.length) {
			await this.app.workspace.revealLeaf(existing[0]);
			return;
		}
		const leaf = this.app.workspace.getRightLeaf(false);
		if (!leaf) return;
		await leaf.setViewState({ type: VIEW_TYPE_PROGRESS, active: true });
		await this.app.workspace.revealLeaf(leaf);
	}

	notifyView() {
		for (const leaf of this.app.workspace.getLeavesOfType(VIEW_TYPE_PROGRESS)) {
			if (leaf.view instanceof ProgressView) leaf.view.requestRender();
		}
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
			el.doc.body.style.setProperty("--ofp-thickness", `${this.settings.barThickness}px`);
			const observer = new MutationObserver((mutations) => {
				// Re-decorate when the explorer renders new rows (folder expand,
				// new files, sort changes) — but ignore our own bar insertions.
				for (const mutation of mutations) {
					for (const node of Array.from(mutation.addedNodes)) {
						if (
							node.instanceOf(HTMLElement) &&
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
		window.requestAnimationFrame(() => {
			this.refreshQueued = false;
			this.refreshAll();
		});
	}

	/** Per-folder mean completion (each file clamped at 100%) for folder bars. */
	private folderAggregates(): Map<string, FolderAggregate> {
		const agg = new Map<string, FolderAggregate>();
		for (const file of this.app.vault.getMarkdownFiles()) {
			if (!this.isIncluded(file.path)) continue;
			const count = this.counts.get(file.path);
			if (count === undefined) continue;
			const ratio = Math.min(1, this.completionFor(file.path, count).ratio);
			let dir = parentPath(file.path);
			while (dir) {
				const entry = agg.get(dir) ?? { sum: 0, n: 0 };
				entry.sum += ratio;
				entry.n++;
				agg.set(dir, entry);
				dir = parentPath(dir);
			}
		}
		return agg;
	}

	private refreshAll() {
		const folderAgg = this.settings.showFolderBars ? this.folderAggregates() : null;
		for (const view of this.explorerViews()) {
			const items = view.fileItems;
			if (!items) continue;
			for (const path in items) {
				this.decorate(items[path], path, folderAgg);
			}
		}
		this.notifyView();
	}

	private updateFile(path: string) {
		for (const view of this.explorerViews()) {
			const item = view.fileItems?.[path];
			if (item) this.decorate(item, path, null);
		}
		this.notifyView();
	}

	private decorate(
		item: FileExplorerItem,
		path: string,
		folderAgg: Map<string, FolderAggregate> | null
	) {
		const el = item.selfEl ?? item.titleEl;
		if (!el) return;

		if (!path.toLowerCase().endsWith(".md")) {
			// Folders get an aggregate bar when enabled; anything else gets none.
			if (folderAgg && path !== "/" && this.isIncluded(path)) {
				const entry = folderAgg.get(path);
				const abstract = this.app.vault.getAbstractFileByPath(path);
				if (entry && entry.n > 0 && abstract instanceof TFolder) {
					this.applyBar(el, entry.sum / entry.n, true, this.paletteForFolder(path));
					return;
				}
			}
			this.removeBar(el);
			return;
		}

		if (!this.isIncluded(path)) {
			this.removeBar(el);
			return;
		}

		const count = this.counts.get(path);
		if (count === undefined) {
			const file = this.app.vault.getAbstractFileByPath(path);
			if (file instanceof TFile) void this.readCount(file);
		}

		const ratio = count !== undefined ? this.completionFor(path, count).ratio : 0;
		this.applyBar(el, ratio, false, this.paletteFor(path));
	}

	private applyBar(el: HTMLElement, ratio: number, isFolder: boolean, palette: Palette) {
		el.addClass("ofp-host");
		let bar = el.querySelector<HTMLElement>(":scope > .ofp-bar");
		if (!bar) {
			bar = el.createDiv({ cls: "ofp-bar" });
		}
		const fill =
			bar.querySelector<HTMLElement>(":scope > .ofp-fill") ??
			bar.createDiv({ cls: "ofp-fill" });

		const highlightOverflow = this.settings.highlightOverflow && !isFolder;
		const overflow = ratio > 1 && highlightOverflow;

		let widthPct = Math.min(1, ratio) * 100;
		// Keep a visible sliver for barely-started notes.
		if (ratio > 0 && widthPct < 3) widthPct = 3;

		const width = `${widthPct.toFixed(1)}%`;
		const colors = resolveColors(palette, isDarkTheme(el.doc));
		const color = paletteColor(colors, ratio, highlightOverflow);
		const track = colors.track.trim();

		// Obsidian indents rows with an inline padding-inline-start; mirror it
		// so the bar starts exactly under the file name.
		const inset = el.style.paddingInlineStart || "";

		const signature = `${width}|${color}|${inset}|${isFolder}|${track}`;
		if (bar.dataset.ofp === signature) return;
		bar.dataset.ofp = signature;

		if (inset) bar.style.insetInlineStart = inset;
		fill.style.width = width;
		fill.style.backgroundColor = color;
		// Empty string clears the inline override → theme-aware CSS default.
		bar.style.backgroundColor = track;
		bar.toggleClass("ofp-overflow", overflow);
		bar.toggleClass("ofp-folder-bar", isFolder);
	}

	private removeBar(el: HTMLElement) {
		el.querySelector(":scope > .ofp-bar")?.remove();
		el.removeClass("ofp-host");
	}
}

function editableFrontmatterText(value: unknown): string {
	return typeof value === "string" || typeof value === "number" ? String(value) : "";
}

/** Modal opened from a note context menu: frontmatter-backed note overrides. */
export class FileProgressModal extends Modal {
	constructor(private plugin: FilesProgressPlugin, private file: TFile) {
		super(plugin.app);
	}

	onOpen() {
		this.setTitle(`Progress settings — ${this.file.basename}`);
		const settings = this.plugin.settings;
		const manualKey = settings.manualProgressProperty.trim();
		const targetKey = settings.targetProperty.trim();
		const paletteKey = settings.paletteProperty.trim();
		const manualRaw = this.plugin.frontmatterValue(this.file.path, manualKey);
		const targetRaw = this.plugin.frontmatterValue(this.file.path, targetKey);
		const paletteRaw = this.plugin.frontmatterValue(this.file.path, paletteKey);
		let manualValue = editableFrontmatterText(manualRaw);
		let targetValue = editableFrontmatterText(targetRaw);
		let paletteValue = typeof paletteRaw === "string" ? paletteRaw : "";

		new Setting(this.contentEl)
			.setName("Manual progress")
			.setDesc(
				manualKey
					? `Percentage from 1 through 100; decimals are supported. Leave empty to calculate from characters (${manualKey}).`
					: "Set a manual progress property in the plugin settings before adding an override."
			)
			.addText((text) => {
				text.inputEl.type = "number";
				text.inputEl.min = "1";
				text.inputEl.max = "100";
				text.inputEl.step = "any";
				text
					.setPlaceholder("Automatic")
					.setValue(manualValue)
					.onChange((value) => (manualValue = value));
			});

		new Setting(this.contentEl)
			.setName("Target character count")
			.setDesc(
				targetKey
					? `Leave empty to inherit ${this.plugin
							.targetForFolder(parentPath(this.file.path))
							.toLocaleString()} characters (${targetKey}).`
					: "Set a target property in the plugin settings before adding an override."
			)
			.addText((text) => {
				text.inputEl.type = "number";
				text.inputEl.min = "1";
				text.inputEl.step = "1";
				text
					.setPlaceholder("Inherit")
					.setValue(targetValue)
					.onChange((value) => (targetValue = value));
			});

		new Setting(this.contentEl)
			.setName("Color palette")
			.setDesc(
				paletteKey
					? `Leave on “Inherit” to use ${this.plugin.paletteForFolder(parentPath(this.file.path)).name} (${paletteKey}).`
					: "Set a palette property in the plugin settings before adding an override."
			)
			.addDropdown((dropdown) => {
				dropdown.addOption("", "Inherit");
				for (const palette of settings.palettes) dropdown.addOption(palette.name, palette.name);
				if (
					paletteValue &&
					!settings.palettes.some((palette) => palette.name === paletteValue)
				) {
					dropdown.addOption(paletteValue, `${paletteValue} (missing)`);
				}
				dropdown.setValue(paletteValue).onChange((value) => (paletteValue = value));
			});

		const buttons = new Setting(this.contentEl);
		buttons.addButton((button) =>
			button
				.setButtonText("Save")
				.setCta()
				.onClick(() => void this.saveOverrides(manualValue, targetValue, paletteValue))
		);
		if (manualRaw !== undefined || targetRaw !== undefined || paletteRaw !== undefined) {
			buttons.addButton((button) =>
				button
					.setButtonText("Clear overrides")
					.setDestructive()
					.onClick(() => void this.clearOverrides())
			);
		}
	}

	private propertyKeys(): { manual: string; target: string; palette: string } {
		return {
			manual: this.plugin.settings.manualProgressProperty.trim(),
			target: this.plugin.settings.targetProperty.trim(),
			palette: this.plugin.settings.paletteProperty.trim(),
		};
	}

	private validatePropertyKeys(): boolean {
		const conflict = this.plugin.frontmatterPropertyConflict();
		if (!conflict) return true;
		new Notice(`Files Progress: ${conflict} Give each frontmatter setting a unique property.`);
		return false;
	}

	private async saveOverrides(manualText: string, targetText: string, palette: string) {
		if (!this.validatePropertyKeys()) return;
		const keys = this.propertyKeys();
		const manual = manualText.trim() === "" ? undefined : parseManualProgress(manualText);
		if (manualText.trim() !== "" && manual === undefined) {
			new Notice("Manual progress must be a number from 1 through 100.");
			return;
		}
		const targetNumber = Number(targetText);
		const roundedTarget = Math.round(targetNumber);
		const target =
			targetText.trim() !== "" && Number.isFinite(targetNumber) && roundedTarget > 0
				? roundedTarget
				: undefined;
		if (targetText.trim() !== "" && target === undefined) {
			new Notice("Target character count must be a positive number.");
			return;
		}
		if ((manual !== undefined && !keys.manual) || (target !== undefined && !keys.target) || (palette && !keys.palette)) {
			new Notice("Configure the corresponding frontmatter property before saving an override.");
			return;
		}

		try {
			await this.plugin.app.fileManager.processFrontMatter(
				this.file,
				(frontmatter: Record<string, unknown>) => {
					this.setOrDelete(frontmatter, keys.manual, manual);
					this.setOrDelete(frontmatter, keys.target, target);
					this.setOrDelete(frontmatter, keys.palette, palette || undefined);
				}
			);
			this.close();
		} catch {
			new Notice("Files progress could not update this note's frontmatter.");
		}
	}

	private async clearOverrides() {
		if (!this.validatePropertyKeys()) return;
		const keys = this.propertyKeys();
		try {
			await this.plugin.app.fileManager.processFrontMatter(
				this.file,
				(frontmatter: Record<string, unknown>) => {
					for (const key of Object.values(keys)) {
						if (key) delete frontmatter[key];
					}
				}
			);
			this.close();
		} catch {
			new Notice("Files progress could not clear this note's frontmatter overrides.");
		}
	}

	private setOrDelete(
		frontmatter: Record<string, unknown>,
		key: string,
		value: string | number | undefined
	) {
		if (!key) return;
		if (value === undefined) delete frontmatter[key];
		else frontmatter[key] = value;
	}

	onClose() {
		this.contentEl.empty();
	}
}

/** Modal opened from the folder context menu: per-folder target and palette. */
export class FolderRuleModal extends Modal {
	private plugin: FilesProgressPlugin;
	private folderPath: string;

	constructor(plugin: FilesProgressPlugin, folderPath: string) {
		super(plugin.app);
		this.plugin = plugin;
		this.folderPath = folderPath;
	}

	onOpen() {
		this.setTitle(`Progress settings — ${this.folderPath}`);
		const existing = this.plugin.settings.folderRules.find((r) => r.path === this.folderPath);
		const parent = parentPath(this.folderPath);
		const inheritedTarget = this.plugin.targetForFolder(parent);
		const inheritedPalette = this.plugin.paletteForFolder(parent).name;
		let targetValue = existing?.target ? String(existing.target) : "";
		let paletteValue = existing?.palette ?? "";

		new Setting(this.contentEl)
			.setName("Target character count")
			.setDesc(
				`Applies to all notes in this folder and its subfolders. Leave empty to inherit (${inheritedTarget.toLocaleString()}).`
			)
			.addText((text) =>
				text.setPlaceholder("Inherit").setValue(targetValue).onChange((v) => (targetValue = v))
			);

		new Setting(this.contentEl)
			.setName("Color palette")
			.setDesc(`Leave on “Inherit” to use the inherited palette (${inheritedPalette}).`)
			.addDropdown((dropdown) => {
				dropdown.addOption("", "Inherit");
				for (const p of this.plugin.settings.palettes) dropdown.addOption(p.name, p.name);
				dropdown.setValue(paletteValue).onChange((v) => (paletteValue = v));
			});

		const buttons = new Setting(this.contentEl);
		buttons.addButton((button) =>
			button
				.setButtonText("Save")
				.setCta()
				.onClick(async () => {
					const parsed = Math.round(Number(targetValue));
					const hasTarget =
						targetValue.trim() !== "" && Number.isFinite(parsed) && parsed > 0;
					const s = this.plugin.settings;
					s.folderRules = s.folderRules.filter((r) => r.path !== this.folderPath);
					if (hasTarget || paletteValue) {
						const rule: FolderRule = { path: this.folderPath };
						if (hasTarget) rule.target = parsed;
						if (paletteValue) rule.palette = paletteValue;
						s.folderRules.push(rule);
					}
					await this.plugin.saveSettings();
					this.plugin.settingsChanged();
					this.close();
				})
		);
		if (existing) {
			buttons.addButton((button) =>
				button
					.setButtonText("Remove override")
					.setDestructive()
					.onClick(async () => {
						this.plugin.settings.folderRules = this.plugin.settings.folderRules.filter(
							(r) => r.path !== this.folderPath
						);
						await this.plugin.saveSettings();
						this.plugin.settingsChanged();
						this.close();
					})
			);
		}
	}

	onClose() {
		this.contentEl.empty();
	}
}
