export interface FolderTarget {
	path: string;
	target: number;
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
	folderTargets: FolderTarget[];
	showFolderBars: boolean;
	showStatusBar: boolean;
	viewSort: ViewSort;
	viewGroupByFolder: boolean;
}

export const DEFAULT_SETTINGS: FilesProgressSettings = {
	targetChars: 3600,
	excludeFrontmatter: false,
	barThickness: 2,
	highlightOverflow: true,
	includedFolders: [],
	excludedFolders: [],
	folderTargets: [],
	showFolderBars: false,
	showStatusBar: true,
	viewSort: "completion-desc",
	viewGroupByFolder: false,
};

export function progressColor(ratio: number, highlightOverflow: boolean): string {
	if (ratio > 1 && highlightOverflow) return "var(--color-purple, #a882ff)";
	return `hsl(${Math.round(Math.min(1, ratio) * 120)}, 70%, 45%)`;
}

export function parentPath(path: string): string {
	const idx = path.lastIndexOf("/");
	return idx === -1 ? "" : path.slice(0, idx);
}
