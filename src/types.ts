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
	targetProperty: "progress-target",
	paletteProperty: "progress-palette",
	palettes: BUILT_IN_PALETTES,
	defaultPalette: "Default",
	showFolderBars: false,
	showStatusBar: true,
	viewSort: "completion-desc",
	viewGroupByFolder: false,
};

/** Effective theme, honoring Obsidian's light/dark/system appearance setting. */
export function isDarkTheme(): boolean {
	return document.body.classList.contains("theme-dark");
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
