// Parámetros: fechas, duraciones, factores, UTM, feriados, listas, ventanas, mapa unidad → Subdirección,
// usuarios y roles, y respaldo. Cada sección se edita solo con el rol que las reglas permiten.
import { estado, guardarParametros, guardarRoles, leerObservaciones } from '../datos.js';
import { MODALIDADES, ROLES } from '../parametros-default.js';
import { esc, fecha } from '../formato.js';
import { opciones, toast, descargar } from '../ui.js';

const MESES_N = ['enero', 'febrero', 'marzo', 'abril', 'mayo', 'junio', 'julio', 'agosto', 'septiembre', 'octubre', 'noviembre', 'diciembre'];
const SIT = { ejecucion: 'Etapa 3–4 o etapa 2 con OC', adjudicadaSinOC: 'Etapa 2 adjudicada sin OC', publicada: 'Etapa 1 publicada / en evaluación, en ventana',
  bases: 'Etapa 1 elaboración de bases, en ventana', planificada: 'Etapa 0 en ventana', fueraVentana: 'Etapa 0–1 fuera de ventana', desistida: 'Desistida' };

let usuariosEdit = null;

const seccion = (titulo, editable, cuerpo, id, quien) => `<fieldset class="grupo${editable ? ' mio' : ''}" data-sec="${id}"><legend>${esc(titulo)}</legend>
  ${cuerpo}${editable ? `<div class="fila" style="margin-top:.6rem"><button class="primario" data-guardar-sec="${id}">Guardar</button></div>` : `<p class="small muted">Edita: ${esc(quien)}.</p>`}</fieldset>`;

export function render(el, ctx) {
  const p = ctx.p;
  const admin = estado.esAdmin;
  const rol = estado.rol;
  const dis = (ok) => (ok ? '' : ' disabled');
  const puedeFin = admin || rol === 'finanzas';
  const puedeCom = admin || rol === 'compras';
  const unidades = [...new Set(Object.values(ctx.estado.bases).map((b) => b.unidad).filter((u) => u !== 'SEP'))].sort();
  if (!usuariosEdit) usuariosEdit = Object.entries(ctx.estado.rolesDoc?.usuarios || {}).map(([email, u]) => ({ email, ...u }));

  const s1 = `<div class="form-grid">
    <label class="campo"><span>Fecha de corte de devengo</span><input type="date" data-p="fechaCorteDevengo" value="${esc(p.fechaCorteDevengo)}"${dis(puedeFin)}></label>
    <label class="campo"><span>Mes de corte (real hasta)</span><select data-p="mesCorte"${dis(puedeFin)}>${opciones(MESES_N.map((m, i) => [i + 1, m]), p.mesCorte, null)}</select></label>
    <label class="campo"><span>Valor UTM ($)</span><input type="number" data-p="valorUTM" value="${p.valorUTM ?? ''}" placeholder="Obligatorio"${dis(puedeFin)}></label>
    <label class="campo ancho"><span>Feriados (uno por línea, dd-mm-aaaa)</span><textarea data-p="feriados"${dis(puedeFin)}>${esc((p.feriados || []).map(fecha).join('\n'))}</textarea></label></div>
    <h4>Hitos</h4><table class="t" data-tabla="hitos"><thead><tr><th>Fecha</th><th>Hito</th><th>Responsable</th><th></th></tr></thead><tbody>
    ${(p.hitos || []).map((h) => `<tr data-id="${esc(h.id)}"><td><input type="date" data-c="fecha" value="${esc(h.fecha)}"${dis(puedeFin)}></td><td><input data-c="nombre" value="${esc(h.nombre)}" style="width:100%"${dis(puedeFin)}></td><td><input data-c="responsable" value="${esc(h.responsable || '')}"${dis(puedeFin)}></td><td>${puedeFin ? '<button class="chico peligro" data-quitar>✕</button>' : ''}</td></tr>`).join('')}
    </tbody></table>${puedeFin ? '<button class="chico" data-agregar="hitos">+ Hito</button>' : ''}`;

  const s2 = `<table class="t"><thead><tr><th>Modalidad</th><th class="num">Duración (días háb.)</th><th class="num">Plazo de entrega por defecto</th></tr></thead><tbody>
    ${MODALIDADES.map((m) => `<tr><td>${esc(m.nombre)}</td><td class="num"><input type="number" data-dur="${m.key}" data-c="dias" value="${p.duraciones[m.key]?.dias ?? ''}" style="width:6em"${dis(puedeCom)}></td>
      <td class="num"><input type="number" data-dur="${m.key}" data-c="entrega" value="${p.duraciones[m.key]?.entrega ?? ''}" style="width:6em"${dis(puedeCom)}></td></tr>`).join('')}
    </tbody></table>
    <div class="form-grid" style="margin-top:.5rem">
      <label class="campo"><span>Límite compra ágil (UTM)</span><input type="number" data-dur="compraAgil" data-c="limiteUTM" value="${p.duraciones.compraAgil.limiteUTM ?? ''}"${dis(puedeCom)}></label>
      <label class="campo"><span>Recepción y devengo (días háb.)</span><input type="number" data-dur="recepcionDevengo" data-c="dias" value="${p.duraciones.recepcionDevengo?.dias ?? 5}"${dis(puedeCom)}></label></div>
    <p class="small muted">Valores referenciales: Compras debe validarlos contra el reglamento vigente de la Ley 19.886 modificada por la Ley 21.634.</p>
    <h4>Ventanas institucionales</h4><table class="t" data-tabla="ventanas"><thead><tr><th>ID</th><th>Nombre</th><th>Termina</th><th></th></tr></thead><tbody>
    ${(p.ventanas || []).map((v) => `<tr><td><input data-c="id" value="${esc(v.id)}" style="width:8em"${dis(puedeCom)}></td><td><input data-c="nombre" value="${esc(v.nombre)}" style="width:100%"${dis(puedeCom)}></td><td><input type="date" data-c="fin" value="${esc(v.fin)}"${dis(puedeCom)}></td><td>${puedeCom ? '<button class="chico peligro" data-quitar>✕</button>' : ''}</td></tr>`).join('')}
    </tbody></table>${puedeCom ? '<button class="chico" data-agregar="ventanas">+ Ventana</button>' : ''}`;

  const s3 = `<table class="t"><thead><tr><th>Situación</th><th class="num">Conservador</th><th class="num">Probable</th><th class="num">Planificado</th></tr></thead><tbody>
    ${Object.entries(SIT).map(([k, t]) => `<tr><td>${esc(t)}</td>${['conservador', 'probable', 'planificado'].map((e) => `<td class="num"><input type="number" step="0.05" min="0" max="1" data-fac="${e}" data-k="${k}" value="${p.factores[e][k]}" style="width:5em"${dis(admin)}></td>`).join('')}</tr>`).join('')}
    </tbody></table>
    <div class="form-grid" style="margin-top:.5rem">
      <label class="campo"><span>Umbral amarillo (días háb.)</span><input type="number" data-p="umbralAmarillo" value="${p.umbralAmarillo}"${dis(admin)}></label>
      <label class="campo"><span>Días de frescura</span><input type="number" data-p="diasFrescura" value="${p.diasFrescura}"${dis(admin)}></label>
      <label class="campo"><span>Procesos por semana (cuello de botella)</span><input type="number" data-p="umbralProcesosSemana" value="${p.umbralProcesosSemana}"${dis(admin)}></label>
      <label class="campo"><span>Similitud mínima de detalle (conciliación)</span><input type="number" step="0.05" data-p="umbralSimilitud" value="${p.umbralSimilitud}"${dis(admin)}></label></div>`;

  const s4 = `<div class="form-grid">${Object.entries({ fuentes: 'Fuentes o subvenciones', mediosContacto: 'Medios de contacto', definicionesPendientes: 'Definiciones pendientes', subdirecciones: 'Subdirecciones' })
    .map(([k, t]) => `<label class="campo"><span>${esc(t)} (una por línea)</span><textarea data-lista="${k}" rows="6"${dis(admin)}>${esc((p.listas[k] || []).join('\n'))}</textarea></label>`).join('')}</div>`;

  const s5 = unidades.length ? `<div class="form-grid">${unidades.map((u) => `<label class="campo"><span>${esc(u)}</span><select data-mapa="${esc(u)}"${dis(admin)}>${opciones(p.listas.subdirecciones, p.mapaSubdireccion?.[u], 'Sin asignar')}</select></label>`).join('')}</div>`
    : '<p class="small muted">Importe las planillas para asignar unidades.</p>';

  const s6 = admin ? `<p class="small">Los administradores están escritos en las reglas de Firestore. Aquí se asignan los demás roles; la marca "admin" es solo visual.</p>
    <div class="tabla-wrap libre"><table class="t" data-tabla="usuarios"><thead><tr><th>Correo</th><th>Nombre</th><th>Rol</th><th>Activo</th><th>Admin (visual)</th><th></th></tr></thead><tbody>
    ${usuariosEdit.map((u, i) => `<tr data-i="${i}"><td><input data-u="email" value="${esc(u.email)}" style="width:17em"></td><td><input data-u="nombre" value="${esc(u.nombre || '')}"></td>
      <td><select data-u="rol">${opciones(Object.entries(ROLES), u.rol, null)}</select></td><td><input type="checkbox" data-u="activo"${u.activo ? ' checked' : ''} aria-label="Activo"></td>
      <td><input type="checkbox" data-u="admin"${u.admin ? ' checked' : ''} aria-label="Admin"></td><td><button class="chico peligro" data-quitar-u="${i}">✕</button></td></tr>`).join('')}
    </tbody></table></div><div class="fila" style="margin-top:.5rem"><button class="chico" id="u-agregar">+ Usuario</button><button class="primario" id="u-guardar">Guardar usuarios y roles</button>
    <button class="chico" id="u-exportar">Exportar JSON</button><label class="btn chico">Importar JSON<input type="file" id="u-importar" accept=".json" class="oculto"></label></div>`
    : `<p class="small">Su rol: <b>${esc(ROLES[rol] || rol)}</b>. La administración asigna los roles.</p>`;

  const s7 = `<p class="small">Descarga un JSON con la capa de gestión, las observaciones, los contactos y los parámetros. El archivo contiene datos internos: guárdelo solo en carpetas institucionales, nunca en el repositorio.</p>
    <button id="respaldo">Exportar respaldo JSON</button>`;

  el.innerHTML = `<h2>Parámetros</h2><div class="pila">
    ${seccion('Calendario de cierre y UTM', puedeFin, s1, 's1', 'Finanzas o administración')}
    ${seccion('Duraciones por modalidad y ventanas', puedeCom, s2, 's2', 'Compras o administración')}
    ${seccion('Proyección y semáforo', admin, s3, 's3', 'administración')}
    ${seccion('Listas', admin, s4, 's4', 'administración')}
    ${seccion('Mapa unidad → Subdirección', admin, s5, 's5', 'administración')}
    <fieldset class="grupo${admin ? ' mio' : ''}"><legend>Usuarios y roles</legend>${s6}</fieldset>
    <fieldset class="grupo"><legend>Respaldo</legend>${s7}</fieldset>
    ${p.updatedBy ? `<p class="small muted">Última modificación de parámetros por ${esc(p.updatedBy)}.</p>` : ''}</div>`;

  // ---- filas agregables/quitables
  el.querySelectorAll('[data-agregar]').forEach((b) => {
    b.onclick = () => {
      const t = el.querySelector(`[data-tabla="${b.dataset.agregar}"] tbody`);
      t.insertAdjacentHTML('beforeend', b.dataset.agregar === 'hitos'
        ? `<tr data-id="h-${Date.now()}"><td><input type="date" data-c="fecha"></td><td><input data-c="nombre" style="width:100%"></td><td><input data-c="responsable"></td><td><button class="chico peligro" data-quitar>✕</button></td></tr>`
        : `<tr><td><input data-c="id" value="v-${Date.now().toString(36)}" style="width:8em"></td><td><input data-c="nombre" style="width:100%"></td><td><input type="date" data-c="fin"></td><td><button class="chico peligro" data-quitar>✕</button></td></tr>`);
    };
  });
  el.onclick = (e) => { const q = e.target.closest('[data-quitar]'); if (q) q.closest('tr').remove(); };

  const val = (sel) => el.querySelector(sel)?.value;
  const leerTabla = (nombre, campos) => [...el.querySelectorAll(`[data-tabla="${nombre}"] tbody tr`)].map((tr) => {
    const o = tr.dataset.id ? { id: tr.dataset.id } : {};
    for (const c of campos) o[c] = tr.querySelector(`[data-c="${c}"]`).value.trim();
    return o;
  });
  const isoDe = (s) => { const m = /^(\d{2})-(\d{2})-(\d{4})$/.exec(s.trim()); return m ? `${m[3]}-${m[2]}-${m[1]}` : /^\d{4}-\d{2}-\d{2}$/.test(s.trim()) ? s.trim() : null; };
  const numOr = (v, d) => (v === '' || v === undefined ? d : Number(v));

  const guardar = {
    s1: () => {
      const feriados = val('[data-p="feriados"]').split(/\n+/).map(isoDe).filter(Boolean);
      const hitos = leerTabla('hitos', ['fecha', 'nombre', 'responsable']).filter((h) => h.fecha && h.nombre);
      const utm = val('[data-p="valorUTM"]');
      return { fechaCorteDevengo: val('[data-p="fechaCorteDevengo"]'), mesCorte: Number(val('[data-p="mesCorte"]')), valorUTM: utm === '' ? null : Number(utm), feriados, hitos };
    },
    s2: () => {
      const dur = structuredClone(p.duraciones);
      el.querySelectorAll('[data-dur]').forEach((i) => { dur[i.dataset.dur] ??= {}; dur[i.dataset.dur][i.dataset.c] = numOr(i.value, null); });
      const ventanas = leerTabla('ventanas', ['id', 'nombre', 'fin']).filter((v) => v.id && v.fin);
      return { duraciones: dur, ventanas };
    },
    s3: () => {
      const factores = structuredClone(p.factores);
      el.querySelectorAll('[data-fac]').forEach((i) => { factores[i.dataset.fac][i.dataset.k] = Math.max(0, Math.min(1, Number(i.value) || 0)); });
      const n = (k) => Number(val(`[data-p="${k}"]`));
      return { factores, umbralAmarillo: n('umbralAmarillo'), diasFrescura: n('diasFrescura'), umbralProcesosSemana: n('umbralProcesosSemana'), umbralSimilitud: n('umbralSimilitud') };
    },
    s4: () => {
      const listas = structuredClone(p.listas);
      el.querySelectorAll('[data-lista]').forEach((t) => { listas[t.dataset.lista] = t.value.split('\n').map((s) => s.trim()).filter(Boolean); });
      return { listas };
    },
    s5: () => {
      const mapa = {};
      el.querySelectorAll('[data-mapa]').forEach((s) => { if (s.value) mapa[s.dataset.mapa] = s.value; });
      return { mapaSubdireccion: mapa };
    },
  };
  el.querySelectorAll('[data-guardar-sec]').forEach((b) => {
    b.onclick = async () => {
      b.disabled = true;
      try { await guardarParametros(guardar[b.dataset.guardarSec]()); toast('Parámetros guardados.'); } catch (e) { toast(`No se pudo guardar: ${e.message}`, true); } finally { b.disabled = false; }
    };
  });

  // ---- usuarios y roles
  if (admin) {
    const leerUsuarios = () => [...el.querySelectorAll('[data-tabla="usuarios"] tbody tr')].map((tr) => ({
      email: tr.querySelector('[data-u="email"]').value.trim().toLowerCase(), nombre: tr.querySelector('[data-u="nombre"]').value.trim(),
      rol: tr.querySelector('[data-u="rol"]').value, activo: tr.querySelector('[data-u="activo"]').checked, admin: tr.querySelector('[data-u="admin"]').checked,
    }));
    el.querySelector('#u-agregar').onclick = () => { usuariosEdit = [...leerUsuarios(), { email: '', nombre: '', rol: 'lectura', activo: true }]; render(el, ctx); };
    el.querySelectorAll('[data-quitar-u]').forEach((b) => { b.onclick = () => { const l = leerUsuarios(); l.splice(Number(b.dataset.quitarU), 1); usuariosEdit = l; render(el, ctx); }; });
    el.querySelector('#u-guardar').onclick = async () => {
      const l = leerUsuarios().filter((u) => u.email);
      if (l.some((u) => !/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(u.email))) return toast('Hay correos inválidos.', true);
      const usuarios = Object.fromEntries(l.map((u) => [u.email, { rol: u.rol, nombre: u.nombre || u.email, activo: u.activo, ...(u.admin ? { admin: true } : {}) }]));
      try { await guardarRoles(usuarios); usuariosEdit = null; toast('Usuarios y roles guardados.'); } catch (e) { toast(`No se pudo guardar: ${e.message}`, true); }
    };
    el.querySelector('#u-exportar').onclick = () => descargar('roles.json', JSON.stringify({ usuarios: ctx.estado.rolesDoc?.usuarios || {} }, null, 2), 'application/json');
    el.querySelector('#u-importar').onchange = async (e) => {
      try {
        const d = JSON.parse(await e.target.files[0].text());
        usuariosEdit = Object.entries(d.usuarios || d).map(([email, u]) => ({ email, ...u }));
        render(el, ctx);
        toast('Revise la tabla y presione "Guardar usuarios y roles".');
      } catch (err) { toast(`JSON inválido: ${err.message}`, true); }
    };
  }
  el.querySelector('#respaldo').onclick = async () => {
    try {
      const obs = await leerObservaciones(10000);
      const datos = { exportadoPor: estado.email, exportadoEl: new Date().toISOString(), parametros: ctx.estado.parametrosGuardados, gestion: ctx.estado.gestion, observaciones: obs, contactos: ctx.estado.contactos };
      descargar(`respaldo-visor-${ctx.hoy}.json`, JSON.stringify(datos, null, 1), 'application/json');
    } catch (e) { toast(e.message, true); }
  };
}
