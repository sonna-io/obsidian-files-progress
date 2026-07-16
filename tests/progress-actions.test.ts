import { describe, expect, it, vi } from "vitest";
import { DEFAULT_SETTINGS, normalizeSettings } from "../src/types";
import {
	applyBulkProgressPatch,
	progressMenuActions,
	type BulkProgressPatch,
	type ProgressSelectionItem,
} from "../src/progress-actions";

const selection: ProgressSelectionItem[] = [
	{ kind: "file", path: "Drafts/One.md" },
	{ kind: "folder", path: "Projects" },
];

const patch: BulkProgressPatch = {
	scope: "unchanged",
	manual: { mode: "set", value: 42.5 },
	target: { mode: "set", value: 8_000 },
	palette: { mode: "set", value: "Ocean" },
};

describe("applyBulkProgressPatch", () => {
	it("writes note frontmatter while applying folder values as non-recursive rules", async () => {
		const settings = normalizeSettings(DEFAULT_SETTINGS);
		const frontmatter: Record<string, Record<string, unknown>> = {
			"Drafts/One.md": {},
		};
		const saveSettings = vi.fn(async () => undefined);

		const result = await applyBulkProgressPatch(
			{
				settings,
				writeFrontmatter: async (path, update) => update(frontmatter[path]),
				saveSettings,
			},
			selection,
			patch
		);

		expect(frontmatter["Drafts/One.md"]).toEqual({
			"progress-percent": 42.5,
			"progress-target": 8_000,
			"progress-palette": "Ocean",
		});
		expect(settings.folderRules).toContainEqual({
			path: "Projects",
			target: 8_000,
			palette: "Ocean",
		});
		expect(frontmatter.Projects).toBeUndefined();
		expect(saveSettings).toHaveBeenCalledOnce();
		expect(result).toEqual({ attemptedFiles: 1, updatedFiles: 1, failedFiles: [] });
	});

	it("continues after a note fails and reports the failed path", async () => {
		const settings = normalizeSettings(DEFAULT_SETTINGS);
		const touched: string[] = [];
		const result = await applyBulkProgressPatch(
			{
				settings,
				writeFrontmatter: async (path, update) => {
					if (path === "Broken.md") throw new Error("locked");
					update({});
					touched.push(path);
				},
				saveSettings: async () => undefined,
			},
			[
				{ kind: "file", path: "Broken.md" },
				{ kind: "file", path: "Working.md" },
			],
			patch
		);

		expect(touched).toEqual(["Working.md"]);
		expect(result).toEqual({
			attemptedFiles: 2,
			updatedFiles: 1,
			failedFiles: ["Broken.md"],
		});
	});

	it("sets and clears explicit scope without recursively changing descendants", async () => {
		const settings = normalizeSettings({
			includedFiles: ["Note.md"],
			excludedFolders: ["Archive"],
		});
		const frontmatter = { progress: false, "progress-percent": 25 };
		const base = {
			settings,
			writeFrontmatter: async (
				_path: string,
				update: (value: Record<string, unknown>) => void
			) => update(frontmatter),
			saveSettings: async () => undefined,
		};

		await applyBulkProgressPatch(
			base,
			[
				{ kind: "file", path: "Note.md" },
				{ kind: "folder", path: "Archive" },
			],
			{ ...UNCHANGED, scope: "hide" }
		);
		expect(settings.excludedFiles).toContain("Note.md");
		expect(settings.excludedFolders).toContain("Archive");

		await applyBulkProgressPatch(
			base,
			[{ kind: "file", path: "Note.md" }],
			{
				...UNCHANGED,
				scope: "clear",
				manual: { mode: "clear" },
			}
		);
		expect(settings.includedFiles).not.toContain("Note.md");
		expect(settings.excludedFiles).not.toContain("Note.md");
		expect(frontmatter).toEqual({});
	});
});

describe("progressMenuActions", () => {
	it("offers one contextual scope toggle for a single note", () => {
		expect(progressMenuActions([{ kind: "file", path: "Note.md" }], true)).toEqual([
			"settings",
			"hide",
			"manual",
			"target",
			"palette",
			"clear",
		]);
	});

	it("offers explicit show and hide plus note-only manual progress for a mixed selection", () => {
		expect(progressMenuActions(selection, false)).toEqual([
			"settings",
			"show",
			"hide",
			"manual",
			"target",
			"palette",
			"clear",
		]);
		expect(progressMenuActions([{ kind: "folder", path: "Projects" }], false)).not.toContain(
			"manual"
		);
	});
});

const UNCHANGED: BulkProgressPatch = {
	scope: "unchanged",
	manual: { mode: "unchanged" },
	target: { mode: "unchanged" },
	palette: { mode: "unchanged" },
};
