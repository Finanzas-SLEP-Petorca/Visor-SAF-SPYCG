#!/usr/bin/env node
// Diagnóstico de estructura: muestra, por planilla, la fila de encabezados y qué campo reconoce el
// Visor en cada columna, para las planillas de unidad y el Seguimiento SEP, y lista los archivos Excel
// de la carpeta que el Visor no reconoce. Imprime SOLO títulos de columna y nombres de hoja y de archivo
// (nunca filas de datos ni montos).
// Lee VISOR_DATA_DIR de sync/.env y copia cada archivo a un temporal (puede estar abierto en Excel).
// Uso: npm run encabezados
import { readFileSync, existsSync, readdirSync, copyFileSync, rmSync, mkdtempSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { tmpdir } from 'node:os';
import { fileURLToPath } from 'node:url';
import * as XLSX from 'xlsx';
import { diagnosticarEncabezados } from '../src/normalizer.js';
import { diagnosticarEncabezadosSEP } from '../src/normalizer-sep.js';
import { clasificarArchivo } from '../src/importacion.js';

const AQUI = dirname(fileURLToPath(import.meta.url));
const ascii = (t) => String(t).normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/[^\x20-\x7e]/g, '?');
const ESPERADOS = ['nro', 'programa', 'subtitulo', 'asignacion', 'detalle', 'montoPAC', 'montoOC', 'ocs', 'tipoCompra',
  'devengadoPlanilla', 'ENE', 'DIC', 'totalDesglose', 'obsUnidad'];

for (const ruta of [join(AQUI, '.env'), join(AQUI, '..', '.env')]) {
  if (!existsSync(ruta)) continue;
  for (const linea of readFileSync(ruta, 'utf8').split(/\r?\n/)) {
    const m = /^\s*([A-Z_]+)\s*=\s*(.*?)\s*$/.exec(linea);
    if (m && !(m[1] in process.env)) process.env[m[1]] = m[2].replace(/^"(.*)"$/, '$1');
  }
}
const dir = process.env.VISOR_DATA_DIR;
if (!dir || !existsSync(dir)) { console.error('Defina VISOR_DATA_DIR en sync/.env'); process.exit(1); }

const ESPERADOS_SEP = ['nro', 'subtitulo', 'item', 'montoPresupuestado', 'modalidad', 'idMercadoPublico', 'estadoCompra',
  'ocs', 'montoAdjudicado', 'estadoEjecucion', 'montoDevengado', 'montoPagado', 'observaciones'];

const tmp = mkdtempSync(join(tmpdir(), 'visor-enc-'));
const leer = (n) => {
  const copia = join(tmp, 'p.xlsx');
  copyFileSync(join(dir, n), copia);
  return XLSX.read(readFileSync(copia), { type: 'buffer' });
};
const linea = (c, campo) => console.log(`  ${c.letra.padEnd(3)} ${ascii(c.encabezado || '(sin titulo)').slice(0, 60).padEnd(60)} -> ${ascii(campo)}`);
try {
  const archivos = readdirSync(dir).sort();
  for (const n of archivos.filter((x) => clasificarArchivo(x) === 'SEP')) {
    try {
      const d = diagnosticarEncabezadosSEP(leer(n));
      console.log(`\n=== ${ascii(n)}  (SEGUIMIENTO SEP: hoja "${ascii(d.hoja)}", encabezados en la fila ${d.filaExcel})`);
      console.log(`  Hojas del libro: ${d.hojas.map((h) => `"${ascii(h)}"`).join(', ')}`);
      if (!d.hallada) console.log('  ATENCION: no hay una fila con "ITEM" y "PRESUPUESTADO"; se muestra la mas parecida.');
      for (const c of d.columnas) if (c.encabezado) linea(c, c.campo || (c.repetidoDe ? `(no se usa: ${c.campoRepetido} ya se lee de ${c.repetidoDe})` : '(no se usa)'));
      const vistos = new Set(d.columnas.map((c) => c.campo));
      const faltan = ESPERADOS_SEP.filter((k) => !vistos.has(k));
      console.log(`  ${faltan.length ? `Sin columna: ${faltan.join(', ')}` : 'Todas las columnas esperadas estan presentes'}${vistos.has('visacionUATP') ? ' | visacion UATP: SI' : ''}`);
    } catch (e) {
      console.log(`\n=== ${ascii(n)}  ERROR al leer: ${ascii(e.message)}`);
    }
  }
  for (const n of archivos.filter((x) => clasificarArchivo(x) === 'unidad')) {
    const d = diagnosticarEncabezados(leer(n));
    console.log(`\n=== ${ascii(n)}  (encabezados en la fila ${d.filaExcel})`);
    for (const c of d.columnas) {
      if (!c.encabezado && !c.campo && !c.porPosicion) continue;
      const campo = c.campo || (c.porPosicion ? `${c.porPosicion} (por posicion)` : '(no se usa)');
      console.log(`  ${c.letra.padEnd(3)} ${ascii(c.encabezado || '(sin titulo)').slice(0, 60).padEnd(60)} -> ${ascii(campo)}`);
    }
    const vistos = new Set(d.columnas.flatMap((c) => [c.campo, c.porPosicion]));
    const faltan = ESPERADOS.filter((k) => !vistos.has(k));
    const fuentes = d.columnas.filter((c) => c.campo?.startsWith('fuente:')).length;
    console.log(`  Montos por fuente: ${fuentes} columnas${vistos.has('subvencion') ? ' | columna de subvencion: SI' : ''}${faltan.length ? ` | sin columna: ${faltan.join(', ')}` : ''}`);
  }
  const otros = archivos.filter((x) => /\.xls[xm]?$/i.test(x) && !x.startsWith('~$') && clasificarArchivo(x) === 'ignorado');
  console.log(`\n=== Otros Excel en la carpeta que el Visor NO lee: ${otros.length ? '' : 'ninguno'}`);
  for (const n of otros) console.log(`  ${ascii(n)}`);
} finally {
  rmSync(tmp, { recursive: true, force: true });
}
