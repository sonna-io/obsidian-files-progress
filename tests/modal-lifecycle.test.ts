import { describe, expect, it, vi } from "vitest";
import { normalizeSettings } from "../src/types";

const renderedText: string[] = [];
const clickHandlers: Array<() => unknown> = [];

function component() {
	const target: Record<string, unknown> = { inputEl: {}, selectEl: {} };
	const proxy = new Proxy(target, {
		get(object, property) {
			if (property in object) return object[property as string];
			if (property === "onClick") {
				return (callback: () => unknown) => {
					clickHandlers.push(callback);
					return proxy;
				};
			}
			return () => proxy;
		},
	});
	return proxy;
}

function element() {
	return {
		empty: vi.fn(),
		createEl: vi.fn((_tag: string, options?: { text?: string }) => {
			if (options?.text) renderedText.push(options.text);
			return element();
		}),
		createDiv: vi.fn(() => element()),
		createSpan: vi.fn(() => element()),
	};
}

vi.mock("obsidian", () => {
	class Modal {
		contentEl = element();
		constructor(public app: unknown) {}
		open() {
			// Obsidian owns this undocumented Modal field and initializes it on open.
			(this as unknown as { selection: unknown }).selection = {};
			(this as unknown as { onOpen: () => void }).onOpen();
		}
		close() {}
		setTitle() {}
	}
	class Setting {
		constructor(_container: unknown) {}
		setName() {
			return this;
		}
		setDesc() {
			return this;
		}
		addDropdown(callback: (value: ReturnType<typeof component>) => void) {
			callback(component());
			return this;
		}
		addText(callback: (value: ReturnType<typeof component>) => void) {
			callback(component());
			return this;
		}
		addButton(callback: (value: ReturnType<typeof component>) => void) {
			callback(component());
			return this;
		}
	}
	return {
		AbstractInputSuggest: class {},
		ItemView: class {},
		Keymap: { isModEvent: () => false },
		Menu: class {},
		Modal,
		Notice: class {},
		Plugin: class {},
		PluginSettingTab: class {},
		Setting,
		TFile: class {},
		TFolder: class {},
		WorkspaceLeaf: class {},
		activeDocument: { body: {} },
		setIcon: vi.fn(),
	};
});

function plugin() {
	const settings = normalizeSettings(undefined);
	return {
		app: {},
		settings,
		defaultPalette: () => settings.palettes[0],
		applyProgressPatch: vi.fn(async () => undefined),
	};
}

describe("progress modal lifecycle", () => {
	it("keeps selected items when Obsidian initializes its internal selection field", async () => {
		const { BulkProgressModal, ClearProgressOverridesModal } = await import("../src/main");
		const items = [{ kind: "file" as const, path: "Note.md" }];

		expect(() => new BulkProgressModal(plugin() as never, items).open()).not.toThrow();
		renderedText.splice(0);
		const clearPlugin = plugin();
		new ClearProgressOverridesModal(clearPlugin as never, items).open();

		expect(renderedText.join(" ")).toContain("1 selected item");
		expect(renderedText.join(" ")).not.toContain("undefined selected items");
		await clickHandlers.at(-1)?.();
		expect(clearPlugin.applyProgressPatch).toHaveBeenCalledWith(items, {
			scope: "clear",
			manual: { mode: "clear" },
			target: { mode: "clear" },
			palette: { mode: "clear" },
		});
	});
});
