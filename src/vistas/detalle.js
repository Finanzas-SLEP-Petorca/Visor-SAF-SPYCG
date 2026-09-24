// Diálogo de detalle de una compra: datos de la planilla, cálculos, gestión por rol,
// observaciones, contactos con proveedores e historial.
import { estado, guardarGestion, agregarObservacion, agregarContacto, escucharDetalle } from '../datos.js';
import { CAMPOS_ROL, FORMULARIOS, esEditor } from '../roles.js';
import { ROLES_OBS, ROLES } from '../parametros-default.js';
import { MESES } from '../util.js';
import { esc, clp, fecha, fechaHora, pct } from '../formato.js';
import { semaforo, etapa, opciones, toast, nombreRol } from '../ui.js';

const dlg = () => document.getElementById('detalle');
let abierto = null; // { id, desuscribir, extra }
let sucio = false; // hay cambios escritos sin guardar: no se redibuja para no perderlos
let ctxActual = null;

export function abrirDetalle(id, ctx) {
  cerrar();
  abierto = { id, extra: { obs: [], hist: [] }, desuscribir: null };
  sucio = false;
  ctxActual = ctx;
  abierto.desuscribir = escucharDetalle(id, (r) => { if (abierto?.id === id) { abierto.extra = r; refrescarDetalle(ctxActual); } });
  pintar(ctx);
  if (!dlg().open) dlg().showModal();
}

function cerrar() {
  if (abierto?.desuscribir) abierto.desuscribir();
  abierto = null;
}
dlg().addEventListener('close', cerrar);
dlg().addEventListener('input', () => { sucio = true; });
dlg().addEventListener('click', (e) => {
  const q = e.target.closest('[data-quitar-fuente]');
  if (q) q.closest('[data-fuente]').remove();
});

/** Se llama en cada cambio de estado; no redibuja si el usuario está escribiendo en el diálogo. */
export function refrescarDetalle(ctx) {
  ctxActual = ctx;
  if (!abierto || !dlg().open) return;
  if (sucio) { avisoPendiente(); return; }
  const act = document.activeElement;
  if (act && dlg().contains(act) && act.matches('input, select, textarea')) return;
  pintar(ctx, true);
}

function avisoPendiente() {
  const cab = dlg().querySelector('.cab');
  if (cab && !cab.querySelector('[data-pendiente]')) {
    cab.insertAdjacentHTML('beforeend', '<button class="chico" data-pendiente title="Hay datos nuevos de otros usuarios">Actualizar (descarta lo no guardado)</button>');
    cab.querySelector('[data-pendiente]').onclick = () => { sucio = false; pintar(ctxActual, true); };
  }
}

const nombreDe = (email) => estado.rolesDoc?.usuarios?.[email]?.nombre || email;

// ------------------------------------------------------------------ campos de formulario
function campoHTML(c, valor, editable, p) {
  const dis = editable ? '' : ' disabled';
  const id = `f-${c.k}`;
  switch (c.tipo) {
    case 'select': return `<label class="campo"><span>${esc(c.label)}</span><select id="${id}" data-k="${c.k}"${dis}>${opciones(c.opciones(p), valor)}</select></label>`;
    case 'number': return `<label class="campo"><span>${esc(c.label)}</span><input type="number" step="1" id="${id}" data-k="${c.k}" value="${valor ?? ''}"${dis}></label>`;
    case 'date': return `<label class="campo"><span>${esc(c.label)}</span><input type="date" id="${id}" data-k="${c.k}" value="${esc(valor ?? '')}"${dis}></label>`;
    case 'bool': return `<label class="campo"><span>${esc(c.label)}</span><select id="${id}" data-k="${c.k}"${dis}>${opciones([['true', 'Sí'], ['false', 'No']], valor === true ? 'true' : valor === false ? 'false' : '')}</select></label>`;
    case 'textarea': return `<label class="campo ancho"><span>${esc(c.label)}</span><textarea id="${id}" data-k="${c.k}"${dis}>${esc(valor ?? '')}</textarea></label>`;
    case 'ocs': return `<label class="campo"><span>${esc(c.label)}</span><input type="text" id="${id}" data-k="${c.k}" value="${esc((valor || []).join(', '))}"${dis}></label>`;
    case 'cdp': {
      const v = valor || {};
      return `<div class="campo ancho" data-k="${c.k}" data-tipo="cdp"><span class="small"><b>${esc(c.label)}</b></span><div class="fila">
        <input type="text" placeholder="Número" data-sub="numero" value="${esc(v.numero ?? '')}"${dis}>
        <input type="date" data-sub="fecha" value="${esc(v.fecha ?? '')}"${dis}>
        <input type="number" placeholder="Monto" data-sub="monto" value="${v.monto ?? ''}"${dis}></div></div>`;
    }
    case 'meses': {
      const v = valor || {};
      return `<div class="campo ancho" data-k="${c.k}" data-tipo="meses"><span class="small"><b>${esc(c.label)}</b></span><div class="form-grid" style="grid-template-columns:repeat(auto-fill,minmax(110px,1fr))">${
        MESES.map((m) => `<label class="campo"><span>${m}</span><input type="number" data-sub="${m}" value="${v[m] ?? ''}"${dis}></label>`).join('')}</div></div>`;
    }
    case 'fuentes': {
      const filas = (valor && valor.length ? valor : [{ fuente: '', monto: '' }]);
      const fila = (f) => `<div class="fila" data-fuente><select data-sub="fuente"${dis}>${opciones(p.listas.fuentes, f.fuente, 'Sin clasificar')}</select>
        <input type="number" placeholder="Monto" data-sub="monto" value="${f.monto ?? ''}"${dis}>${editable ? '<button type="button" class="chico peligro" data-quitar-fuente aria-label="Quitar fuente">✕</button>' : ''}</div>`;
      return `<div class="campo ancho" data-k="${c.k}" data-tipo="fuentes"><span class="small"><b>${esc(c.label)}</b> (varias si el contrato se financia con más de una)</span>
        <div data-lista-fuentes>${filas.map(fila).join('')}</div>${editable ? '<button type="button" class="chico" data-agregar-fuente>+ Agregar fuente</button>' : ''}
        <template data-plantilla-fuente>${fila({ fuente: '', monto: '' })}</template></div>`;
    }
    default: return `<label class="campo"><span>${esc(c.label)}</span><input type="text" id="${id}" data-k="${c.k}" value="${esc(valor ?? '')}"${dis}></label>`;
  }
}

function leerCampo(raiz, c) {
  const el = raiz.querySelector(`[data-k="${c.k}"]`);
  if (!el) return undefined;
  switch (c.tipo) {
    case 'number': return el.value === '' ? null : Math.round(Number(el.value));
    case 'bool': return el.value === '' ? null : el.value === 'true';
    case 'ocs': return el.value.split(/[,;\s]+/).map((s) => s.trim().toUpperCase()).filter(Boolean);
    case 'cdp': {
      const g = (s) => el.querySelector(`[data-sub="${s}"]`).value;
      if (!g('numero') && !g('fecha') && !g('monto')) return null;
      return { numero: g('numero') || null, fecha: g('fecha') || null, monto: g('monto') === '' ? null : Math.round(Number(g('monto'))) };
    }
    case 'meses': {
      const o = {};
      el.querySelectorAll('[data-sub]').forEach((i) => { if (i.value !== '') o[i.dataset.sub] = Math.round(Number(i.value)); });
      return Object.keys(o).length ? o : null;
    }
    case 'fuentes': {
      const out = [];
      el.querySelectorAll('[data-fuente]').forEach((f) => {
        const fuente = f.querySelector('[data-sub="fuente"]').value;
        const monto = f.querySelector('[data-sub="monto"]').value;
        if (fuente) out.push({ fuente, monto: monto === '' ? 0 : Math.round(Number(monto)) });
      });
      return out;
    }
    default: return el.value === '' ? null : el.value;
  }
}

// ------------------------------------------------------------------ pintado
function pintar(ctx, conservarScroll = false) {
  if (!abierto) return;
  const c = ctx.porId[abierto.id];
  const d = dlg();
  const scroll = d.scrollTop;
  if (!c) {
    d.innerHTML = `<div class="cab"><h2 id="detalle-titulo">${esc(abierto.id)}</h2><div class="espacio"></div><button data-cerrar>Cerrar</button></div><div class="cuerpo"><p>La compra ya no existe en la base.</p></div>`;
    d.querySelector('[data-cerrar]').onclick = () => d.close();
    return;
  }
  const p = ctx.p;
  const g = c.g;
  const rol = estado.rol;
  const b = c.base;
  const mc = p.mesCorte;
  const partes = [];

  partes.push(`<div class="cab"><div><h2 id="detalle-titulo" style="margin:0">${esc(c.id)} · ${esc(c.detalle || '')}</h2>
    <div class="small muted">${esc(c.unidad)} · Programa ${esc(c.programa || '—')} · Subt. ${esc(c.subtitulo || '—')} · Asig. ${esc(c.asignacion || '—')}</div></div>
    <div class="espacio"></div>${semaforo(c.s.color)} ${etapa(c.et)}<button data-cerrar>Cerrar</button></div><div class="cuerpo pila">`);

  // Alertas
  if (c.s.motivos.length || c.s.etiqueta || c.vinculo) {
    partes.push(`<div class="tarjeta"><h3>Alertas</h3><ul class="small">${c.s.motivos.map((m) => `<li>${m.nivel === 'rojo' ? '⛔' : '⚠'} ${esc(m.texto)}</li>`).join('')}
      ${c.s.etiqueta ? `<li><b>${esc(c.s.etiqueta)}</b></li>` : ''}
      ${c.vinculo ? `<li>🔗 Vinculada (${esc(c.vinculo.estado)}) ${c.origen === 'SEP' ? `con ${esc(c.vinculo.compraId)}, donde se controla el contrato` : `con el ítem SEP ${esc(c.vinculo.sepId)}`}${c.vinculo.oc ? ` por la OC ${esc(c.vinculo.oc)}` : ''}</li>` : ''}</ul></div>`);
  }

  // Montos, ventana y proyección
  partes.push(`<div class="grilla">
    <div class="tarjeta kpi"><div class="etq">${c.origen === 'SEP' ? 'Monto presupuestado' : 'PAC 2026'}</div><div class="val">${clp(c.m.pac)}</div><div class="det">Monto OC ${clp(c.montoOC)} · Adjudicado/OC anual ${clp(c.m.adjudicado)}</div></div>
    <div class="tarjeta kpi"><div class="etq">Devengado real</div><div class="val">${clp(c.m.real)}</div><div class="det">${c.m.fuenteReal === 'sigfe' ? 'SIGFE (Finanzas)' : 'según planilla'} · ${pct(c.m.pac ? c.m.real / c.m.pac : NaN)} del PAC</div></div>
    <div class="tarjeta kpi"><div class="etq">Ventana (${esc(c.v.modalidadNombre)})</div><div class="val">${fecha(c.v.fechaLimite)}</div>
      <div class="det">${c.v.aplica ? `Margen ${c.v.margen} días hábiles` : 'La etapa ya no depende de la ventana'} · ${c.v.diasTotales} días hábiles antes del corte ${fecha(p.fechaCorteDevengo)}${c.v.montoUTM !== null ? ` · ${Math.round(c.v.montoUTM).toLocaleString('es-CL')} UTM pendientes` : ''}
      ${c.v.ventanaAsignada ? `<br>Ventana asignada: ${esc(c.v.ventanaAsignada.nombre)} (hasta ${fecha(c.v.ventanaAsignada.fin)})` : ''}
      ${c.v.fechaEstimadaRequerimiento ? `<br>Requerimiento estimado: ${fecha(c.v.fechaEstimadaRequerimiento)}` : ''}</div></div>
    <div class="tarjeta kpi"><div class="etq">Proyección de cierre</div><div class="val">${clp(c.pr.probable)}</div>
      <div class="det">Conservador ${clp(c.pr.conservador)} · Planificado ${clp(c.pr.planificado)}<br>Situación: ${esc(c.pr.situacion)}${c.pr.condicionado ? ' · <b>condicionado a definición pendiente</b>' : ''}</div></div>
  </div>
  <details class="supuestos"><summary>Supuestos de este cálculo</summary><ul>
    <li>Real: ${c.m.fuenteReal === 'sigfe' ? 'devengado SIGFE registrado por Finanzas' : `suma del desglose de la planilla hasta el mes ${mc}`}.</li>
    <li>Etapa según ${esc(c.et.fuente)} (${esc(c.et.marca)}).</li>
    ${c.v.supuestos.map((s) => `<li>${esc(s)}</li>`).join('')}
    <li>Factores: conservador ${p.factores.conservador[c.pr.situacion]}, probable ${p.factores.probable[c.pr.situacion]}, planificado ${p.factores.planificado[c.pr.situacion]} sobre lo programado después del mes de corte.</li>
    <li>Duraciones referenciales por modalidad (validar con Compras).</li></ul></details>`);

  // Datos de la planilla
  if (c.origen === 'SEP') {
    partes.push(`<div class="tarjeta"><h3>Seguimiento SEP (lectura)</h3><div class="form-grid small">
      ${[['Modalidad', b.modalidad], ['ID Mercado Público', b.idMercadoPublico], ['Estado proceso', b.estadoCompra], ['Documento que formaliza', b.documentoFormaliza],
        ['OC', b.ocTexto], ['Monto adjudicado', clp(b.montoAdjudicado)], ['Estado ejecución', b.estadoEjecucion], ['Verificadores', b.verificadores],
        ['Visación UATP', 'visacionUATP' in b ? b.visacionUATP || 'Sin visación' : 'Columna no presente'], ['Devengado', clp(b.montoDevengado)], ['Pagado', clp(b.montoPagado)]]
        .map(([k, v]) => `<div><b>${esc(k)}</b><br>${esc(v ?? '—')}</div>`).join('')}</div>
      ${b.observaciones ? `<p class="small"><b>Observaciones:</b> ${esc(b.observaciones)}</p>` : ''}</div>`);
  } else {
    partes.push(`<div class="tarjeta"><h3>Planilla de la unidad (lectura; el Visor nunca la modifica)</h3>
      <div class="form-grid small">${[['Administrador contrato', b.adminContrato], ['Temporalidad', b.temporalidad], ['Tipo de compra', b.tipoCompra || 'Sin definir'],
        ['Tipo inferido de la OC', b.tipoCompraInferido], ['N° OC', b.ocNoAplica ? 'NO APLICA' : (b.ocs || []).join(', ') || '—'], ['ID cotización', b.idMercadoPublico], ['Valor OT', clp(b.valorOT)],
        ['% avance OT', pct(b.avanceOT)], ['Recepción conforme', clp(b.valorRecepcion)], ['Facturado = devengado', clp(b.devengadoPlanilla)],
        ['Pendiente OT', clp(b.pendienteOT)], ['Total desglose', clp(b.totalDesglose)], ['Fila en la planilla', b.fila]]
        .map(([k, v]) => `<div><b>${esc(k)}</b><br>${esc(v ?? '—')}</div>`).join('')}</div>
      <div class="tabla-wrap libre" style="margin-top:.6rem"><table class="t"><thead><tr>${MESES.map((m) => `<th class="num">${m}</th>`).join('')}</tr></thead>
      <tbody><tr>${MESES.map((m, i) => `<td class="num ${i < mc ? 'mes-real' : 'mes-proy'}">${clp(b.desglose[m])}</td>`).join('')}</tr></tbody></table></div>
      <div class="small muted">Azul: reportado por la unidad como ejecutado (hasta el mes ${mc}). Naranjo: proyectado.</div>
      ${b.seguimientos?.length ? `<h4 style="margin-top:.75rem">Seguimientos de la unidad</h4><div class="timeline">${b.seguimientos.map((s) => `<div>${s.fecha ? `<b>${esc(s.fecha)}</b> ` : ''}${esc(s.texto)}</div>`).join('')}</div>` : ''}
      ${b.estadoInferido ? `<p class="small">Estado sugerido desde observaciones: <b>${esc(b.estadoInferido)}</b> (inferido; Compras debe confirmarlo)</p>` : ''}
      ${b.advertencias?.length ? `<p class="small">Calidad: ${b.advertencias.map((a) => `<span class="tag alerta">${esc(a)}</span>`).join('')}</p>` : ''}</div>`);
  }

  // Gestión por rol
  const grupoDeRol = rol === 'subdirSAF' || rol === 'subdirSPYCG' ? 'direccion' : rol;
  partes.push('<div class="pila">');
  for (const f of FORMULARIOS) {
    const mio = f.grupo === grupoDeRol && esEditor(rol);
    const editables = mio ? f.campos.filter((x) => CAMPOS_ROL[rol].includes(x.k)) : [];
    partes.push(`<fieldset class="grupo${mio ? ' mio' : ''}" data-grupo="${f.grupo}"><legend>${esc(f.titulo)}${mio ? ' — sus campos' : ''}</legend>
      <div class="form-grid">${f.campos.map((x) => campoHTML(x, g[x.k], editables.includes(x), p)).join('')}</div>
      ${mio ? `<div class="fila" style="margin-top:.6rem"><button class="primario" data-guardar="${f.grupo}">Guardar ${esc(f.titulo)}</button>
        ${g.updatedBy ? `<span class="small muted">Última edición: ${esc(nombreDe(g.updatedBy))}, ${fechaHora(g.updatedAt)}</span>` : ''}</div>` : ''}</fieldset>`);
  }
  partes.push('</div>');

  // Observaciones por rol
  const obs = abierto.extra.obs;
  partes.push(`<div class="tarjeta"><h3>Observaciones por rol</h3><div class="obs-cols">${ROLES_OBS.map((r) => {
    const lista = obs.filter((o) => o.rol === r);
    const mia = r === rol;
    return `<div class="obs-col${mia ? ' mio' : ''}"><b>${esc(ROLES[r])}</b>
      ${mia ? `<textarea data-nueva-obs placeholder="Agregar observación (queda registrada con su nombre y no se puede borrar)" maxlength="4000"></textarea>
        <button class="chico primario" data-agregar-obs>Agregar</button>` : ''}
      ${lista.length ? lista.map((o) => `<div class="obs-item">${esc(o.texto)}<div class="autor">${esc(o.autorNombre || o.autorEmail)} · ${fechaHora(o.createdAt)}</div></div>`).join('') : '<div class="small muted">Sin observaciones</div>'}</div>`;
  }).join('')}</div></div>`);

  // Contactos con proveedores
  const contactos = ctx.estado.contactos.filter((x) => x.compraId === c.id).sort((a, b2) => (b2.createdAt?.seconds || 0) - (a.createdAt?.seconds || 0));
  partes.push(`<div class="tarjeta"><h3>Contacto con proveedores</h3>
    ${esEditor(rol) ? `<div class="form-grid" data-form-contacto>
      <label class="campo"><span>Fecha</span><input type="date" data-c="fecha" value="${ctx.hoy}"></label>
      <label class="campo"><span>Medio</span><select data-c="medio">${opciones(p.listas.mediosContacto, '')}</select></label>
      <label class="campo"><span>Proveedor</span><input type="text" data-c="proveedor"></label>
      <label class="campo"><span>RUT</span><input type="text" data-c="rut"></label>
      <label class="campo"><span>N° llamado</span><input type="number" data-c="nLlamado"></label>
      <label class="campo"><span>Resultado</span><input type="text" data-c="resultado"></label>
      <label class="campo ancho"><span>Próxima acción</span><input type="text" data-c="proximaAccion"></label>
      <div><button class="primario chico" data-agregar-contacto>Registrar contacto</button></div></div>` : ''}
    ${contactos.length ? `<div class="tabla-wrap libre" style="margin-top:.6rem"><table class="t"><thead><tr><th>Fecha</th><th>Medio</th><th>Proveedor</th><th>RUT</th><th>Llamado</th><th>Resultado</th><th>Próxima acción</th><th>Registró</th></tr></thead><tbody>${
      contactos.map((x) => `<tr><td>${fecha(x.fecha)}</td><td>${esc(x.medio)}</td><td>${esc(x.proveedor)}</td><td>${esc(x.rut)}</td><td>${esc(x.nLlamado)}</td><td>${esc(x.resultado)}</td><td>${esc(x.proximaAccion)}</td><td>${esc(nombreDe(x.registradoPor))} (${esc(nombreRol(x.rol))})</td></tr>`).join('')}</tbody></table></div>` : '<p class="small muted">Sin contactos registrados.</p>'}</div>`);

  // Historial
  const hist = abierto.extra.hist;
  partes.push(`<div class="tarjeta"><h3>Historial de esta compra</h3>${hist.length ? `<div class="tabla-wrap libre"><table class="t"><thead><tr><th>Fecha</th><th>Tipo</th><th>Campo</th><th>Antes</th><th>Después</th><th>Autor</th></tr></thead><tbody>${
    hist.slice(0, 200).map((h) => `<tr><td class="nowrap">${fechaHora(h.createdAt)}</td><td>${esc(h.tipo)}</td><td>${esc(h.campo)}</td><td>${esc(JSON.stringify(h.antes ?? null))}</td><td>${esc(JSON.stringify(h.despues ?? null))}</td><td>${esc(nombreDe(h.autor))}</td></tr>`).join('')}</tbody></table></div>` : '<p class="small muted">Sin cambios registrados.</p>'}</div>`);

  partes.push('</div>');
  d.innerHTML = partes.join('');
  if (conservarScroll) d.scrollTop = scroll;
  enlazar(d, c, ctx);
}

function enlazar(d, c, ctx) {
  d.querySelector('[data-cerrar]').onclick = () => d.close();
  d.querySelectorAll('[data-agregar-fuente]').forEach((btn) => {
    btn.onclick = () => {
      const cont = btn.closest('[data-tipo="fuentes"]');
      cont.querySelector('[data-lista-fuentes]').insertAdjacentHTML('beforeend', cont.querySelector('[data-plantilla-fuente]').innerHTML);
    };
  });
  d.querySelectorAll('[data-guardar]').forEach((btn) => {
    btn.onclick = async () => {
      const grupo = btn.dataset.guardar;
      const f = FORMULARIOS.find((x) => x.grupo === grupo);
      const fs = d.querySelector(`fieldset[data-grupo="${grupo}"]`);
      const cambios = {};
      for (const campo of f.campos) {
        if (!CAMPOS_ROL[estado.rol].includes(campo.k)) continue;
        const v = leerCampo(fs, campo);
        if (v === undefined) continue;
        if (JSON.stringify(v ?? null) !== JSON.stringify(c.g[campo.k] ?? null)) cambios[campo.k] = v;
      }
      if (!Object.keys(cambios).length) { sucio = false; return toast('No hay cambios que guardar.'); }
      btn.disabled = true;
      try {
        await guardarGestion(c.id, cambios);
        sucio = false;
        toast(`Guardado (${Object.keys(cambios).length} campo(s)).`);
      } catch (e) {
        toast(`No se pudo guardar: ${e.message}`, true);
      } finally { btn.disabled = false; }
    };
  });
  const btnObs = d.querySelector('[data-agregar-obs]');
  if (btnObs) {
    btnObs.onclick = async () => {
      const ta = d.querySelector('[data-nueva-obs]');
      const texto = ta.value.trim();
      if (!texto) return;
      btnObs.disabled = true;
      try { await agregarObservacion(c.id, texto); ta.value = ''; sucio = false; toast('Observación registrada.'); } catch (e) { toast(`Error: ${e.message}`, true); } finally { btnObs.disabled = false; }
    };
  }
  const btnC = d.querySelector('[data-agregar-contacto]');
  if (btnC) {
    btnC.onclick = async () => {
      const f = d.querySelector('[data-form-contacto]');
      const v = (k) => f.querySelector(`[data-c="${k}"]`).value.trim();
      const datos = { fecha: v('fecha') || null, medio: v('medio') || null, proveedor: v('proveedor') || null, rut: v('rut') || null,
        nLlamado: v('nLlamado') ? Number(v('nLlamado')) : null, resultado: v('resultado') || null, proximaAccion: v('proximaAccion') || null };
      if (!datos.medio) return toast('Indique el medio de contacto.', true);
      btnC.disabled = true;
      try { await agregarContacto(c.id, datos); sucio = false; toast('Contacto registrado.'); } catch (e) { toast(`Error: ${e.message}`, true); } finally { btnC.disabled = false; }
    };
  }
}
