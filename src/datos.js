// Estado de la app y acceso a Firestore: suscripciones en tiempo real y escrituras en lote
// (cada cambio va firmado y con su entrada en visor_historial, según las reglas).
import {
  doc, collection, onSnapshot, getDoc, getDocs, query, where, orderBy, limit,
  writeBatch, serverTimestamp,
} from 'https://www.gstatic.com/firebasejs/10.12.0/firebase-firestore.js';
import { db } from './firebase.js';
import { mezclarParametros } from './parametros-default.js';

export const estado = {
  user: null,
  email: null,
  nombre: null,
  rol: null,
  esAdmin: false,
  rolesDoc: null, // { usuarios: {...} } o null si no existe
  parametrosGuardados: null,
  parametros: mezclarParametros(null),
  bases: {},
  gestion: {},
  contactos: [],
  recientes: {}, // compraId → { por, t } cambios de otros usuarios
  sync: { conectado: navigator.onLine, pendientes: false, desdeCache: true },
  errores: [],
};

const oyentes = new Set();
let programado = null;
export function alCambiar(fn) { oyentes.add(fn); return () => oyentes.delete(fn); }
function notificar() {
  if (programado) return;
  programado = setTimeout(() => { programado = null; oyentes.forEach((f) => f()); }, 60);
}

const refRoles = () => doc(db, 'visor_config', 'roles');
const refParametros = () => doc(db, 'visor_config', 'parametros');
const firma = () => ({ updatedBy: estado.email, updatedAt: serverTimestamp() });

/** Lee el documento de roles. Devuelve 'sin-acceso' si las reglas lo impiden. */
export async function resolverRol(user) {
  estado.user = user;
  estado.email = user.email.toLowerCase();
  try {
    const s = await getDoc(refRoles());
    if (!s.exists()) {
      // Sin documento de roles solo los administradores (escritos en las reglas) pueden leer.
      estado.rolesDoc = null;
      estado.esAdmin = true;
      estado.rol = null;
      estado.nombre = user.email;
      return 'primer-ingreso';
    }
    aplicarRoles(s.data());
    // Si la lectura se permitió sin rol activo, las reglas lo reconocieron como administrador.
    if (!estado.rol) estado.esAdmin = true;
    return 'ok';
  } catch (e) {
    if (e.code === 'permission-denied') return 'sin-acceso';
    throw e;
  }
}

function aplicarRoles(data) {
  estado.rolesDoc = data;
  const u = (data.usuarios || {})[estado.email];
  const activo = u && u.activo === true;
  estado.rol = activo ? u.rol : null;
  estado.nombre = (u && u.nombre) || estado.email;
  // "admin" en el documento es solo una marca visual; lo que manda es la regla vIsAdmin().
  estado.esAdmin = !!(u && u.admin === true) || estado.esAdmin;
}

const subs = [];
export function iniciarSuscripciones() {
  detener();
  const err = (donde) => (e) => { estado.errores.push(`${donde}: ${e.message}`); notificar(); };
  subs.push(onSnapshot(refRoles(), (s) => { if (s.exists()) aplicarRoles(s.data()); notificar(); }, err('roles')));
  subs.push(onSnapshot(refParametros(), (s) => {
    estado.parametrosGuardados = s.exists() ? s.data() : null;
    estado.parametros = mezclarParametros(estado.parametrosGuardados);
    notificar();
  }, err('parámetros')));
  subs.push(onSnapshot(collection(db, 'visor_base'), { includeMetadataChanges: true }, (qs) => {
    estado.bases = Object.fromEntries(qs.docs.map((d) => [d.id, d.data()]));
    estado.sync.desdeCache = qs.metadata.fromCache;
    notificar();
  }, err('base')));
  subs.push(onSnapshot(collection(db, 'visor_gestion'), { includeMetadataChanges: true }, (qs) => {
    for (const ch of qs.docChanges()) {
      const d = ch.doc.data();
      if (ch.type === 'modified' && !ch.doc.metadata.hasPendingWrites && d.updatedBy && d.updatedBy !== estado.email) {
        estado.recientes[ch.doc.id] = { por: d.updatedBy, t: Date.now() };
      }
    }
    estado.gestion = Object.fromEntries(qs.docs.map((d) => [d.id, d.data()]));
    estado.sync.pendientes = qs.metadata.hasPendingWrites;
    estado.sync.desdeCache = qs.metadata.fromCache;
    notificar();
  }, err('gestión')));
  subs.push(onSnapshot(collection(db, 'visor_contactos'), (qs) => {
    estado.contactos = qs.docs.map((d) => ({ id: d.id, ...d.data() }));
    notificar();
  }, err('contactos')));
}
export function detener() { while (subs.length) subs.pop()(); }

window.addEventListener('online', () => { estado.sync.conectado = true; notificar(); });
window.addEventListener('offline', () => { estado.sync.conectado = false; notificar(); });

// ------------------------------------------------------------------ escrituras

const limpio = (v) => (v === undefined ? null : v);

/** Guarda campos de gestión del rol conectado, con su historial, en un solo lote. */
export async function guardarGestion(compraId, campos) {
  const previo = estado.gestion[compraId] || {};
  const b = writeBatch(db);
  const datos = { compraId, ...Object.fromEntries(Object.entries(campos).map(([k, v]) => [k, limpio(v)])), ...firma() };
  b.set(doc(db, 'visor_gestion', compraId), datos, { merge: true });
  for (const [campo, v] of Object.entries(campos)) {
    if (JSON.stringify(previo[campo] ?? null) === JSON.stringify(v ?? null)) continue;
    b.set(doc(collection(db, 'visor_historial')), {
      compraId, tipo: 'gestion', campo, antes: limpio(previo[campo]), despues: limpio(v),
      autor: estado.email, origen: 'visor', createdAt: serverTimestamp(),
    });
  }
  await b.commit();
}

/** Observación por rol: registro inmutable + última observación desnormalizada. */
export async function agregarObservacion(compraId, texto) {
  const rol = estado.rol;
  const b = writeBatch(db);
  b.set(doc(collection(db, 'visor_observaciones')), {
    compraId, rol, texto, autorEmail: estado.email, autorNombre: estado.nombre, createdAt: serverTimestamp(),
  });
  b.set(doc(db, 'visor_gestion', compraId), {
    compraId, [`obs_${rol}`]: { texto, autor: estado.email, fecha: serverTimestamp() }, ...firma(),
  }, { merge: true });
  await b.commit();
}

/** Contacto con proveedores (cualquier rol editor, a su nombre). */
export async function agregarContacto(compraId, datos) {
  const b = writeBatch(db);
  b.set(doc(collection(db, 'visor_contactos')), {
    compraId, rol: estado.rol, ...Object.fromEntries(Object.entries(datos).map(([k, v]) => [k, limpio(v)])),
    registradoPor: estado.email, createdAt: serverTimestamp(),
  });
  if (estado.rol === 'compras') {
    b.set(doc(db, 'visor_gestion', compraId), {
      compraId, compras_contactoRealizado: true, compras_fechaUltimoContacto: datos.fecha || null, ...firma(),
    }, { merge: true });
  }
  await b.commit();
}

/** Parámetros: reemplaza solo los campos indicados (mergeFields) y registra el cambio. */
export async function guardarParametros(campos) {
  const previo = estado.parametrosGuardados || {};
  const b = writeBatch(db);
  const datos = { ...campos, ...firma() };
  b.set(refParametros(), datos, { mergeFields: Object.keys(datos) });
  for (const [campo, v] of Object.entries(campos)) {
    b.set(doc(collection(db, 'visor_historial')), {
      compraId: null, tipo: 'config', campo: `parametros.${campo}`, antes: limpio(previo[campo]), despues: limpio(v),
      autor: estado.email, origen: 'visor', createdAt: serverTimestamp(),
    });
  }
  await b.commit();
}

/** Roles: reescribe el mapa completo (los correos tienen puntos; nunca rutas de texto). */
export async function guardarRoles(usuarios) {
  const b = writeBatch(db);
  b.set(refRoles(), { usuarios, updatedBy: estado.email, updatedAt: serverTimestamp() });
  b.set(doc(collection(db, 'visor_historial')), {
    compraId: null, tipo: 'config', campo: 'roles', antes: null,
    despues: { usuarios: Object.keys(usuarios).length }, autor: estado.email, origen: 'visor', createdAt: serverTimestamp(),
  });
  await b.commit();
}

/**
 * Importación: escribe cada planilla en visor_base/{slug} y sus entradas de historial.
 * @param {{slug, doc, historial: object[]}[]} lotes
 */
export async function escribirImportacion(lotes, origen = 'import-manual') {
  for (const l of lotes) {
    let b = writeBatch(db);
    let n = 0;
    b.set(doc(db, 'visor_base', l.slug), { ...l.doc, origen, syncedBy: estado.email, syncedAt: serverTimestamp() });
    n += 1;
    for (const h of l.historial) {
      if (n >= 450) { await b.commit(); b = writeBatch(db); n = 0; }
      b.set(doc(collection(db, 'visor_historial')), { ...h, autor: estado.email, origen, createdAt: serverTimestamp() });
      n += 1;
    }
    await b.commit();
  }
}

// ------------------------------------------------------------------ lecturas bajo demanda

export function escucharDetalle(compraId, fn) {
  const q1 = query(collection(db, 'visor_observaciones'), where('compraId', '==', compraId));
  const q2 = query(collection(db, 'visor_historial'), where('compraId', '==', compraId));
  const res = { obs: [], hist: [] };
  const orden = (a, b) => (b.createdAt?.seconds || Infinity) - (a.createdAt?.seconds || Infinity);
  const u1 = onSnapshot(q1, (qs) => { res.obs = qs.docs.map((d) => ({ id: d.id, ...d.data() })).sort(orden); fn(res); });
  const u2 = onSnapshot(q2, (qs) => { res.hist = qs.docs.map((d) => ({ id: d.id, ...d.data() })).sort(orden); fn(res); });
  return () => { u1(); u2(); };
}

export async function leerObservaciones(max = 500) {
  const qs = await getDocs(query(collection(db, 'visor_observaciones'), orderBy('createdAt', 'desc'), limit(max)));
  return qs.docs.map((d) => ({ id: d.id, ...d.data() }));
}

export async function leerHistorial(max = 500) {
  const qs = await getDocs(query(collection(db, 'visor_historial'), orderBy('createdAt', 'desc'), limit(max)));
  return qs.docs.map((d) => ({ id: d.id, ...d.data() }));
}

