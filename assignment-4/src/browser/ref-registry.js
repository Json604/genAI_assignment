export class RefRegistry {
  constructor() {
    /** @type {Map<string, import('playwright').Locator>} */
    this._refs = new Map();
    this._counter = 0;
  }

  clear() {
    this._refs.clear();
    this._counter = 0;
  }

  assign(locator) {
    this._counter += 1;
    const key = `e${this._counter}`;
    this._refs.set(key, locator);
    return key;
  }

  resolve(ref) {
    const key = (ref || "").replace(/^@/, "");
    const locator = this._refs.get(key);
    if (!locator) {
      throw new Error(`Unknown ref "${ref}". Take a fresh browser_snapshot first.`);
    }
    return locator;
  }

  get size() {
    return this._refs.size;
  }
}