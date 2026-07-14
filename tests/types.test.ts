import { describe, expect, it } from "vitest";
import {
	BUILT_IN_PALETTES,
	DEFAULT_SETTINGS,
	normalizeSettings,
	parseManualProgress,
	resolveCompletion,
} from "../src/types";

describe("parseManualProgress", () => {
	it.each([
		[1, 1],
		[42.5, 42.5],
		[100, 100],
		["1", 1],
		[" 42.5 ", 42.5],
		["100", 100],
	])("accepts %j as a percentage", (value, expected) => {
		expect(parseManualProgress(value)).toBe(expected);
	});

	it.each([
		undefined,
		null,
		"",
		"   ",
		"not a number",
		false,
		true,
		[50],
		{ value: 50 },
		Number.NaN,
		Number.POSITIVE_INFINITY,
		Number.NEGATIVE_INFINITY,
		0,
		-1,
		100.0001,
		"0",
		"101",
	])("rejects out-of-range or non-scalar input %#", (value) => {
		expect(parseManualProgress(value)).toBeUndefined();
	});
});

describe("resolveCompletion", () => {
	it("uses a valid decimal manual percentage instead of the character ratio", () => {
		const completion = resolveCompletion(7_200, 3_600, 42.5);

		expect(completion.target).toBe(3_600);
		expect(completion.ratio).toBeCloseTo(0.425);
		expect(completion.manualPercent).toBe(42.5);
	});

	it("accepts a quoted numeric frontmatter value", () => {
		expect(resolveCompletion(7_200, 3_600, "12.25")).toEqual({
			target: 3_600,
			ratio: 0.1225,
			manualPercent: 12.25,
		});
	});

	it("treats exactly 100 percent as full without producing overflow", () => {
		expect(resolveCompletion(7_200, 3_600, 100)).toEqual({
			target: 3_600,
			ratio: 1,
			manualPercent: 100,
		});
	});

	it("falls back to the established character ratio for an invalid override", () => {
		const completion = resolveCompletion(7_200, 3_600, 0);

		expect(completion).toEqual({ target: 3_600, ratio: 2 });
		expect("manualPercent" in completion).toBe(false);
	});

	it("returns zero for automatic completion when the target is not positive", () => {
		expect(resolveCompletion(500, 0, undefined)).toEqual({ target: 0, ratio: 0 });
		expect(resolveCompletion(500, -10, "invalid")).toEqual({ target: -10, ratio: 0 });
	});

	it("still honors valid manual progress when the automatic target is unusable", () => {
		expect(resolveCompletion(500, 0, 25)).toEqual({
			target: 0,
			ratio: 0.25,
			manualPercent: 25,
		});
	});
});

describe("normalizeSettings", () => {
	it("supplies safe defaults for missing or non-object persisted data", () => {
		for (const raw of [undefined, null, "invalid", []]) {
			const settings = normalizeSettings(raw);
			expect(settings.targetChars).toBe(DEFAULT_SETTINGS.targetChars);
			expect(settings.manualProgressProperty).toBe("progress-percent");
			expect(settings.folderRules).toEqual([]);
			expect(settings.viewSort).toBe(DEFAULT_SETTINGS.viewSort);
			expect(settings.palettes).toEqual(BUILT_IN_PALETTES);
		}
	});

	it("clones built-in palettes so normalized settings cannot mutate defaults", () => {
		const settings = normalizeSettings(undefined);
		const originalStart = BUILT_IN_PALETTES[0].light.start;

		expect(settings.palettes).not.toBe(BUILT_IN_PALETTES);
		expect(settings.palettes[0]).not.toBe(BUILT_IN_PALETTES[0]);
		expect(settings.palettes[0].light).not.toBe(BUILT_IN_PALETTES[0].light);

		settings.palettes[0].light.start = "#000000";
		expect(BUILT_IN_PALETTES[0].light.start).toBe(originalStart);
	});

	it("migrates 1.1 folderTargets and adds the manual-progress default", () => {
		const settings = normalizeSettings({
			targetChars: 4_000,
			folderTargets: [
				{ path: "Drafts", target: 2_500 },
				{ path: "Longform", target: "7200" },
			],
			scopeProperty: "tracked",
		});

		expect(settings.folderRules).toEqual([
			{ path: "Drafts", target: 2_500 },
			{ path: "Longform", target: 7_200 },
		]);
		expect(settings.scopeProperty).toBe("tracked");
		expect(settings.manualProgressProperty).toBe(DEFAULT_SETTINGS.manualProgressProperty);
	});

	it("prefers an existing folderRules array over obsolete folderTargets", () => {
		const settings = normalizeSettings({
			folderRules: [{ path: "Current", target: 3_000, palette: "Ocean" }],
			folderTargets: [{ path: "Legacy", target: 1_000 }],
		});

		expect(settings.folderRules).toEqual([
			{ path: "Current", target: 3_000, palette: "Ocean" },
		]);
	});

	it("migrates a 1.2 flat palette to a light variant with a default track", () => {
		const settings = normalizeSettings({
			palettes: [
				{
					name: "Legacy",
					start: "#111111",
					mid: "#222222",
					end: "#333333",
					overflow: "#444444",
				},
			],
			defaultPalette: "Legacy",
		});

		expect(settings.palettes).toEqual([
			{
				name: "Legacy",
				light: {
					start: "#111111",
					mid: "#222222",
					end: "#333333",
					overflow: "#444444",
					track: "",
				},
				dark: undefined,
			},
		]);
		expect(settings.defaultPalette).toBe("Legacy");
	});

	it("preserves current palette variants and fills missing track colors", () => {
		const settings = normalizeSettings({
			palettes: [
				{
					name: "Current",
					light: {
						start: "#111111",
						mid: "#222222",
						end: "#333333",
						overflow: "#444444",
						track: "#555555",
					},
					dark: {
						start: "#aaaaaa",
						mid: "#bbbbbb",
						end: "#cccccc",
						overflow: "#dddddd",
					},
				},
			],
		});

		expect(settings.palettes[0].light.track).toBe("#555555");
		expect(settings.palettes[0].dark?.track).toBe("");
	});

	it("retains an empty manual property as the supported disabled state", () => {
		const settings = normalizeSettings({ manualProgressProperty: "" });

		expect(settings.manualProgressProperty).toBe("");
	});

	it("rejects malformed persisted values while retaining valid list entries", () => {
		const settings = normalizeSettings({
			targetChars: 0.4,
			barThickness: 99,
			excludeFrontmatter: "true",
			highlightOverflow: 0,
			includedFolders: ["Notes", 42, "Drafts", null],
			excludedFiles: [false, "Archive/Old.md"],
			folderRules: [
				null,
				{ path: 42, target: 100 },
				{ path: "Valid", target: "2500.5", palette: "Ocean" },
			],
			manualProgressProperty: false,
			palettes: [{ name: "Broken" }],
			defaultPalette: "Missing",
			viewSort: "unknown",
		});

		expect(settings.targetChars).toBe(DEFAULT_SETTINGS.targetChars);
		expect(settings.barThickness).toBe(DEFAULT_SETTINGS.barThickness);
		expect(settings.excludeFrontmatter).toBe(DEFAULT_SETTINGS.excludeFrontmatter);
		expect(settings.highlightOverflow).toBe(DEFAULT_SETTINGS.highlightOverflow);
		expect(settings.includedFolders).toEqual(["Notes", "Drafts"]);
		expect(settings.excludedFiles).toEqual(["Archive/Old.md"]);
		expect(settings.folderRules).toEqual([
			{ path: "Valid", target: 2_501, palette: "Ocean" },
		]);
		expect(settings.manualProgressProperty).toBe(DEFAULT_SETTINGS.manualProgressProperty);
		expect(settings.palettes).toEqual(BUILT_IN_PALETTES);
		expect(settings.defaultPalette).toBe(BUILT_IN_PALETTES[0].name);
		expect(settings.viewSort).toBe(DEFAULT_SETTINGS.viewSort);
	});
});
