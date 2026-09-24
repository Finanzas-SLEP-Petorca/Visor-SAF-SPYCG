// Prueba de integración contra las planillas REALES. Solo corre si existe VISOR_DATA_DIR.
// Los valores esperados NO están en este archivo: se leen de la tabla de la sección 12 de
// docs/privado/ESPECIFICACION.md (excluida de git). Nunca imprime datos de filas, solo cifras de control.
//
//   Windows (PowerShell):
//     $env:VISOR_DATA_DIR = "C:\...\Monitoreo control de pagos y ejecucion 2026"
//     npm run test:integracion
//   Opcional: VISOR_SEP_FILE = ruta del Seguimiento SEP si no está en esa carpeta.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, existsSync, readdirSync, statSync, copyFileSync, mkdtempSync, rmSync } from 'node:fs';
import { join, dirname, basename } from 'node:path';
import { tmpdir } from 'node:os';
import { fileURLToPath } from 'node:url';
import * as XLSX from '@e965/xlsx';
import { normalizarPlanilla, PATRON_ARCHIVO_UNIDAD } from '../src/normalizer.js';
import { normalizarSEP, detectarVinculos, PATRON_ARCHIVO_SEP } from '../src/normalizer-sep.js';

const DIR = process.env.VISOR_DATA_DIR;
const RAIZ = join(dirname(fileURLToPath(import.meta.url)), '..');
const SPEC = join(RAIZ, 'docs', 'privado', 'ESPECIFICACION.md');

const num = (s) => Number(String(s).replace(/[$.\s]/g, ''));

/** Lee la tabla de la sección 12 de la especificación. */
export function leerControles(md) {
  const sec = md.split(/\n## 12\./)[1]?.split(/\n## /)[0];
  if (!sec) throw new Error('No se encontró la sección 12 en ESPECIFICACION.md');
  const filas = {};
  for (const l of sec.split('\n')) {
    const m = /^\|\s*([^|]+?)\s*\|\s*(.+?)\s*\|\s*$/.exec(l);
    if (m && !/^-+$/.test(m[1]) && m[1] !== 'Control') filas[m[1]] = m[2];
  }
  const pares = (txt, re = /([A-ZÁÉÍÓÚÑ][A-ZÁÉÍÓÚÑ ]*?)\s+\$?([\d.]+)/g) => {
    const o = {};
    for (const mm of txt.matchAll(re)) o[mm[1].trim()] = num(mm[2]);
    return o;
  };
  const c = {};
  const pf = filas['Planillas y filas'];
  if (pf) {
    const m = /(\d+)\s+planillas,\s*(\d+)\s+compras:\s*(.*)/.exec(pf);
    c.planillas = Number(m[1]); c.compras = Number(m[2]); c.filasPorUnidad = pares(m[3]);
  }
  const pac = filas['Σ PAC'];
  if (pac) { c.pac = num(/\$([\d.]+)/.exec(pac)[1]); c.pacPorUnidad = pares(pac.split('(')[1] || ''); }
  const ea = Object.entries(filas).find(([k]) => /enero.agosto/.test(k));
  if (ea) c.eneAgo = num(/\$([\d.]+)/.exec(ea[1])[1]);
  const sd = Object.entries(filas).find(([k]) => /septiembre.diciembre/.test(k));
  if (sd) { c.sepDic = num(/\$([\d.]+)/.exec(sd[1])[1]); const o = /octubre\s+\$([\d.]+)/.exec(sd[1]); if (o) c.octubre = num(o[1]); }
  const inv = filas['Inversión C/D'];
  if (inv) { const m = /(\d+)\s+filas de ([A-Z ]+?) normalizadas/.exec(inv); c.invertidas = { unidad: m[2].trim(), n: Number(m[1]) }; }
  const tc = filas['Tipo de compra'];
  if (tc) { c.comraCorregidas = Number(/(\d+)\s+"COMRA/.exec(tc)[1]); c.sinTipo = Number(/(\d+)\s+filas sin tipo/.exec(tc)[1]); }
  const os = filas['Monto OC sin N° de OC'];
  if (os) { c.ocSinNumero = Number(/^(\d+)/.exec(os)[1]); c.ocSinNumeroPorUnidad = pares(os.split('(')[1] || ''); }
  const vo = filas['Varias OC por celda'];
  if (vo) { c.variasOC = Number(/^(\d+)/.exec(vo)[1]); c.variasOCPorUnidad = pares(vo.split('(')[1] || ''); }
  const nc = filas['Total que no cuadra'];
  if (nc) { const m = /^(\d+)\s+filas?:\s*([A-Z ]+?)\s+N°\s*(\d+)/.exec(nc); c.noCuadra = { n: Number(m[1]), unidad: m[2].trim(), nro: Number(m[3]) }; }
  const fr = filas.Frescura;
  if (fr) c.desactualizada = /^([A-Z ]+?)\s+marcada/.exec(fr)[1].trim();
  const sep = filas.SEP;
  if (sep) {
    c.sepItems = Number(/(\d+)\s+ítems/.exec(sep)[1]);
    c.sepPresupuestado = num(/presupuestado\s+\$([\d.]+)/.exec(sep)[1]);
    c.sepAdjudicado = num(/adjudicado\s+\$([\d.]+)/.exec(sep)[1]);
  }
  const vi = Object.entries(filas).find(([k]) => /^V[ií]nculo/.test(k));
  if (vi) { const m = /OC\s+(\S+)\s+detectada en SEP e ([A-Z ]+?),/.exec(vi[1]); if (m) c.vinculo = { oc: m[1], unidad: m[2].trim() }; }
  return c;
}

test('integración con planillas reales (VISOR_DATA_DIR)', { skip: !DIR && 'VISOR_DATA_DIR no definida' }, () => {
  assert.ok(existsSync(SPEC), `Falta ${SPEC}: los valores de control se leen de ahí`);
  const esp = leerControles(readFileSync(SPEC, 'utf8'));

  // Copia a un temporal: las planillas pueden estar abiertas en Excel y no se deben tocar.
  const tmp = mkdtempSync(join(tmpdir(), 'visor-'));
  try {
    const archivos = readdirSync(DIR).filter((n) => !n.startsWith('~$'));
    const unidades = archivos.filter((n) => PATRON_ARCHIVO_UNIDAD.test(n));
    const sepRuta = process.env.VISOR_SEP_FILE || (archivos.find((n) => PATRON_ARCHIVO_SEP.test(n)) && join(DIR, archivos.find((n) => PATRON_ARCHIVO_SEP.test(n))));
    const leer = (ruta) => { const t = join(tmp, basename(ruta)); copyFileSync(ruta, t); return XLSX.readFile(t); };

    const res = {};
    for (const n of unidades) {
      const ruta = join(DIR, n);
      res[n] = normalizarPlanilla(leer(ruta), n, { mesCorte: 8, fileModifiedAt: statSync(ruta).mtime, diasFrescura: 15 });
    }
    const R = Object.values(res);
    const porU = (fn) => Object.fromEntries(R.map((r) => [r.unidad, fn(r)]));
    const cnt = (r, cod) => r.advertencias.filter((a) => a.codigo === cod).length;
    const tot = (fn) => R.reduce((s, r) => s + fn(r), 0);

    const obt = {
      planillas: R.length,
      compras: tot((r) => r.filas.length),
      filasPorUnidad: porU((r) => r.filas.length),
      pac: tot((r) => r.resumen.montoPAC),
      pacPorUnidad: porU((r) => r.resumen.montoPAC),
      eneAgo: tot((r) => r.resumen.desgloseHastaCorte),
      sepDic: tot((r) => r.resumen.desglosePosterior),
      octubre: tot((r) => r.resumen.desglosePorMes.OCT),
      comraCorregidas: tot((r) => cnt(r, 'TIPO_CORREGIDO')),
      sinTipo: tot((r) => cnt(r, 'TIPO_VACIO')),
      ocSinNumero: tot((r) => cnt(r, 'OC_MONTO_SIN_NUMERO')),
      ocSinNumeroPorUnidad: Object.fromEntries(Object.entries(porU((r) => cnt(r, 'OC_MONTO_SIN_NUMERO'))).filter(([, v]) => v)),
      variasOC: tot((r) => cnt(r, 'OC_VARIAS')),
      variasOCPorUnidad: Object.fromEntries(Object.entries(porU((r) => cnt(r, 'OC_VARIAS'))).filter(([, v]) => v)),
      desactualizadas: R.filter((r) => cnt(r, 'PLANILLA_DESACTUALIZADA')).map((r) => r.unidad),
    };
    if (esp.invertidas) {
      const r = R.find((x) => x.unidad === esp.invertidas.unidad);
      obt.invertidas = r ? { unidad: r.unidad, n: r.filas.filter((f) => /^\d{2}$/.test(f.subtitulo || '')).length, invertidasDetectadas: cnt(r, 'SUBT_INVERTIDO') } : null;
    }
    const nc = R.flatMap((r) => r.advertencias.filter((a) => a.codigo === 'DESGLOSE_NO_CUADRA')
      .map((a) => ({ unidad: r.unidad, nro: r.filas.find((f) => f.fila === a.fila)?.nro })));
    obt.noCuadra = nc;

    let sep = null;
    if (sepRuta && existsSync(sepRuta)) {
      sep = normalizarSEP(leer(sepRuta), basename(sepRuta));
      obt.sepItems = sep.items.length;
      obt.sepPresupuestado = sep.resumen.montoPresupuestado;
      obt.sepAdjudicado = sep.resumen.montoAdjudicado;
      obt.sepEtapasSinREF = sep.items.every((i) => i.etapa !== undefined && i.etapa !== null);
      const bases = Object.fromEntries(R.map((r) => [r.slug, r]));
      obt.vinculos = detectarVinculos(sep.items, bases).map((v) => `${v.oc} → ${v.unidad}`);
    }

    // ---------- comparación
    const dif = [];
    const cmp = (nombre, e, o) => {
      const ok = JSON.stringify(e) === JSON.stringify(o);
      if (!ok) dif.push(nombre);
      console.log(`${ok ? '  OK ' : '  DIF'}  ${nombre}: esperado ${JSON.stringify(e)} · obtenido ${JSON.stringify(o)}`);
    };
    console.log('\nControles de la sección 12 (planillas al 24-09-2026):');
    cmp('Planillas', esp.planillas, obt.planillas);
    cmp('Compras', esp.compras, obt.compras);
    cmp('Filas por unidad', esp.filasPorUnidad, obt.filasPorUnidad);
    cmp('Σ PAC', esp.pac, obt.pac);
    cmp('PAC por unidad', esp.pacPorUnidad, obt.pacPorUnidad);
    cmp('Σ desglose ene–ago', esp.eneAgo, obt.eneAgo);
    cmp('Σ desglose sep–dic', esp.sepDic, obt.sepDic);
    cmp('Octubre', esp.octubre, obt.octubre);
    if (esp.invertidas) cmp(`Subtítulo 2 dígitos en ${esp.invertidas.unidad}`, esp.invertidas.n, obt.invertidas?.n);
    console.log(`       (filas con C/D invertidas detectadas: ${obt.invertidas?.invertidasDetectadas ?? '—'})`);
    cmp('COMRA ÁGIL corregidas', esp.comraCorregidas, obt.comraCorregidas);
    cmp('Filas sin tipo', esp.sinTipo, obt.sinTipo);
    cmp('Monto OC sin N° de OC', esp.ocSinNumero, obt.ocSinNumero);
    cmp('  por unidad', esp.ocSinNumeroPorUnidad, obt.ocSinNumeroPorUnidad);
    cmp('Varias OC por celda', esp.variasOC, obt.variasOC);
    cmp('  por unidad', esp.variasOCPorUnidad, obt.variasOCPorUnidad);
    cmp('Total que no cuadra', [{ unidad: esp.noCuadra.unidad, nro: esp.noCuadra.nro }], obt.noCuadra);
    cmp(`Frescura: ${esp.desactualizada} desactualizada`, true, obt.desactualizadas.includes(esp.desactualizada));
    console.log(`       (planillas sobre 15 días sin modificar hoy: ${obt.desactualizadas.join(', ') || 'ninguna'})`);
    if (sep) {
      cmp('SEP ítems', esp.sepItems, obt.sepItems);
      cmp('SEP Σ presupuestado', esp.sepPresupuestado, obt.sepPresupuestado);
      cmp('SEP Σ adjudicado', esp.sepAdjudicado, obt.sepAdjudicado);
      cmp('SEP etapa recalculada', true, obt.sepEtapasSinREF);
      cmp('Vínculo', true, obt.vinculos.includes(`${esp.vinculo.oc} → ${esp.vinculo.unidad}`));
    } else {
      console.log('  ---  SEP: no se encontró el Seguimiento SEP (defina VISOR_SEP_FILE); controles SEP omitidos');
    }
    console.log('');
    assert.deepEqual(dif, [], `Diferencias con los valores de control: ${dif.join(', ')}. ` +
      'Si las planillas cambiaron desde el 24-09-2026, informar estas diferencias; no ajustar la prueba.');
  } finally {
    rmSync(tmp, { recursive: true, force: true });
  }
});

test('lectura de la tabla de controles de la especificación', { skip: !existsSync(SPEC) && 'sin docs/privado' }, () => {
  const c = leerControles(readFileSync(SPEC, 'utf8'));
  for (const k of ['planillas', 'compras', 'pac', 'eneAgo', 'sepDic', 'octubre', 'comraCorregidas', 'sinTipo', 'ocSinNumero', 'variasOC', 'noCuadra', 'sepItems', 'vinculo']) {
    assert.ok(c[k] !== undefined, `No se pudo leer el control "${k}"`);
  }
  assert.equal(Object.keys(c.filasPorUnidad).length, c.planillas);
  assert.equal(Object.values(c.pacPorUnidad).reduce((a, b) => a + b, 0), c.pac);
  assert.equal(Object.values(c.filasPorUnidad).reduce((a, b) => a + b, 0), c.compras);
});
