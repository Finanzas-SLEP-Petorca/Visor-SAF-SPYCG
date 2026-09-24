#!/usr/bin/env node
// Agente local de sincronización (Fase 1b).
// Lee las planillas de VISOR_DATA_DIR (carpeta sincronizada de OneDrive), detecta cambios por
// fecha y tamaño, copia cada archivo a un temporal (nunca modifica ni mueve el original),
// lo normaliza con el mismo módulo del navegador y escribe en Firestore como el usuario técnico
// "sync". Solo imprime conteos: nunca datos de las planillas.
//
// Configuración en sync/.env (excluido de git):
//   VISOR_DATA_DIR=C:\Users\...\Monitoreo control de pagos y ejecucion 2026
//   VISOR_SYNC_EMAIL=...        (usuario técnico creado en Firebase Authentication)
//   VISOR_SYNC_PASSWORD=...
// Opciones: --forzar (reimporta todo aunque no haya cambios) · --simular (no escribe en Firestore)
import { readFileSync, writeFileSync, existsSync, mkdirSync, readdirSync, statSync, copyFileSync, rmSync, mkdtempSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { tmpdir } from 'node:os';
import { fileURLToPath } from 'node:url';
import * as XLSX from 'xlsx';
import { initializeApp } from 'firebase/app';
import { getAuth, signInWithEmailAndPassword, signOut, connectAuthEmulator } from 'firebase/auth';
import { getFirestore, doc, collection, writeBatch, serverTimestamp, terminate, connectFirestoreEmulator } from 'firebase/firestore';
import { firebaseConfig } from '../src/firebase-config.js';
import { prepararArchivo, clasificarArchivo } from '../src/importacion.js';
import { mezclarParametros } from '../src/parametros-default.js';
import { hoyISO } from '../src/logica/habiles.js';

const AQUI = dirname(fileURLToPath(import.meta.url));
const DIR_ESTADO = join(AQUI, '.estado');
const ARCH_ESTADO = join(DIR_ESTADO, 'estado.json');
const ARCH_CACHE = join(DIR_ESTADO, 'ultimo-base.json'); // datos internos: queda solo en este PC (gitignored)
const ARCH_LOCK = join(DIR_ESTADO, 'agente.lock');
const args = new Set(process.argv.slice(2));
const log = (...m) => console.log(`[${new Date().toISOString()}]`, ...m);

function cargarEnv() {
  for (const ruta of [join(AQUI, '.env'), join(AQUI, '..', '.env')]) {
    if (!existsSync(ruta)) continue;
    for (const linea of readFileSync(ruta, 'utf8').split(/\r?\n/)) {
      const m = /^\s*([A-Z_]+)\s*=\s*(.*?)\s*$/.exec(linea);
      if (m && !(m[1] in process.env)) process.env[m[1]] = m[2].replace(/^"(.*)"$/, '$1');
    }
  }
}
const leerJSON = (r, d) => { try { return JSON.parse(readFileSync(r, 'utf8')); } catch { return d; } };

async function main() {
  cargarEnv();
  const dir = process.env.VISOR_DATA_DIR;
  if (!dir || !existsSync(dir)) throw new Error('VISOR_DATA_DIR no está definida o no existe (revise sync/.env)');
  mkdirSync(DIR_ESTADO, { recursive: true });
  if (existsSync(ARCH_LOCK) && Date.now() - statSync(ARCH_LOCK).mtimeMs < 30 * 60000) { log('Otra ejecución en curso; se omite.'); return; }
  writeFileSync(ARCH_LOCK, String(process.pid));
  const tmp = mkdtempSync(join(tmpdir(), 'visor-agente-'));
  try {
    const estado = leerJSON(ARCH_ESTADO, {});
    const cache = leerJSON(ARCH_CACHE, {});
    const archivos = readdirSync(dir).filter((n) => clasificarArchivo(n) !== 'ignorado');
    const cambiados = archivos.filter((n) => {
      const st = statSync(join(dir, n));
      const prev = estado[n];
      return args.has('--forzar') || !prev || prev.mtimeMs !== st.mtimeMs || prev.size !== st.size;
    });
    log(`${archivos.length} planillas reconocidas; ${cambiados.length} con cambios.`);
    if (!cambiados.length) return;

    let db = null;
    let email = null;
    if (!args.has('--simular')) {
      email = process.env.VISOR_SYNC_EMAIL;
      if (!email || !process.env.VISOR_SYNC_PASSWORD) throw new Error('Faltan VISOR_SYNC_EMAIL / VISOR_SYNC_PASSWORD en sync/.env');
      const emu = process.env.VISOR_EMULADOR === '1'; // solo para pruebas locales
      const app = initializeApp(emu ? { ...firebaseConfig, projectId: 'demo-visor' } : firebaseConfig);
      if (emu) connectAuthEmulator(getAuth(app), 'http://127.0.0.1:9099', { disableWarnings: true });
      await signInWithEmailAndPassword(getAuth(app), email, process.env.VISOR_SYNC_PASSWORD);
      db = getFirestore(app);
      if (emu) connectFirestoreEmulator(db, '127.0.0.1', 8080);
    }
    const p = mezclarParametros(null);
    const hoy = hoyISO();
    for (const n of cambiados) {
      const ruta = join(dir, n);
      const st = statSync(ruta);
      try {
        const copia = join(tmp, `${Date.now()}-${n}`);
        copyFileSync(ruta, copia); // el original puede estar abierto en Excel: se lee la copia
        const libro = XLSX.read(readFileSync(copia), { type: 'buffer' });
        const r = await prepararArchivo({ nombre: n, lastModified: st.mtime, libro }, cache, p, hoy);
        if (r.sinCambios) {
          log(`${r.unidad}: contenido sin cambios (${Object.keys(r.doc.filas).length} filas).`);
        } else if (db) {
          let b = writeBatch(db);
          let ops = 1;
          b.set(doc(db, 'visor_base', r.slug), { ...r.doc, origen: 'agente-local', syncedBy: email, syncedAt: serverTimestamp() });
          for (const h of r.historial) {
            if (ops >= 450) { await b.commit(); b = writeBatch(db); ops = 0; }
            b.set(doc(collection(db, 'visor_historial')), { ...h, autor: email, origen: 'agente-local', createdAt: serverTimestamp() });
            ops += 1;
          }
          await b.commit();
          log(`${r.unidad}: ${Object.keys(r.doc.filas).length} filas · nuevas ${r.conc.nuevos.length} · desaparecidas ${r.conc.desaparecidos.length} · modificadas ${r.conc.modificados.length} · advertencias ${r.advertencias.length}.`);
        } else {
          log(`[simulación] ${r.unidad}: ${Object.keys(r.doc.filas).length} filas · nuevas ${r.conc.nuevos.length} · modificadas ${r.conc.modificados.length} · advertencias ${r.advertencias.length}.`);
        }
        if (db) {
          cache[r.slug] = { filas: r.doc.filas, hash: r.doc.hash };
          estado[n] = { mtimeMs: st.mtimeMs, size: st.size };
        }
      } catch (e) {
        log(`${n}: ERROR ${e.message}`);
        process.exitCode = 1;
      }
    }
    if (db) {
      writeFileSync(ARCH_CACHE, JSON.stringify(cache));
      writeFileSync(ARCH_ESTADO, JSON.stringify(estado, null, 1));
    }
    if (db) { await signOut(getAuth()); await terminate(db); }
  } finally {
    rmSync(tmp, { recursive: true, force: true });
    rmSync(ARCH_LOCK, { force: true });
  }
}

main().catch((e) => { log(`ERROR ${e.message}`); process.exitCode = 1; }).finally(() => setTimeout(() => process.exit(), 500));
