import type { FilesProgressSettings, FolderRule } from "./types";
import { parseManualProgress } from "./types";

export interface ProgressSelectionItem {
	kind: "file" | "folder";
	path: string;
}

export type ValueChange<T> =
	| { mode: "unchanged" }
	| { mode: "clear" }
	| { mode: "set"; value: T };

export interface BulkProgressPatch {
	scope: "unchanged" | "show" | "hide" | "clear";
	manual: ValueChange<number>;
	target: ValueChange<number>;
	palette: ValueChange<string>;
}

export interface BulkProgressContext {
	settings: FilesProgressSettings;
	writeFrontmatter: (
		path: string,
		update: (frontmatter: Record<string, unknown>) => void
	) => Promise<void>;
	saveSettings: () => Promise<void>;
}

export interface BulkProgressResult {
	attemptedFiles: number;
	updatedFiles: number;
	failedFiles: string[];
}

export type ProgressMenuAction =
	| "settings"
	| "show"
	| "hide"
	| "manual"
	| "target"
	| "palette"
	| "clear";

export function progressMenuActions(
	items: ProgressSelectionItem[],
	allIncluded: boolean
): ProgressMenuAction[] {
	const selection = normalizedItems(items);
	if (!selection.length) return [];
	const scopeActions: ProgressMenuAction[] =
		selection.length === 1 ? [allIncluded ? "hide" : "show"] : ["show", "hide"];
	return [
		"settings",
		...scopeActions,
		...(selection.some((item) => item.kind === "file")
			? (["manual"] as ProgressMenuAction[])
			: []),
		"target",
		"palette",
		"clear",
	];
}

export const UNCHANGED_PATCH: BulkProgressPatch = {
	scope: "unchanged",
	manual: { mode: "unchanged" },
	target: { mode: "unchanged" },
	palette: { mode: "unchanged" },
};

function normalizedItems(items: ProgressSelectionItem[]): ProgressSelectionItem[] {
	const seen = new Set<string>();
	return items.filter((item) => {
		const key = `${item.kind}:${item.path}`;
		if (!item.path || item.path === "/" || seen.has(key)) return false;
		seen.add(key);
		return true;
	});
}

function removePath(paths: string[], path: string): string[] {
	return paths.filter((candidate) => candidate.trim() !== path);
}

function addPath(paths: string[], path: string): string[] {
	const without = removePath(paths, path);
	without.push(path);
	return without;
}

function applyScope(
	settings: FilesProgressSettings,
	item: ProgressSelectionItem,
	scope: BulkProgressPatch["scope"]
): boolean {
	if (scope === "unchanged") return false;
	const includeKey = item.kind === "file" ? "includedFiles" : "includedFolders";
	const excludeKey = item.kind === "file" ? "excludedFiles" : "excludedFolders";
	const before = `${settings[includeKey].join("\0")}|${settings[excludeKey].join("\0")}`;

	settings[includeKey] = removePath(settings[includeKey], item.path);
	settings[excludeKey] = removePath(settings[excludeKey], item.path);
	if (scope === "show") settings[includeKey] = addPath(settings[includeKey], item.path);
	if (scope === "hide") settings[excludeKey] = addPath(settings[excludeKey], item.path);

	return before !== `${settings[includeKey].join("\0")}|${settings[excludeKey].join("\0")}`;
}

function folderRule(settings: FilesProgressSettings, path: string): FolderRule {
	let rule = settings.folderRules.find((candidate) => candidate.path.trim() === path);
	if (!rule) {
		rule = { path };
		settings.folderRules.push(rule);
	}
	return rule;
}

function applyFolderValues(
	settings: FilesProgressSettings,
	path: string,
	patch: BulkProgressPatch
): boolean {
	if (patch.target.mode === "unchanged" && patch.palette.mode === "unchanged") return false;
	const existing = settings.folderRules.find((candidate) => candidate.path.trim() === path);
	const before = existing ? JSON.stringify(existing) : "";
	const rule = folderRule(settings, path);

	if (patch.target.mode === "clear") delete rule.target;
	if (patch.target.mode === "set") rule.target = patch.target.value;
	if (patch.palette.mode === "clear") delete rule.palette;
	if (patch.palette.mode === "set") rule.palette = patch.palette.value;

	if (rule.target === undefined && !rule.palette) {
		settings.folderRules = settings.folderRules.filter((candidate) => candidate !== rule);
	}
	const after = settings.folderRules.find((candidate) => candidate.path.trim() === path);
	return before !== (after ? JSON.stringify(after) : "");
}

function setOrDelete(
	frontmatter: Record<string, unknown>,
	key: string,
	change: ValueChange<number | string>
) {
	if (!key || change.mode === "unchanged") return;
	if (change.mode === "clear") delete frontmatter[key];
	else frontmatter[key] = change.value;
}

function validatePatch(patch: BulkProgressPatch) {
	if (
		patch.manual.mode === "set" &&
		parseManualProgress(patch.manual.value) === undefined
	) {
		throw new Error("Manual progress must be a number from 1 through 100.");
	}
	if (
		patch.target.mode === "set" &&
		(!Number.isFinite(patch.target.value) || patch.target.value <= 0)
	) {
		throw new Error("Target character count must be a positive number.");
	}
	if (patch.palette.mode === "set" && !patch.palette.value.trim()) {
		throw new Error("Palette must not be empty.");
	}
}

export async function applyBulkProgressPatch(
	context: BulkProgressContext,
	items: ProgressSelectionItem[],
	patch: BulkProgressPatch
): Promise<BulkProgressResult> {
	validatePatch(patch);
	const selection = normalizedItems(items);
	let settingsChanged = false;
	for (const item of selection) {
		settingsChanged = applyScope(context.settings, item, patch.scope) || settingsChanged;
		if (item.kind === "folder") {
			settingsChanged = applyFolderValues(context.settings, item.path, patch) || settingsChanged;
		}
	}
	if (settingsChanged) await context.saveSettings();

	const files = selection.filter((item) => item.kind === "file");
	const shouldWriteFiles =
		patch.scope === "clear" ||
		patch.manual.mode !== "unchanged" ||
		patch.target.mode !== "unchanged" ||
		patch.palette.mode !== "unchanged";
	const failedFiles: string[] = [];
	let updatedFiles = 0;
	if (shouldWriteFiles) {
		for (const file of files) {
			try {
				await context.writeFrontmatter(file.path, (frontmatter) => {
					if (patch.scope === "clear") {
						const key = context.settings.scopeProperty.trim();
						if (key) delete frontmatter[key];
					}
					setOrDelete(
						frontmatter,
						context.settings.manualProgressProperty.trim(),
						patch.manual
					);
					setOrDelete(
						frontmatter,
						context.settings.targetProperty.trim(),
						patch.target
					);
					setOrDelete(
						frontmatter,
						context.settings.paletteProperty.trim(),
						patch.palette
					);
				});
				updatedFiles++;
			} catch {
				failedFiles.push(file.path);
			}
		}
	}

	return {
		attemptedFiles: shouldWriteFiles ? files.length : 0,
		updatedFiles,
		failedFiles,
	};
}
