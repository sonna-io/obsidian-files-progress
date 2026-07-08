import { ItemView, Keymap, TFile, WorkspaceLeaf, setIcon } from "obsidian";
import type FilesProgressPlugin from "./main";
import { ViewSort, isDarkTheme, paletteColor, parentPath, resolveColors } from "./types";

export const VIEW_TYPE_PROGRESS = "files-progress-view";

const SORT_OPTIONS: Record<ViewSort, string> = {
	"completion-desc": "Completion (high → low)",
	"completion-asc": "Completion (low → high)",
	name: "Name (A → Z)",
	path: "Folder path",
	"chars-desc": "Characters (high → low)",
	"mtime-desc": "Recently modified",
};

interface Row {
	file: TFile;
	count: number;
	target: number;
	ratio: number;
}

interface PathFilter {
	test: (path: string) => boolean;
	error?: string;
}

interface FilterFlags {
	matchCase: boolean;
	wholeWord: boolean;
	useRegex: boolean;
}

function escapeRegex(text: string): string {
	return text.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function globToRegexSource(glob: string): string {
	const parts = glob.split(/(\*\*|\*|\?)/).map((part) => {
		if (part === "**") return ".*";
		if (part === "*") return "[^/]*";
		if (part === "?") return "[^/]";
		return escapeRegex(part);
	});
	return `^${parts.join("")}$`;
}

/**
 * VS Code-style filter: comma-separated terms, `*`/`?`/`**` globs matched
 * against the full path or the file name, `!` prefix excludes, plain terms
 * are substring matches. Regex mode treats the whole query as one pattern.
 */
export function buildPathFilter(query: string, flags: FilterFlags): PathFilter {
	const q = query.trim();
	if (!q) return { test: () => true };
	const reFlags = flags.matchCase ? "" : "i";

	if (flags.useRegex) {
		try {
			const source = flags.wholeWord ? `\\b(?:${q})\\b` : q;
			const re = new RegExp(source, reFlags);
			return { test: (path) => re.test(path) };
		} catch {
			return { test: () => false, error: "Invalid regular expression" };
		}
	}

	const includes: RegExp[] = [];
	const excludes: RegExp[] = [];
	for (const rawTerm of q.split(",")) {
		const term = rawTerm.trim();
		if (!term) continue;
		const negated = term.startsWith("!");
		const body = negated ? term.slice(1).trim() : term;
		if (!body) continue;
		let source = /[*?]/.test(body) ? globToRegexSource(body) : escapeRegex(body);
		if (flags.wholeWord && !source.startsWith("^")) source = `\\b(?:${source})\\b`;
		(negated ? excludes : includes).push(new RegExp(source, reFlags));
	}

	return {
		test: (path) => {
			const base = path.slice(path.lastIndexOf("/") + 1);
			const hit = (re: RegExp) => re.test(path) || re.test(base);
			if (excludes.some(hit)) return false;
			if (includes.length && !includes.some(hit)) return false;
			return true;
		},
	};
}

export class ProgressView extends ItemView {
	private plugin: FilesProgressPlugin;
	private query = "";
	private matchCase = false;
	private wholeWord = false;
	private useRegex = false;
	private collapsedGroups = new Set<string>();
	private renderTimer: number | null = null;
	private statsEl!: HTMLElement;
	private listEl!: HTMLElement;

	constructor(leaf: WorkspaceLeaf, plugin: FilesProgressPlugin) {
		super(leaf);
		this.plugin = plugin;
	}

	getViewType() {
		return VIEW_TYPE_PROGRESS;
	}

	getDisplayText() {
		return "Files progress";
	}

	getIcon() {
		return "gauge";
	}

	async onOpen() {
		const el = this.contentEl;
		el.empty();
		el.addClass("ofp-view");

		// Toolbar is built once so background re-renders never steal input focus.
		const toolbar = el.createDiv({ cls: "ofp-toolbar" });

		const select = toolbar.createEl("select", { cls: "dropdown" });
		for (const [value, label] of Object.entries(SORT_OPTIONS)) {
			const option = select.createEl("option", { text: label });
			option.value = value;
		}
		select.value = this.plugin.settings.viewSort;
		select.onchange = async () => {
			this.plugin.settings.viewSort = select.value as ViewSort;
			await this.plugin.saveSettings();
			this.renderList();
		};

		const groupBtn = toolbar.createEl("button", {
			cls: "clickable-icon ofp-toolbar-btn",
			attr: { "aria-label": "Group by folder" },
		});
		setIcon(groupBtn, "folder-tree");
		groupBtn.toggleClass("is-active", this.plugin.settings.viewGroupByFolder);
		groupBtn.onclick = async () => {
			this.plugin.settings.viewGroupByFolder = !this.plugin.settings.viewGroupByFolder;
			groupBtn.toggleClass("is-active", this.plugin.settings.viewGroupByFolder);
			await this.plugin.saveSettings();
			this.renderList();
		};

		const refreshBtn = toolbar.createEl("button", {
			cls: "clickable-icon ofp-toolbar-btn",
			attr: { "aria-label": "Recalculate all" },
		});
		setIcon(refreshBtn, "rotate-cw");
		refreshBtn.onclick = () => void this.plugin.scanVault(true);

		const searchWrap = el.createDiv({ cls: "ofp-search-wrap" });
		const search = searchWrap.createEl("input", {
			cls: "ofp-search",
			attr: {
				type: "search",
				placeholder: "Filter (e.g. daily*, !archive)",
				"aria-label":
					"Comma-separated terms. Plain terms match anywhere in the path; * ? ** are globs; !term excludes.",
			},
		});
		search.value = this.query;
		search.oninput = () => {
			this.query = search.value;
			this.renderList();
		};

		const toggles = searchWrap.createDiv({ cls: "ofp-search-toggles" });
		const makeToggle = (
			icon: string,
			label: string,
			get: () => boolean,
			set: (value: boolean) => void
		) => {
			const btn = toggles.createEl("button", {
				cls: "clickable-icon ofp-toggle",
				attr: { "aria-label": label },
			});
			setIcon(btn, icon);
			btn.toggleClass("is-active", get());
			btn.onclick = () => {
				set(!get());
				btn.toggleClass("is-active", get());
				this.renderList();
			};
		};
		makeToggle("case-sensitive", "Match case", () => this.matchCase, (v) => (this.matchCase = v));
		makeToggle("whole-word", "Match whole word", () => this.wholeWord, (v) => (this.wholeWord = v));
		makeToggle("regex", "Use regular expression", () => this.useRegex, (v) => (this.useRegex = v));

		this.statsEl = el.createDiv({ cls: "ofp-stats" });
		this.listEl = el.createDiv({ cls: "ofp-list" });
		this.renderList();
	}

	async onClose() {
		if (this.renderTimer !== null) window.clearTimeout(this.renderTimer);
	}

	requestRender() {
		if (this.renderTimer !== null) return;
		this.renderTimer = window.setTimeout(() => {
			this.renderTimer = null;
			this.renderList();
		}, 250);
	}

	private collectRows(filter: PathFilter): Row[] {
		const rows: Row[] = [];
		for (const file of this.plugin.app.vault.getMarkdownFiles()) {
			if (!this.plugin.isIncluded(file.path)) continue;
			if (!filter.test(file.path)) continue;
			const count = this.plugin.counts.get(file.path);
			if (count === undefined) continue;
			const target = this.plugin.targetFor(file.path);
			rows.push({ file, count, target, ratio: target > 0 ? count / target : 0 });
		}
		return rows;
	}

	private sortRows(rows: Row[]) {
		const comparators: Record<ViewSort, (a: Row, b: Row) => number> = {
			"completion-desc": (a, b) => b.ratio - a.ratio,
			"completion-asc": (a, b) => a.ratio - b.ratio,
			name: (a, b) => a.file.basename.localeCompare(b.file.basename),
			path: (a, b) => a.file.path.localeCompare(b.file.path),
			"chars-desc": (a, b) => b.count - a.count,
			"mtime-desc": (a, b) => b.file.stat.mtime - a.file.stat.mtime,
		};
		rows.sort(comparators[this.plugin.settings.viewSort]);
	}

	private renderList() {
		const filter = buildPathFilter(this.query, {
			matchCase: this.matchCase,
			wholeWord: this.wholeWord,
			useRegex: this.useRegex,
		});

		this.listEl.empty();
		if (filter.error) {
			this.statsEl.setText(filter.error);
			return;
		}

		const rows = this.collectRows(filter);

		const avg = rows.length
			? Math.round(
					(rows.reduce((a, r) => a + Math.min(1, r.ratio), 0) / rows.length) * 100
			  )
			: 0;
		const full = rows.filter((r) => r.ratio >= 1).length;
		const over = rows.filter((r) => r.ratio > 1).length;
		this.statsEl.setText(
			rows.length
				? `${rows.length} notes · avg ${avg}% · ${full} full · ${over} over target`
				: ""
		);

		if (!rows.length) {
			this.listEl.createDiv({
				cls: "ofp-empty",
				text: this.query.trim() ? "No notes match the filter." : "No notes in scope yet.",
			});
			return;
		}

		if (this.plugin.settings.viewGroupByFolder) {
			const groups = new Map<string, Row[]>();
			for (const row of rows) {
				const key = parentPath(row.file.path) || "/";
				(groups.get(key) ?? groups.set(key, []).get(key)!).push(row);
			}
			for (const key of Array.from(groups.keys()).sort((a, b) => a.localeCompare(b))) {
				const groupRows = groups.get(key)!;
				this.sortRows(groupRows);
				this.renderGroup(key, groupRows);
			}
		} else {
			this.sortRows(rows);
			for (const row of rows) this.renderRow(this.listEl, row, true);
		}
	}

	private renderGroup(key: string, rows: Row[]) {
		const collapsed = this.collapsedGroups.has(key);
		const header = this.listEl.createDiv({ cls: "ofp-group-header" });
		header.toggleClass("is-collapsed", collapsed);

		const chevron = header.createSpan({ cls: "ofp-group-chevron" });
		setIcon(chevron, "chevron-down");
		header.createSpan({ text: key === "/" ? "Vault root" : key });

		const avg = Math.round(
			(rows.reduce((a, r) => a + Math.min(1, r.ratio), 0) / rows.length) * 100
		);
		header.createSpan({ cls: "ofp-group-meta", text: `${rows.length} · ${avg}%` });

		const body = this.listEl.createDiv({ cls: "ofp-group-body" });
		if (collapsed) body.hide();
		for (const row of rows) this.renderRow(body, row, false);

		header.onclick = () => {
			if (this.collapsedGroups.has(key)) this.collapsedGroups.delete(key);
			else this.collapsedGroups.add(key);
			header.toggleClass("is-collapsed", this.collapsedGroups.has(key));
			body.toggle(this.collapsedGroups.has(key) === false);
		};
	}

	private renderRow(container: HTMLElement, row: Row, showPath: boolean) {
		const pct = Math.round(row.ratio * 100);
		const rowEl = container.createDiv({ cls: "ofp-row" });
		rowEl.setAttr(
			"aria-label",
			`${row.count.toLocaleString()} / ${row.target.toLocaleString()} characters`
		);
		rowEl.setAttr("data-tooltip-position", "top");

		const top = rowEl.createDiv({ cls: "ofp-row-top" });
		top.createSpan({ cls: "ofp-row-name", text: row.file.basename });
		top.createSpan({ cls: "ofp-row-pct", text: `${pct}%` });

		if (showPath) {
			const dir = parentPath(row.file.path);
			if (dir) rowEl.createDiv({ cls: "ofp-row-path", text: dir });
		}

		const colors = resolveColors(this.plugin.paletteFor(row.file.path), isDarkTheme());
		const track = rowEl.createDiv({ cls: "ofp-row-track" });
		if (colors.track.trim()) track.style.backgroundColor = colors.track;
		const fill = track.createDiv({ cls: "ofp-row-fill" });
		let widthPct = Math.min(1, row.ratio) * 100;
		if (row.ratio > 0 && widthPct < 2) widthPct = 2;
		fill.style.width = `${widthPct.toFixed(1)}%`;
		fill.style.backgroundColor = paletteColor(
			colors,
			row.ratio,
			this.plugin.settings.highlightOverflow
		);

		rowEl.addEventListener("click", (evt) => {
			void this.plugin.app.workspace.getLeaf(Keymap.isModEvent(evt)).openFile(row.file);
		});
	}
}
