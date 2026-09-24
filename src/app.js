// Punto de entrada: acceso, rol, suscripciones y enrutamiento de vistas.
import { enviarEnlace, completarEnlace, cerrarSesion, alCambiarSesion } from './firebase.js';
import { estado, resolverRol, iniciarSuscripciones, detener, alCambiar, guardarRoles } from './datos.js';
import { unificar, calcularTodo, generarAlertas, calcularFrescura } from './logica/motor.js';
import { hoyISO } from './logica/habiles.js';
import { esc, hace, aDate } from './formato.js';
import { nombreRol, toast } from './ui.js';
import { abrirDetalle, refrescarDetalle } from './vistas/detalle.js';
import * as resumen from './vistas/resumen.js';
import * as planilla from './vistas/planilla.js';
import * as fuentes from './vistas/fuentes.js';
import * as unidades from './vistas/unidades.js';
import * as calendario from './vistas/calendario.js';
import * as observaciones from './vistas/observaciones.js';
import * as proveedores from './vistas/proveedores.js';
import * as calidad from './vistas/calidad.js';
import * as parametros from './vistas/parametros.js';
import * as historial from './vistas/historial.js';

const VISTAS = { resumen, planilla, fuentes, unidades, calendario, observaciones, proveedores, calidad, parametros, historial };
const $ = (id) => document.getElementById(id);
const mostrar = (id) => ['acceso', 'primer-ingreso', 'app'].forEach((x) => $(x).classList.toggle('oculto', x !== id));

// ------------------------------------------------------------------ tema
const TEMA = 'visorTema';
function aplicarTema(t) {
  if (t) document.documentElement.dataset.theme = t; else delete document.documentElement.dataset.theme;
}
try { aplicarTema(localStorage.getItem(TEMA)); } catch { /* sin almacenamiento */ }
$('btn-tema').addEventListener('click', () => {
  const oscuro = document.documentElement.dataset.theme === 'dark'
    || (!document.documentElement.dataset.theme && matchMedia('(prefers-color-scheme: dark)').matches);
  const t = oscuro ? 'light' : 'dark';
  aplicarTema(t);
  try { localStorage.setItem(TEMA, t); } catch { /* */ }
});

// ------------------------------------------------------------------ acceso
function mensaje(id, txt, tipo = '') {
  const el = $(id);
  el.textContent = txt;
  el.className = `aviso ${tipo}`;
}
$('acceso-enviar').addEventListener('click', async () => {
  const email = $('acceso-email').value.trim().toLowerCase();
  if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)) return mensaje('acceso-msg', 'Ingrese un correo válido.', 'error');
  $('acceso-enviar').disabled = true;
  try {
    await enviarEnlace(email);
    mensaje('acceso-msg', `Enviamos un enlace de acceso a ${email}. Revise su bandeja (incluido Spam) y ábralo en este mismo navegador. El enlace expira en 1 hora.`, 'ok');
  } catch (e) {
    mensaje('acceso-msg', `No se pudo enviar el enlace: ${e.message}`, 'error');
  } finally {
    $('acceso-enviar').disabled = false;
  }
});
$('acceso-email').addEventListener('keydown', (e) => { if (e.key === 'Enter') $('acceso-enviar').click(); });
$('btn-salir').addEventListener('click', async () => { detener(); await cerrarSesion(); });

$('roles-crear').addEventListener('click', async () => {
  const f = $('roles-archivo').files[0];
  if (!f) return mensaje('roles-msg', 'Seleccione el archivo JSON de roles.', 'error');
  try {
    const data = JSON.parse(await f.text());
    const usuarios = data.usuarios || data;
    const validos = Object.entries(usuarios).every(([k, v]) => /@/.test(k) && v && typeof v.rol === 'string' && typeof v.activo === 'boolean');
    if (!validos) throw new Error('Formato esperado: { "usuarios": { "correo": { "rol", "nombre", "activo" } } }');
    const norm = Object.fromEntries(Object.entries(usuarios).map(([k, v]) => [k.trim().toLowerCase(), v]));
    await guardarRoles(norm);
    mensaje('roles-msg', 'Documento de roles creado. Cargando el Visor…', 'ok');
    setTimeout(() => location.reload(), 800);
  } catch (e) {
    mensaje('roles-msg', `Error: ${e.message}`, 'error');
  }
});

alCambiarSesion(async (user) => {
  if (!user) {
    detener();
    try {
      if (await completarEnlace()) return;
    } catch (e) {
      mensaje('acceso-msg', 'El enlace no es válido o expiró. Solicite uno nuevo.', 'error');
    }
    mostrar('acceso');
    return;
  }
  try {
    const r = await resolverRol(user);
    if (r === 'sin-acceso') {
      mostrar('acceso');
      $('acceso-form').classList.add('oculto');
      mensaje('acceso-msg', `El correo ${user.email} no tiene un rol activo en el Visor. Solicite acceso a la administración del Visor (Finanzas).`, 'error');
      await cerrarSesion();
      $('acceso-form').classList.remove('oculto');
      return;
    }
    if (r === 'primer-ingreso') { mostrar('primer-ingreso'); return; }
    mostrar('app');
    iniciarSuscripciones();
    render();
  } catch (e) {
    mostrar('acceso');
    mensaje('acceso-msg', `Error al cargar el Visor: ${e.message}`, 'error');
  }
});

// ------------------------------------------------------------------ cálculo compartido
let ctx = null;
function calcular() {
  const p = estado.parametros;
  const hoy = hoyISO();
  const frescura = calcularFrescura(estado.bases, hoy);
  const compras = unificar(estado.bases, estado.gestion, p);
  const calc = calcularTodo(compras, p, { hoy, frescura });
  const fechasMod = Object.values(estado.bases).map((b) => b.fileModifiedAt).filter(Boolean).sort();
  ctx = {
    estado, p, hoy, frescura, calc,
    porId: Object.fromEntries(calc.map((c) => [c.id, c])),
    alertas: generarAlertas(calc, p, { frescura }),
    corteBase: fechasMod.length ? String(fechasMod[fechasMod.length - 1]).slice(0, 10) : null,
    hayBaseSEP: !!estado.bases.SEP,
    abrirDetalle: (id) => abrirDetalle(id, ctx),
    rerender: () => render(true),
  };
  return ctx;
}

function cabecera() {
  $('cab-usuario').innerHTML = `Conectado como <b>${esc(estado.nombre)}</b> (${esc(nombreRol(estado.rol))}${estado.esAdmin ? ', administrador' : ''})`;
  const s = estado.sync;
  const el = $('cab-sync');
  el.className = `pill${!s.conectado ? ' off' : s.pendientes || s.desdeCache ? ' pend' : ''}`;
  el.lastElementChild.textContent = !s.conectado ? 'Sin conexión (cambios en cola)' : s.pendientes ? 'Guardando…' : s.desdeCache ? 'Sincronizando…' : 'Sincronizado';
  let ult = null;
  for (const g of Object.values(estado.gestion)) {
    const d = aDate(g.updatedAt);
    if (d && (!ult || d > ult.d)) ult = { d, por: g.updatedBy };
  }
  const nombre = (em) => estado.rolesDoc?.usuarios?.[em]?.nombre || em;
  $('cab-edicion').textContent = ult ? `Última edición por ${nombre(ult.por)}, ${hace(ult.d)}` : '';
}

// ------------------------------------------------------------------ enrutamiento
let vistaActual = null;
let pendiente = false;
function render(forzar = false) {
  if ($('app').classList.contains('oculto')) return;
  const el = $('vista');
  const act = document.activeElement;
  // No redibujar mientras se escribe en un campo de la vista (se redibuja al salir del campo).
  if (!forzar && act && el.contains(act) && act.matches('input, select, textarea')) { pendiente = true; return; }
  pendiente = false;
  calcular();
  cabecera();
  const nombre = (location.hash.slice(1) || 'resumen').split('?')[0];
  const v = VISTAS[nombre] || resumen;
  document.querySelectorAll('#pestanas a').forEach((a) => a.setAttribute('aria-current', a.getAttribute('href') === `#${nombre}` ? 'page' : 'false'));
  const cambio = vistaActual !== nombre;
  vistaActual = nombre;
  const scroll = el.querySelector('.tabla-wrap')?.scrollTop;
  try {
    v.render(el, ctx, { cambio });
  } catch (e) {
    console.error(e);
    el.innerHTML = `<div class="aviso error">Error al mostrar la vista: ${esc(e.message)}</div>`;
  }
  if (!cambio && scroll) { const w = el.querySelector('.tabla-wrap'); if (w) w.scrollTop = scroll; }
  refrescarDetalle(ctx);
}

$('vista').addEventListener('focusout', () => { if (pendiente) setTimeout(() => render(), 0); });
window.addEventListener('hashchange', () => render(true));
alCambiar(() => render());
window.addEventListener('error', (e) => toast(`Error: ${e.message}`, true));
window.addEventListener('unhandledrejection', (e) => toast(`Error: ${e.reason?.message || e.reason}`, true));
