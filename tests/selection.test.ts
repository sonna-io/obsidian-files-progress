import { describe, expect, it } from "vitest";
import { PathSelection } from "../src/selection";

const visible = ["A.md", "B.md", "Folder", "C.md"];

describe("PathSelection", () => {
	it("supports replacement, modifier toggles, and visible range selection", () => {
		const selection = new PathSelection();
		selection.replace("A.md");
		selection.toggle("C.md");
		expect(selection.values()).toEqual(["A.md", "C.md"]);

		selection.selectRange("Folder", visible);
		expect(selection.values()).toEqual(["Folder", "C.md"]);
	});

	it("preserves a multi-selection when its selected item is right-clicked", () => {
		const selection = new PathSelection();
		selection.replace("A.md");
		selection.toggle("B.md");

		selection.selectForContextMenu("B.md");
		expect(selection.values()).toEqual(["A.md", "B.md"]);
		selection.selectForContextMenu("C.md");
		expect(selection.values()).toEqual(["C.md"]);
	});

	it("prunes paths hidden by filtering or removed from the vault", () => {
		const selection = new PathSelection();
		selection.replace("A.md");
		selection.toggle("Folder");
		selection.prune(["Folder", "C.md"]);

		expect(selection.values()).toEqual(["Folder"]);
	});
});
