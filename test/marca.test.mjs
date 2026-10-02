// Todas las importaciones relativas del navegador deben llevar la misma marca ?v= que index.html:
// si un módulo se importara con y sin marca, el navegador cargaría dos copias (y dos estados).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const RAIZ = join(dirname(fileURLToPath(import.meta.url)), '..');
const archivos = (dir) => readdirSync(dir).flatMap((n) => {
  const r = join(dir, n);
  return statSync(r).isDirectory() ? archivos(r) : r.endsWith('.js') ? [r] : [];
});

test('marca de versión única en index.html e importaciones de src/', () => {
  const marcas = new Set();
  const sinMarca = [];
  for (const n of ['index.html', 'index-v1.html']) {
    for (const m of readFileSync(join(RAIZ, n), 'utf8').matchAll(/(?:src|href)="((?:src|css)\/[^"]+?\.(?:js|css))(\?v=([\w.-]+))?"/g)) {
      if (m[3]) marcas.add(m[3]); else sinMarca.push(`${n}: ${m[1]}`);
    }
  }
  for (const r of archivos(join(RAIZ, 'src'))) {
    for (const m of readFileSync(r, 'utf8').matchAll(/from\s+'(\.{1,2}\/[^']+?\.js)(\?v=([\w.-]+))?'/g)) {
      if (m[3]) marcas.add(m[3]); else sinMarca.push(`${r.slice(RAIZ.length + 1)}: ${m[1]}`);
    }
  }
  assert.deepEqual(sinMarca, [], 'Ejecute npm run marca');
  assert.equal(marcas.size, 1, `Hay marcas distintas: ${[...marcas].join(', ')}. Ejecute npm run marca`);
});
