// Tiny JSON-file settings store (user-adjustable policy lives here).
import fs from 'node:fs';
import path from 'node:path';

export class Settings {
  constructor(dir, defaults) {
    this.file = path.join(dir, 'settings.json');
    this.values = { ...defaults };
    try {
      Object.assign(this.values, JSON.parse(fs.readFileSync(this.file, 'utf8')));
    } catch { /* first run */ }
  }

  get(key) {
    return this.values[key];
  }

  set(key, value) {
    this.values[key] = value;
    fs.mkdirSync(path.dirname(this.file), { recursive: true });
    fs.writeFileSync(this.file, JSON.stringify(this.values, null, 2));
  }
}
