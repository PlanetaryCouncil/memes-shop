import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, existsSync } from 'node:fs';

const root = new URL('../', import.meta.url);
const load = (f) => JSON.parse(readFileSync(new URL(`data/${f}`, root)));
const categories = load('categories.json');
const designs = load('designs.json');

test('ids are unique', () => {
  for (const list of [categories, designs]) {
    const ids = list.map((x) => x.id);
    assert.equal(new Set(ids).size, ids.length);
  }
});

test('every design belongs to a known category', () => {
  const known = new Set(categories.map((c) => c.id));
  for (const d of designs) assert.ok(known.has(d.category), `${d.id} has unknown category "${d.category}"`);
});

test('every design file exists', () => {
  for (const d of designs) assert.ok(existsSync(new URL(d.file, root)), `missing ${d.file}`);
});
