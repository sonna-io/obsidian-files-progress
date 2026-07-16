export class PathSelection {
	private selected = new Set<string>();
	private anchor: string | undefined;

	has(path: string): boolean {
		return this.selected.has(path);
	}

	values(): string[] {
		return Array.from(this.selected);
	}

	replace(path: string) {
		this.selected = new Set([path]);
		this.anchor = path;
	}

	toggle(path: string) {
		if (this.selected.has(path)) this.selected.delete(path);
		else this.selected.add(path);
		this.anchor = path;
	}

	selectRange(path: string, visiblePaths: string[]) {
		const targetIndex = visiblePaths.indexOf(path);
		const anchorIndex = this.anchor ? visiblePaths.indexOf(this.anchor) : -1;
		if (targetIndex === -1 || anchorIndex === -1) {
			this.replace(path);
			return;
		}
		const start = Math.min(anchorIndex, targetIndex);
		const end = Math.max(anchorIndex, targetIndex);
		this.selected = new Set(visiblePaths.slice(start, end + 1));
	}

	selectForContextMenu(path: string) {
		if (!this.selected.has(path)) this.replace(path);
	}

	prune(visiblePaths: string[]) {
		const visible = new Set(visiblePaths);
		this.selected = new Set(this.values().filter((path) => visible.has(path)));
		if (this.anchor && !visible.has(this.anchor)) {
			this.anchor = this.values()[0];
		}
	}
}
