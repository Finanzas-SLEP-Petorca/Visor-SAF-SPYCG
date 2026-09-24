// Vista por unidad requirente y Subdirección: avance, alertas, acciones y compromisos.
import { agregar, estadoPAC, accionesPorSubdireccion } from '../logica/motor.js';
import { esc, clp, pct, fecha } from '../formato.js';
import { semaforo, fuenteCifra } from '../ui.js';
import { encabezadoImpresion } from './exportar.js';

let unidadImprimir = null;

function tarjetaUnidad(u, ctx, acciones) {
  const compras = ctx.calc.filter((c) => c.unidad === u.clave);
  const est = {};
  for (const c of compras) est[estadoPAC(c.et.etapa)] = (est[estadoPAC(c.et.etapa)] || 0) + 1;
  const sem = {};
  for (const c of compras) sem[c.s.color] = (sem[c.s.color] || 0) + 1;
  const acuerdos = compras.filter((c) => c.g.direccion_acuerdo);
  const fr = Object.values(ctx.frescura).find((f) => f.unidad === u.clave);
  return `<div class="tarjeta" data-unidad="${esc(u.clave)}">
    <div class="fila"><h3 style="margin:0">${esc(u.clave)}</h3><div class="espacio"></div>
      <button class="chico no-imprimir" data-imprimir="${esc(u.clave)}">PDF de la unidad</button></div>
    <div class="small muted">${compras.length} compras · ${fr ? `planilla modificada el ${fecha(String(fr.fileModifiedAt).slice(0, 10))} (${fr.dias} días)` : ''}</div>
    <div class="grilla" style="margin-top:.5rem">
      <div><div class="small muted">PAC</div><b>${clp(u.pac)}</b></div>
      <div><div class="small muted">Devengado</div><b>${clp(u.real)}</b> (${pct(u.pac ? u.real / u.pac : NaN)})</div>
      <div><div class="small muted">Proyección probable</div><b>${clp(u.probable)}</b></div>
      <div><div class="small muted">En riesgo</div><b>${clp(u.riesgo)}</b></div>
    </div>
    <div class="barra-prog" style="margin:.5rem 0" title="Avance devengado"><div style="width:${Math.min(100, u.pac ? (100 * u.real) / u.pac : 0)}%"></div></div>
    <div class="small">${['Ejecutado', 'En curso', 'Pendiente', 'Desistido'].map((k) => `${k}: ${est[k] || 0}`).join(' · ')}</div>
    <div class="small" style="margin-top:.25rem">${['rojo', 'amarillo', 'verde', 'azul', 'gris'].filter((k) => sem[k]).map((k) => `${semaforo(k)} ${sem[k]}`).join(' ')}</div>
    <h4 style="margin-top:.75rem">Acciones requeridas</h4>
    ${acciones?.length ? `<ol class="small">${acciones.slice(0, 25).map((a) => `<li>${a.severidad === 'roja' ? '⛔' : '⚠'} ${esc(a.accion)} <span class="muted">(${esc(a.responsable || '')}${a.compraId ? ` · ${esc(a.compraId)}` : ''})</span></li>`).join('')}</ol>${acciones.length > 25 ? `<p class="small muted">… y ${acciones.length - 25} más.</p>` : ''}` : '<p class="small muted">Sin acciones pendientes.</p>'}
    <h4>Compromisos y acuerdos</h4>
    ${acuerdos.length ? `<table class="t"><thead><tr><th>Compra</th><th>Acuerdo</th><th>Responsable</th><th>Compromiso</th><th>Cumplido</th></tr></thead><tbody>${acuerdos.map((c) => `<tr><td>${esc(c.id)}</td><td>${esc(c.g.direccion_acuerdo)}</td><td>${esc(c.g.direccion_responsable || '')}</td><td>${fecha(c.g.direccion_fechaCompromiso)}</td><td>${c.g.direccion_cumplido ? 'Sí' : 'No'}</td></tr>`).join('')}</tbody></table>` : '<p class="small muted">Sin acuerdos registrados.</p>'}
  </div>`;
}

export function render(el, ctx) {
  const mapa = ctx.p.mapaSubdireccion || {};
  const porU = agregar(ctx.calc, (c) => c.unidad);
  const acciones = accionesPorSubdireccion(ctx.alertas, ctx.p);
  const accionesDe = (u) => acciones[mapa[u] || 'Sin asignar']?.[u] || [];
  const subdirs = {};
  for (const u of porU) (subdirs[mapa[u.clave] || 'Sin asignar'] ??= []).push(u);
  const transversales = Object.values(acciones).flatMap((x) => x.Transversal || []);
  el.innerHTML = `${encabezadoImpresion(ctx, unidadImprimir ? `Visor SAF/SPYCG — ${unidadImprimir}` : 'Visor SAF/SPYCG — Por unidad')}
  <h2 class="no-imprimir">Por unidad requirente y Subdirección</h2>
  <p class="small muted no-imprimir">Cada Subdirección responde por la planificación y oportunidad de sus requerimientos; SAF/SPYCG entregan información, alertas y plazos. El mapa unidad → Subdirección se edita en Parámetros.</p>
  ${Object.entries(subdirs).map(([s, us]) => {
    const t = us.reduce((a, u) => ({ pac: a.pac + u.pac, real: a.real + u.real, probable: a.probable + u.probable }), { pac: 0, real: 0, probable: 0 });
    return `<section class="pila" style="margin-bottom:1.5rem"><h3>Subdirección: ${esc(s)} <span class="small muted">PAC ${clp(t.pac)} · devengado ${clp(t.real)} · probable ${clp(t.probable)}</span></h3>
      <div class="grilla dos">${us.map((u) => tarjetaUnidad(u, ctx, accionesDe(u.clave))).join('')}</div></section>`;
  }).join('')}
  ${transversales.length ? `<div class="tarjeta"><h3>Acciones transversales</h3><ul class="small">${transversales.map((a) => `<li>${esc(a.mensaje)} → ${esc(a.accion)}</li>`).join('')}</ul></div>` : ''}
  ${fuenteCifra(ctx)}`;
  el.querySelectorAll('[data-imprimir]').forEach((b) => {
    b.onclick = () => {
      unidadImprimir = b.dataset.imprimir;
      render(el, ctx);
      const tarjeta = el.querySelector(`[data-unidad="${CSS.escape(unidadImprimir)}"]`);
      el.querySelectorAll('[data-unidad], section > h3, .tarjeta:not([data-unidad])').forEach((x) => { if (x !== tarjeta) x.classList.add('no-imprimir'); });
      window.print();
      unidadImprimir = null;
      render(el, ctx);
    };
  });
}
