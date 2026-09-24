// Resumen ejecutivo (portada).
import { MESES } from '../util.js';
import { agregar, estadoPAC, montoEnRiesgo, ETAPAS } from '../logica/motor.js';
import { contarHabiles } from '../logica/habiles.js';
import { esc, clp, clpCorto, pct, fecha } from '../formato.js';
import { kpi, semaforo, fuenteCifra, activarTooltips } from '../ui.js';
import { lineas, barras } from './graficos.js';
import { encabezadoImpresion } from './exportar.js';

export function render(el, ctx) {
  const { calc, p } = ctx;
  if (!calc.length) {
    el.innerHTML = `<div class="tarjeta"><h2>Sin datos</h2><p>Aún no se han importado planillas.
      ${ctx.estado.esAdmin ? 'Vaya a <a href="#calidad">Calidad y sincronización</a> para importarlas.' : 'La administración del Visor debe importarlas.'}</p></div>`;
    return;
  }
  const act = calc.filter((c) => c.enTotales);
  const [T] = agregar(act, () => 'Servicio');
  const porEstado = {};
  for (const c of act) {
    const k = estadoPAC(c.et.etapa);
    porEstado[k] ??= { n: 0, monto: 0 };
    porEstado[k].n += 1;
    porEstado[k].monto += c.m.pac;
  }
  const rojas = ctx.alertas.filter((a) => a.severidad === 'roja').length;
  const riesgo = act.reduce((s, c) => s + montoEnRiesgo(c), 0);
  const condicionado = act.filter((c) => c.pr.condicionado).reduce((s, c) => s + c.pr.planificado, 0);
  const sinDesglose = act.filter((c) => c.desglose && c.m.pac > 0 && MESES.every((m) => !c.desglose[m])).reduce((s, c) => s + c.m.pac, 0);
  const sinMes = act.reduce((s, c) => s + (c.pr.porMes.probable.SIN_MES || 0), 0);

  // Curva acumulada mensual
  const acum = (esc2) => { let s = 0; return MESES.map((m) => { s += act.reduce((a, c) => a + (c.pr.porMes[esc2][m] || 0), 0); return s; }); };
  const real = (() => { const a = acum('planificado'); return a.map((v, i) => (i < p.mesCorte ? v : null)); })();
  const proy = (k) => acum(k).map((v, i) => (i >= p.mesCorte - 1 ? v : null));
  const curva = lineas({
    titulo: 'Curva acumulada de ejecución 2026',
    etiquetas: MESES,
    series: [
      { nombre: 'Real', color: 'var(--s1)', valores: real },
      { nombre: 'Planificado', color: 'var(--s3)', valores: proy('planificado'), discontinua: true },
      { nombre: 'Probable', color: 'var(--s2)', valores: proy('probable'), discontinua: true },
      { nombre: 'Conservador', color: 'var(--s4)', valores: proy('conservador'), discontinua: true },
    ],
  });

  // Concentración octubre–diciembre
  const odc = ['OCT', 'NOV', 'DIC'];
  const montosOD = odc.map((m) => act.reduce((s, c) => s + (c.desglose?.[m] || 0), 0));
  const procesosOD = odc.map((m) => act.filter((c) => (c.desglose?.[m] || 0) > 0).length);

  const top = act.filter((c) => c.s.color === 'rojo').sort((a, b) => montoEnRiesgo(b) - montoEnRiesgo(a)).slice(0, 10);
  const proxHitos = (p.hitos || []).filter((h) => h.fecha >= ctx.hoy).sort((a, b) => a.fecha.localeCompare(b.fecha)).slice(0, 4);
  const fer = new Set(p.feriados);

  el.innerHTML = `${encabezadoImpresion(ctx, 'Visor SAF/SPYCG — Resumen ejecutivo')}
  <div class="fila no-imprimir" style="margin-bottom:.75rem"><h2 style="margin:0">Resumen ejecutivo</h2><div class="espacio"></div>
    <button id="rs-pdf">PDF ejecutivo</button></div>
  <div class="grilla">
    ${kpi('PAC 2026', clpCorto(T.pac), `${act.length} compras · ${clp(T.pac)}`)}
    ${kpi('Adjudicado u OC (anual)', clpCorto(T.adjudicado), pct(T.pac ? T.adjudicado / T.pac : NaN) + ' del PAC')}
    ${kpi('Devengado', clpCorto(T.real), 'Según planilla salvo devengo SIGFE registrado')}
    ${kpi('% de ejecución', pct(T.pac ? T.real / T.pac : NaN), 'Devengado / PAC')}
    ${kpi('Proyección de cierre (probable)', clpCorto(T.probable), `Conservador ${clpCorto(T.conservador)} · Planificado ${clpCorto(T.planificado)}`)}
    ${kpi('Alertas rojas', String(rojas), `Monto en riesgo ${clpCorto(riesgo)}`)}
  </div>
  <details class="supuestos" style="margin-top:.75rem"><summary>Supuestos de la proyección</summary><ul>
    <li>Real: desglose de las planillas hasta el mes ${p.mesCorte} (no cruzado con SIGFE), salvo devengo SIGFE registrado por Finanzas.</li>
    <li>Proyectado: desglose posterior al mes ${p.mesCorte} multiplicado por un factor según etapa y ventana (conservador / probable / planificado): ejecución 1 · adjudicada sin OC ${p.factores.probable.adjudicadaSinOC} · publicada ${p.factores.probable.publicada} · bases ${p.factores.probable.bases} · planificada ${p.factores.probable.planificada} · fuera de ventana ${p.factores.probable.fueraVentana} (valores del escenario probable).</li>
    <li>Corte de devengo ${fecha(p.fechaCorteDevengo)}; duraciones por modalidad referenciales${p.valorUTM ? `; UTM ${clp(p.valorUTM)}` : '; <b>valor UTM no registrado</b> (se asume tramo 100–1.000 UTM)'}.</li>
    <li>Compras con PAC y sin desglose mensual: ${clp(sinDesglose)} (no entran en la proyección).</li>
    ${sinMes ? `<li>Ítems SEP sin desglose mensual: ${clp(sinMes)} proyectados (probable) sin mes asignado.</li>` : ''}
    <li>Condicionado a definición pendiente (planificado): ${clp(condicionado)}; se muestra aparte y no es seguro.</li>
    <li>Ítems SEP vinculados a contratos de unidades se cuentan una sola vez (desde la planilla de la unidad).</li></ul></details>
  <div class="grilla dos" style="margin-top:1rem">
    <div class="tarjeta"><h3>Curva acumulada mensual (real + proyección)</h3>${curva}${fuenteCifra(ctx)}</div>
    <div class="tarjeta"><h3>Avance del PAC por estado</h3>
      <div class="tabla-wrap libre"><table class="t"><thead><tr><th>Estado PAC</th><th class="num">Compras</th><th class="num">Monto PAC</th><th>Participación</th></tr></thead><tbody>
      ${['Ejecutado', 'En curso', 'Pendiente', 'Desistido'].map((k) => { const v = porEstado[k] || { n: 0, monto: 0 }; return `<tr><td>${k}</td><td class="num">${v.n}</td><td class="num">${clp(v.monto)}</td><td style="min-width:120px"><div class="barra-prog"><div style="width:${T.pac ? (100 * v.monto) / T.pac : 0}%"></div></div></td></tr>`; }).join('')}
      </tbody></table></div>
      <p class="small muted">Ejecutado = etapas 3–4; En curso = 1–2; Pendiente = 0; Desistido = X. Etapas confirmadas por Compras o las Subdirecciones, o deducidas/inferidas de las planillas.</p>
      <h3 style="margin-top:1rem">Concentración octubre–diciembre</h3>
      ${barras({ etiquetas: ['Octubre', 'Noviembre', 'Diciembre'], valores: montosOD, nombre: 'Programado', extra: procesosOD.map((n) => `${n} compras con monto programado`), etiquetasValor: true, alto: 180 })}
      <p class="small">${procesosOD.map((n, i) => `${['Octubre', 'Noviembre', 'Diciembre'][i]}: ${n} compras`).join(' · ')}</p>
      ${fuenteCifra(ctx, 'monto programado por las unidades en su desglose')}</div>
  </div>
  <div class="grilla dos" style="margin-top:1rem">
    <div class="tarjeta"><h3>Las 10 compras en riesgo de mayor monto</h3>
      ${top.length ? `<div class="tabla-wrap libre"><table class="t"><thead><tr><th>ID</th><th>Detalle</th><th>Etapa</th><th class="num">En riesgo</th><th>Motivo</th></tr></thead><tbody>
      ${top.map((c) => `<tr><td><button class="chico" data-abrir="${esc(c.id)}">${esc(c.id)}</button></td><td>${esc(c.detalle)}</td><td class="small">${esc(ETAPAS[c.et.etapa])}</td><td class="num">${clp(montoEnRiesgo(c))}</td><td class="small">${semaforo('rojo')} ${esc(c.s.motivos.filter((m) => m.nivel === 'rojo').map((m) => m.texto).join('; '))}</td></tr>`).join('')}
      </tbody></table></div>` : '<p class="muted">Sin compras en rojo.</p>'}
      <p class="small muted">Monto en riesgo: PAC pendiente de devengar de compras en rojo.</p></div>
    <div class="pila">
      <div class="tarjeta"><h3>Próximos hitos</h3><div class="grilla">${proxHitos.map((h) => `<div><div class="cuenta">${contarHabiles(ctx.hoy, h.fecha, fer)} días háb.</div><div class="small"><b>${fecha(h.fecha)}</b> · ${esc(h.nombre)}</div><div class="small muted">${esc(h.responsable || '')}</div></div>`).join('') || '<p class="muted">Sin hitos futuros.</p>'}</div></div>
      <div class="tarjeta"><h3>Frescura de las planillas</h3><table class="t"><thead><tr><th>Planilla</th><th>Última modificación</th><th class="num">Días</th><th>Estado</th></tr></thead><tbody>
      ${Object.entries(ctx.frescura).sort((a, b) => b[1].dias - a[1].dias).map(([, f]) => `<tr><td>${esc(f.unidad)}</td><td>${fecha(String(f.fileModifiedAt).slice(0, 10))}</td><td class="num">${f.dias}</td><td>${f.dias > p.diasFrescura ? semaforo('amarillo', 'Sin actualizar') : semaforo('verde', 'Al día')}</td></tr>`).join('')}
      </tbody></table><p class="small muted">Amarillo: más de ${p.diasFrescura} días sin modificar.</p></div>
    </div>
  </div>`;
  el.querySelectorAll('[data-abrir]').forEach((b) => { b.onclick = () => ctx.abrirDetalle(b.dataset.abrir); });
  el.querySelector('#rs-pdf').onclick = () => window.print();
  activarTooltips(el);
}
