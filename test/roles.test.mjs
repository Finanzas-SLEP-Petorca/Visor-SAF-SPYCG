// Verifica que los campos por rol de la app coincidan con vCamposRol() de firestore.rules.
// Las reglas viven en docs/privado/ (fuera de git); si no están, la prueba se omite.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, existsSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { CAMPOS_ROL, CAMPOS_DIRECCION, FORMULARIOS } from '../src/roles.js';

const REGLAS = join(dirname(fileURLToPath(import.meta.url)), '..', 'docs', 'privado', 'firestore.rules');
const lista = (txt) => [...txt.matchAll(/'([a-zA-Z_]+)'/g)].map((m) => m[1]);

test('campos por rol = vCamposRol() de firestore.rules', { skip: !existsSync(REGLAS) && 'sin docs/privado/firestore.rules' }, () => {
  const r = readFileSync(REGLAS, 'utf8');
  const dir = lista(/function vCamposDireccion\(\)\s*\{([\s\S]*?)\}/.exec(r)[1]);
  assert.deepEqual([...CAMPOS_DIRECCION].sort(), dir.sort());
  const cuerpo = /function vCamposRol\(rol\)\s*\{([\s\S]*?)\n\s{4}\}/.exec(r)[1];
  for (const rol of ['compras', 'presupuesto', 'finanzas']) {
    const m = new RegExp(`rol == '${rol}' \\? \\[([\\s\\S]*?)\\]`).exec(cuerpo);
    assert.deepEqual([...CAMPOS_ROL[rol]].sort(), lista(m[1]).sort(), rol);
  }
  assert.ok(cuerpo.includes("vCamposDireccion().concat(['obs_subdirSAF'])"));
  assert.ok(cuerpo.includes("vCamposDireccion().concat(['obs_subdirSPYCG'])"));
});

test('todos los campos de los formularios son escribibles por algún rol', () => {
  const todos = new Set(Object.values(CAMPOS_ROL).flat());
  for (const f of FORMULARIOS) for (const c of f.campos) assert.ok(todos.has(c.k), c.k);
});
