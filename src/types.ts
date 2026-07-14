export interface PaletteColors {
	/** Color at 0% fullness. */
	start: string;
	/** Color at 50% fullness. */
	mid: string;
	/** Color at 100% fullness. */
	end: string;
	/** Color past the target (when overflow highlighting is on). */
	overflow: string;
	/** Gauge background (the empty part); "" inherits the theme-aware default. */
	track: string;
}

export interface Palette {
	name: string;
	light: PaletteColors;
	/** Optional dark-theme variant; falls back to `light` when absent. */
	dark?: PaletteColors;
}

export interface FolderRule {
	path: string;
	target?: number;
	palette?: string;
}

export type ViewSort =
	| "completion-desc"
	| "completion-asc"
	| "name"
	| "path"
	| "chars-desc"
	| "mtime-desc";

export interface FilesProgressSettings {
	targetChars: number;
	excludeFrontmatter: boolean;
	barThickness: number;
	highlightOverflow: boolean;
	includedFolders: string[];
	excludedFolders: string[];
	includedFiles: string[];
	excludedFiles: string[];
	folderRules: FolderRule[];
	scopeProperty: string;
	manualProgressProperty: string;
	targetProperty: string;
	paletteProperty: string;
	palettes: Palette[];
	defaultPalette: string;
	showFolderBars: boolean;
	showStatusBar: boolean;
	viewSort: ViewSort;
	viewGroupByFolder: boolean;
}

export const BUILT_IN_PALETTES: Palette[] = [
	// "Default" matches the pre-1.2 hsl(0→120, 70%, 45%) gradient.
	{
		name: "Default",
		light: { start: "#c32222", mid: "#c3c322", end: "#22c322", overflow: "#a882ff", track: "" },
	},
	{
		name: "Ocean",
		light: { start: "#74c0fc", mid: "#339af0", end: "#1864ab", overflow: "#e64980", track: "" },
	},
	{
		name: "Violet",
		light: { start: "#d0bfff", mid: "#845ef7", end: "#5f3dc4", overflow: "#e8590c", track: "" },
	},
];

export const DEFAULT_SETTINGS: FilesProgressSettings = {
	targetChars: 3600,
	excludeFrontmatter: false,
	barThickness: 2,
	highlightOverflow: true,
	includedFolders: [],
	excludedFolders: [],
	includedFiles: [],
	excludedFiles: [],
	folderRules: [],
	scopeProperty: "progress",
	manualProgressProperty: "progress-percent",
	targetProperty: "progress-target",
	paletteProperty: "progress-palette",
	palettes: BUILT_IN_PALETTES,
	defaultPalette: "Default",
	showFolderBars: false,
	showStatusBar: true,
	viewSort: "completion-desc",
	viewGroupByFolder: false,
};

/** Effective theme for the document containing the rendered element. */
export function isDarkTheme(doc: Document): boolean {
	return doc.body.classList.contains("theme-dark");
}

export function resolveColors(palette: Palette, dark: boolean): PaletteColors {
	return dark && palette.dark ? palette.dark : palette.light;
}

function parseColor(hex: string): [number, number, number] | null {
	const match = hex.trim().match(/^#([0-9a-f]{3}|[0-9a-f]{6})$/i);
	if (!match) return null;
	let h = match[1];
	if (h.length === 3) h = h.split("").map((c) => c + c).join("");
	const n = parseInt(h, 16);
	return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
}

function mix(a: string, b: string, t: number): string {
	const ca = parseColor(a);
	const cb = parseColor(b);
	if (!ca || !cb) return t < 0.5 ? a : b;
	const c = ca.map((x, i) => Math.round(x + (cb[i] - x) * t));
	return `rgb(${c[0]}, ${c[1]}, ${c[2]})`;
}

export function paletteColor(
	colors: PaletteColors,
	ratio: number,
	highlightOverflow: boolean
): string {
	if (ratio > 1 && highlightOverflow) return colors.overflow;
	const t = Math.max(0, Math.min(1, ratio));
	return t <= 0.5
		? mix(colors.start, colors.mid, t * 2)
		: mix(colors.mid, colors.end, (t - 0.5) * 2);
}

export function parentPath(path: string): string {
	const idx = path.lastIndexOf("/");
	return idx === -1 ? "" : path.slice(0, idx);
}

export interface Completion {
	target: number;
	ratio: number;
	manualPercent?: number;
}

/** Parse a user-authored frontmatter percentage without coercing invalid shapes. */
export function parseManualProgress(value: unknown): number | undefined {
	const parsed =
		typeof value === "number"
			? value
			: typeof value === "string" && value.trim() !== ""
			? Number(value)
			: Number.NaN;
	return Number.isFinite(parsed) && parsed >= 1 && parsed <= 100 ? parsed : undefined;
}

/** Resolve manual progress first, then fall back to the established character ratio. */
export function resolveCompletion(
	count: number,
	target: number,
	manualValue: unknown
): Completion {
	const manualPercent = parseManualProgress(manualValue);
	if (manualPercent !== undefined) {
		return { target, ratio: manualPercent / 100, manualPercent };
	}
	return { target, ratio: target > 0 ? count / target : 0 };
}

export function formatManualPercent(value: number): string {
	return String(Number(value.toFixed(4)));
}

function isRecord(value: unknown): value is Record<string, unknown> {
	return typeof value === "object" && value !== null && !Array.isArray(value);
}

function stringValue(value: unknown, fallback: string): string {
	return typeof value === "string" ? value : fallback;
}

function booleanValue(value: unknown, fallback: boolean): boolean {
	return typeof value === "boolean" ? value : fallback;
}

function finiteNumber(value: unknown): number | undefined {
	if (typeof value === "number") return Number.isFinite(value) ? value : undefined;
	if (typeof value !== "string" || value.trim() === "") return undefined;
	const parsed = Number(value);
	return Number.isFinite(parsed) ? parsed : undefined;
}

function positiveInteger(value: unknown): number | undefined {
	const parsed = finiteNumber(value);
	if (parsed === undefined) return undefined;
	const rounded = Math.round(parsed);
	return rounded > 0 ? rounded : undefined;
}

function stringArray(value: unknown): string[] {
	return Array.isArray(value) ? value.filter((item): item is string => typeof item === "string") : [];
}

function clonePalette(palette: Palette): Palette {
	return {
		name: palette.name,
		light: { ...palette.light },
		dark: palette.dark ? { ...palette.dark } : undefined,
	};
}

function normalizeColors(value: unknown): PaletteColors | undefined {
	if (!isRecord(value)) return undefined;
	const start = stringValue(value.start, "");
	const mid = stringValue(value.mid, "");
	const end = stringValue(value.end, "");
	const overflow = stringValue(value.overflow, "");
	if (!start || !mid || !end || !overflow) return undefined;
	return {
		start,
		mid,
		end,
		overflow,
		track: stringValue(value.track, ""),
	};
}

function normalizePalette(value: unknown): Palette | undefined {
	if (!isRecord(value)) return undefined;
	const name = stringValue(value.name, "").trim();
	if (!name) return undefined;

	// Before 1.3, palette colors lived directly on the palette object.
	const light = normalizeColors(isRecord(value.light) ? value.light : value);
	if (!light) return undefined;
	const dark = value.dark === undefined ? undefined : normalizeColors(value.dark);
	return { name, light, dark };
}

function normalizeFolderRules(data: Record<string, unknown>): FolderRule[] {
	const source = Array.isArray(data.folderRules)
		? data.folderRules
		: Array.isArray(data.folderTargets)
		? data.folderTargets
		: [];
	const rules: FolderRule[] = [];
	for (const value of source) {
		if (!isRecord(value) || typeof value.path !== "string") continue;
		const rule: FolderRule = { path: value.path };
		const target = positiveInteger(value.target);
		if (target !== undefined) rule.target = target;
		if (typeof value.palette === "string" && value.palette.trim()) {
			rule.palette = value.palette;
		}
		rules.push(rule);
	}
	return rules;
}

const VIEW_SORTS: readonly ViewSort[] = [
	"completion-desc",
	"completion-asc",
	"name",
	"path",
	"chars-desc",
	"mtime-desc",
];

function isViewSort(value: unknown): value is ViewSort {
	return typeof value === "string" && VIEW_SORTS.some((sort) => sort === value);
}

/** Validate and migrate persisted plugin data at its storage boundary. */
export function normalizeSettings(value: unknown): FilesProgressSettings {
	const data = isRecord(value) ? value : {};
	const palettes = Array.isArray(data.palettes)
		? data.palettes.map(normalizePalette).filter((palette): palette is Palette => palette !== undefined)
		: [];
	const normalizedPalettes = (
		palettes.length > 0 ? palettes : BUILT_IN_PALETTES
	).map(clonePalette);
	const requestedDefault = stringValue(data.defaultPalette, DEFAULT_SETTINGS.defaultPalette);
	const defaultPalette = normalizedPalettes.some((palette) => palette.name === requestedDefault)
		? requestedDefault
		: normalizedPalettes[0].name;
	const targetChars = positiveInteger(data.targetChars) ?? DEFAULT_SETTINGS.targetChars;
	const thickness = positiveInteger(data.barThickness);
	const viewSort = isViewSort(data.viewSort) ? data.viewSort : DEFAULT_SETTINGS.viewSort;

	return {
		targetChars,
		excludeFrontmatter: booleanValue(data.excludeFrontmatter, DEFAULT_SETTINGS.excludeFrontmatter),
		barThickness:
			thickness !== undefined && thickness >= 1 && thickness <= 4
				? thickness
				: DEFAULT_SETTINGS.barThickness,
		highlightOverflow: booleanValue(
			data.highlightOverflow,
			DEFAULT_SETTINGS.highlightOverflow
		),
		includedFolders: stringArray(data.includedFolders),
		excludedFolders: stringArray(data.excludedFolders),
		includedFiles: stringArray(data.includedFiles),
		excludedFiles: stringArray(data.excludedFiles),
		folderRules: normalizeFolderRules(data),
		scopeProperty: stringValue(data.scopeProperty, DEFAULT_SETTINGS.scopeProperty),
		manualProgressProperty: stringValue(
			data.manualProgressProperty,
			DEFAULT_SETTINGS.manualProgressProperty
		),
		targetProperty: stringValue(data.targetProperty, DEFAULT_SETTINGS.targetProperty),
		paletteProperty: stringValue(data.paletteProperty, DEFAULT_SETTINGS.paletteProperty),
		palettes: normalizedPalettes,
		defaultPalette,
		showFolderBars: booleanValue(data.showFolderBars, DEFAULT_SETTINGS.showFolderBars),
		showStatusBar: booleanValue(data.showStatusBar, DEFAULT_SETTINGS.showStatusBar),
		viewSort,
		viewGroupByFolder: booleanValue(
			data.viewGroupByFolder,
			DEFAULT_SETTINGS.viewGroupByFolder
		),
	};
}
