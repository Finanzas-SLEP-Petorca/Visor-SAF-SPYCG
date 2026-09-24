// Vista por subvención o fuente, con pestaña SEP (formato del Seguimiento SEP y vínculos).
import { estado, guardarParametros } from '../datos.js';
import { agregar, repartirPorFuente, calcularVinculos, ETAPAS } from '../logica/motor.js';
import { similitud } from '../util.js';
import { esc, clp, pct } from '../formato.js';
import { semaforo, etapa, toast, fuenteCifra } from '../ui.js';

let pestana = 'fuentes';
let fuenteSel = null;

const FASES = { 0: 'Identificación / PME', 1: 'Proceso de compra', 2: 'Formalización', 3: 'Ejecución', 4: 'Ejecución (cerrada)', X: 'Desistida' };

export function render(el, ctx) {
  el.innerHTML = `<div class="subpestanas no-imprimir" role="tablist">
    <button aria-pressed="${pestana === 'fuentes'}" data-p="fuentes">Por fuente</button>
    <button aria-pressed="${pestana === 'sep'}" data-p="sep">SEP</button></div><div id="fx"></div>`;
  el.querySelectorAll('[data-p]').forEach((b) => { b.onclick = () => { pestana = b.dataset.p; render(el, ctx); }; });
  const cont = el.querySelector('#fx');
  if (pestana === 'sep') renderSEP(cont, ctx); else renderFuentes(cont, ctx);
}

function renderFuentes(el, ctx) {
  const grupos = agregar(ctx.calc, 'fuente');
  const sel = fuenteSel && grupos.find((g) => g.clave === fuenteSel) ? fuenteSel : null;
  const compras = sel ? ctx.calc.filter((c) => c.enTotales && sel in repartirPorFuente(c, 1)) : [];
  el.innerHTML = `<h2>Por subvención o fuente</h2>
  <p class="small muted">La fuente la registran las Subdirecciones en cada compra; un contrato con varias fuentes se reparte según los montos indicados. Mientras nadie la defina, la compra queda en "Sin clasificar".</p>
  <div class="grilla">${grupos.map((g) => `<button class="tarjeta kpi" style="text-align:left" data-fuente="${esc(g.clave)}" aria-pressed="${g.clave === sel}">
    <div class="etq">${esc(g.clave)} · ${Math.round(g.n)} compras</div><div class="val">${clp(g.pac)}</div>
    <div class="det">Adjudicado ${clp(g.adjudicado)} · Devengado ${clp(g.real)}<br>Proyectado (probable) ${clp(g.probable)} · En riesgo ${clp(g.riesgo)}${g.condicionado ? `<br>Condicionado ${clp(g.condicionado)}` : ''}</div></button>`).join('')}</div>
  ${fuenteCifra(ctx)}
  ${sel ? `<div class="tarjeta" style="margin-top:1rem"><h3>${esc(sel)}: ${compras.length} compras</h3><div class="tabla-wrap"><table class="t"><thead><tr><th>ID</th><th>Unidad</th><th>Detalle</th><th class="num">Parte de la fuente</th><th class="num">PAC</th><th class="num">Devengado</th><th>Etapa</th><th>Semáforo</th></tr></thead><tbody>
    ${compras.map((c) => { const w = repartirPorFuente(c, 1)[sel]; return `<tr><td><button class="chico" data-abrir="${esc(c.id)}">${esc(c.id)}</button></td><td>${esc(c.unidad)}</td><td>${esc(c.detalle)}</td><td class="num">${pct(w)}</td><td class="num">${clp(c.m.pac * w)}</td><td class="num">${clp(c.m.real * w)}</td><td>${etapa(c.et)}</td><td>${semaforo(c.s.color)}</td></tr>`; }).join('')}
    </tbody></table></div></div>` : '<p class="small">Seleccione una fuente para ver el detalle.</p>'}`;
  el.querySelectorAll('[data-fuente]').forEach((b) => { b.onclick = () => { fuenteSel = b.dataset.fuente === fuenteSel ? null : b.dataset.fuente; renderFuentes(el, ctx); }; });
  el.querySelectorAll('[data-abrir]').forEach((b) => { b.onclick = () => ctx.abrirDetalle(b.dataset.abrir); });
}

function renderSEP(el, ctx) {
  const sep = ctx.calc.filter((c) => c.origen === 'SEP');
  if (!sep.length) {
    el.innerHTML = '<div class="tarjeta"><h2>SEP</h2><p>Aún no se ha importado el Seguimiento SEP. Impórtelo desde <a href="#calidad">Calidad y sincronización</a> (archivo cuyo nombre contenga "SEGUIMIENTO" y "SEP").</p></div>';
    return;
  }
  const vinc = calcularVinculos(ctx.estado.bases, ctx.p);
  const unidadesFilas = ctx.calc.filter((c) => c.origen === 'unidad');
  const ya = new Set(vinc.map((v) => `${v.sepId}|${v.compraId}`));
  // Vínculos no evidentes: se proponen por similitud del detalle, nunca se asumen.
  const propuestos = [];
  for (const s of sep) {
    if (vinc.some((v) => v.sepId === s.id && v.estado !== 'descartado')) continue;
    for (const u of unidadesFilas) {
      const sim = similitud(s.detalle, u.detalle);
      if (sim >= 0.5 && !ya.has(`${s.id}|${u.id}`)) propuestos.push({ sepId: s.id, compraId: u.id, sim, sep: s, u });
    }
  }
  propuestos.sort((a, b) => b.sim - a.sim);
  const tot = sep.reduce((a, c) => ({ pres: a.pres + c.m.pac, adj: a.adj + (c.base.montoAdjudicado || 0), dev: a.dev + (c.base.montoDevengado || 0), pag: a.pag + (c.base.montoPagado || 0) }), { pres: 0, adj: 0, dev: 0, pag: 0 });
  const admin = estado.esAdmin;
  el.innerHTML = `<h2>Seguimiento SEP <span class="small muted">(solo seguimiento: no suma en los totales)</span></h2>
  <div class="grilla">
    <div class="tarjeta kpi"><div class="etq">Ítems</div><div class="val">${sep.length}</div></div>
    <div class="tarjeta kpi"><div class="etq">Presupuestado</div><div class="val">${clp(tot.pres)}</div></div>
    <div class="tarjeta kpi"><div class="etq">Adjudicado</div><div class="val">${clp(tot.adj)}</div><div class="det">${pct(tot.pres ? tot.adj / tot.pres : NaN)} del presupuestado</div></div>
    <div class="tarjeta kpi"><div class="etq">Devengado / pagado</div><div class="val">${clp(tot.dev)}</div><div class="det">Pagado ${clp(tot.pag)}</div></div>
  </div>
  <div class="tabla-wrap" style="margin-top:1rem"><table class="t"><thead><tr><th>ID</th><th>Subt.</th><th>Ítem</th><th class="num">Presupuestado</th><th>Fase</th><th>Modalidad</th><th>Estado compra</th><th>Formalización</th><th>OC</th><th class="num">Adjudicado</th><th>Estado ejecución</th><th>Verificadores</th><th>Visación UATP</th><th class="num">Devengado</th><th class="num">Pagado</th><th>Vínculo</th><th>Semáforo</th></tr></thead><tbody>
  ${sep.map((c) => { const b = c.base; return `<tr><td><button class="chico" data-abrir="${esc(c.id)}">${esc(c.id)}</button></td><td>${esc(b.subtitulo)}</td><td>${esc(b.item)}</td><td class="num">${clp(b.montoPresupuestado)}</td>
    <td class="small">${esc(FASES[c.et.etapa])}<br><span class="muted">${esc(ETAPAS[c.et.etapa])}</span></td><td>${esc(b.modalidad || '')}</td><td>${esc(b.estadoCompra || '')}</td><td>${esc(b.documentoFormaliza || '')}</td><td>${esc(b.ocTexto || '')}</td>
    <td class="num">${clp(b.montoAdjudicado)}</td><td>${esc(b.estadoEjecucion || '')}</td><td class="small">${esc(b.verificadores || '')}</td><td>${'visacionUATP' in b ? esc(b.visacionUATP || 'Sin visación') : '<span class="muted">—</span>'}</td>
    <td class="num">${clp(b.montoDevengado)}</td><td class="num">${clp(b.montoPagado)}</td>
    <td class="small">${c.vinculo ? `🔗 ${esc(c.vinculo.compraId)} (${esc(c.vinculo.estado)})${admin ? ` <button class="chico" data-descartar="${esc(c.id)}|${esc(c.vinculo.compraId)}">Descartar</button>` : ''}` : '—'}</td><td>${semaforo(c.s.color)}</td></tr>`; }).join('')}
  </tbody></table></div>
  <p class="small muted">La columna "Etapa actual" de la planilla SEP no se lee (trae #REF!); la fase se recalcula con la lógica del Visor. SEP es solo de seguimiento: no suma en los totales del Servicio, porque sus compras se registran en las planillas de las unidades. El vínculo 🔗 indica en qué compra de una unidad está cada ítem.</p>
  <div class="tarjeta" style="margin-top:1rem"><h3>Vínculos propuestos por similitud (confirmar o descartar)</h3>
  ${propuestos.length ? `<div class="tabla-wrap libre"><table class="t"><thead><tr><th>Ítem SEP</th><th>Compra de unidad</th><th class="num">Similitud</th><th></th></tr></thead><tbody>
    ${propuestos.slice(0, 40).map((x) => `<tr><td>${esc(x.sepId)} · ${esc(x.sep.detalle)}</td><td>${esc(x.compraId)} · ${esc(x.u.detalle)} (${esc(x.u.unidad)})</td><td class="num">${pct(x.sim)}</td>
      <td class="nowrap">${admin ? `<button class="chico" data-confirmar="${esc(x.sepId)}|${esc(x.compraId)}">Confirmar</button> <button class="chico" data-descartar="${esc(x.sepId)}|${esc(x.compraId)}">Descartar</button>` : '<span class="small muted">Lo confirma la administración</span>'}</td></tr>`).join('')}
  </tbody></table></div>` : '<p class="small muted">No hay vínculos por proponer.</p>'}</div>`;
  el.querySelectorAll('[data-abrir]').forEach((b) => { b.onclick = () => ctx.abrirDetalle(b.dataset.abrir); });
  const p = ctx.p;
  el.querySelectorAll('[data-confirmar]').forEach((b) => {
    b.onclick = async () => {
      const [sepId, compraId] = b.dataset.confirmar.split('|');
      try { await guardarParametros({ vinculosConfirmados: [...(p.vinculosConfirmados || []), { sepId, compraId }] }); toast('Vínculo confirmado.'); } catch (e) { toast(e.message, true); }
    };
  });
  el.querySelectorAll('[data-descartar]').forEach((b) => {
    b.onclick = async () => {
      const [sepId, compraId] = b.dataset.descartar.split('|');
      try {
        await guardarParametros({
          vinculosDescartados: [...(p.vinculosDescartados || []), { sepId, compraId }],
          vinculosConfirmados: (p.vinculosConfirmados || []).filter((v) => !(v.sepId === sepId && v.compraId === compraId)),
        });
        toast('Vínculo descartado.');
      } catch (e) { toast(e.message, true); }
    };
  });
}
