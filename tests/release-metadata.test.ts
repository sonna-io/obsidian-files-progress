import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

function readJson(path: string): Record<string, unknown> {
	return JSON.parse(readFileSync(path, "utf8")) as Record<string, unknown>;
}

describe("release metadata", () => {
	it("ships version 1.5.0 for the Obsidian 1.5.7 API floor", () => {
		const manifest = readJson("manifest.json");
		const packageJson = readJson("package.json");
		const versions = readJson("versions.json");
		const lock = readJson("package-lock.json");
		const lockPackages = lock.packages as Record<string, Record<string, unknown>>;

		expect(manifest.version).toBe("1.5.0");
		expect(packageJson.version).toBe(manifest.version);
		expect(manifest.minAppVersion).toBe("1.5.7");
		expect(versions["1.5.0"]).toBe(manifest.minAppVersion);
		expect(versions["1.4.0"]).toBe("1.13.0");
		expect((packageJson.devDependencies as Record<string, unknown>).obsidian).toBe("1.5.7");
		expect(lockPackages[""].version).toBe("1.5.0");
		expect(lockPackages["node_modules/obsidian"].version).toBe("1.5.7");
	});
});
