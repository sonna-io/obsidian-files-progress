import { beforeEach, describe, expect, it, vi } from "vitest";
import { normalizeSettings } from "../src/types";

const renderedNames: string[] = [];

function chainedComponent(): Record<string, unknown> {
	const target: Record<string, unknown> = {
		inputEl: {},
		selectEl: {},
		buttonEl: {},
		colorPickerEl: {},
	};
	const proxy = new Proxy(target, {
		get(object, property) {
			if (property in object) return object[property as string];
			return () => proxy;
		},
	});
	return proxy;
}

vi.mock("obsidian", () => {
	class PluginSettingTab {
		app: unknown;
		containerEl = { empty: vi.fn() };
		constructor(app: unknown) {
			this.app = app;
		}
	}
	class Setting {
		controlEl = { createSpan: vi.fn() };
		setName(name: string) {
			if (name) renderedNames.push(name);
			return this;
		}
		setDesc() {
			return this;
		}
		setHeading() {
			return this;
		}
		setClass() {
			return this;
		}
		addText(callback: (component: Record<string, unknown>) => void) {
			callback(chainedComponent());
			return this;
		}
		addSearch(callback: (component: Record<string, unknown>) => void) {
			callback(chainedComponent());
			return this;
		}
		addToggle(callback: (component: Record<string, unknown>) => void) {
			callback(chainedComponent());
			return this;
		}
		addSlider(callback: (component: Record<string, unknown>) => void) {
			callback(chainedComponent());
			return this;
		}
		addDropdown(callback: (component: Record<string, unknown>) => void) {
			callback(chainedComponent());
			return this;
		}
		addButton(callback: (component: Record<string, unknown>) => void) {
			callback(chainedComponent());
			return this;
		}
		addColorPicker(callback: (component: Record<string, unknown>) => void) {
			callback(chainedComponent());
			return this;
		}
		addExtraButton(callback: (component: Record<string, unknown>) => void) {
			callback(chainedComponent());
			return this;
		}
	}
	return {
		AbstractInputSuggest: class {},
		Notice: class {},
		PluginSettingTab,
		Setting,
		TFile: class {},
		TFolder: class {},
	};
});

describe("FilesProgressSettingTab", () => {
	beforeEach(() => renderedNames.splice(0));

	it("imperatively renders the manual progress property for migrated 1.3 settings", async () => {
		const { FilesProgressSettingTab } = await import("../src/settings-tab");
		const plugin = {
			settings: normalizeSettings({ targetChars: 3_600 }),
			saveSettings: vi.fn(async () => undefined),
			settingsChanged: vi.fn(),
			defaultPalette: () => plugin.settings.palettes[0],
			applyBarThickness: vi.fn(),
			scanVault: vi.fn(async () => undefined),
		};
		const tab = new FilesProgressSettingTab({ vault: {} } as never, plugin as never);

		tab.display();

		expect(plugin.settings.manualProgressProperty).toBe("progress-percent");
		expect(renderedNames).toContain("Frontmatter properties");
		expect(renderedNames).toContain("Manual progress property");
	});
});
