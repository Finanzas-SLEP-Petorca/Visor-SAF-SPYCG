#!/usr/bin/env node
// Marca de versión para que el navegador no mezcle archivos nuevos con otros guardados en caché
// (GitHub Pages los guarda hasta 10 minutos). Agrega o reemplaza "?v=<marca>" en:
//   - las importaciones relativas de src/**/*.js,
//   - los <script>/<link> locales de index.html e index-v1.html.
// Uso: npm run marca  (antes de cada commit que cambie la interfaz). Sin argumento usa fecha y hora.
import { readFileSync, writeFileSync, readdirSync, statSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const RAIZ = join(dirname(fileURLToPath(import.meta.url)), '..');
const marca = process.argv[2] || new Date().toISOString().slice(0, 16).replace(/[-:T]/g, '');
if (!/^[\w.-]+$/.test(marca)) { console.error('Marca inválida'); process.exit(1); }

const archivos = (dir) => readdirSync(dir).flatMap((n) => {
  const r = join(dir, n);
  return statSync(r).isDirectory() ? archivos(r) : r.endsWith('.js') ? [r] : [];
});

let cambios = 0;
const reescribir = (ruta, fn) => {
  const antes = readFileSync(ruta, 'utf8');
  const despues = fn(antes);
  if (despues !== antes) { writeFileSync(ruta, despues); cambios += 1; }
};
const conMarca = (url) => `${url.replace(/\?v=[\w.-]*$/, '')}?v=${marca}`;

for (const r of archivos(join(RAIZ, 'src'))) {
  reescribir(r, (t) => t.replace(/(from\s+')(\.{1,2}\/[^']+?\.js)(\?v=[\w.-]*)?(')/g, (_, a, url, _v, b) => `${a}${conMarca(url)}${b}`));
}
for (const n of ['index.html', 'index-v1.html']) {
  reescribir(join(RAIZ, n), (t) => t.replace(/((?:src|href)=")((?:src|css)\/[^"]+?\.(?:js|css))(\?v=[\w.-]*)?(")/g, (_, a, url, _v, b) => `${a}${conMarca(url)}${b}`));
}
console.log(`Marca ${marca}: ${cambios} archivos actualizados.`);
