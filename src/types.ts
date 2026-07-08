export interface Palette {
	name: string;
	/** Color at 0% fullness. */
	start: string;
	/** Color at 50% fullness. */
	mid: string;
	/** Color at 100% fullness. */
	end: string;
	/** Color past the target (when overflow highlighting is on). */
	overflow: string;
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
	{ name: "Default", start: "#c32222", mid: "#c3c322", end: "#22c322", overflow: "#a882ff" },
	{ name: "Ocean", start: "#74c0fc", mid: "#339af0", end: "#1864ab", overflow: "#e64980" },
	{ name: "Violet", start: "#d0bfff", mid: "#845ef7", end: "#5f3dc4", overflow: "#e8590c" },
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

export function paletteColor(palette: Palette, ratio: number, highlightOverflow: boolean): string {
	if (ratio > 1 && highlightOverflow) return palette.overflow;
	const t = Math.max(0, Math.min(1, ratio));
	return t <= 0.5
		? mix(palette.start, palette.mid, t * 2)
		: mix(palette.mid, palette.end, (t - 0.5) * 2);
}

export function parentPath(path: string): string {
	const idx = path.lastIndexOf("/");
	return idx === -1 ? "" : path.slice(0, idx);
}
