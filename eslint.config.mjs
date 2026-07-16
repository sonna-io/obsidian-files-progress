import obsidianmd from "eslint-plugin-obsidianmd";

export default [
	{
		ignores: ["main.js", "node_modules/**", "esbuild.config.mjs", "eslint.config.mjs"],
	},
	...obsidianmd.configs.recommended,
	{
		files: ["**/*.ts"],
		languageOptions: {
			parserOptions: {
				projectService: true,
				tsconfigRootDir: import.meta.dirname,
			},
		},
	},
	{
		files: ["tests/**/*.ts"],
		rules: {
			"obsidianmd/no-nodejs-modules": "off",
		},
	},
];
