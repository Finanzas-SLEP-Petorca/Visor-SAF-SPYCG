// Piezas de interfaz compartidas por las vistas.
import { esc, fecha, clp } from './formato.js';
import { ETAPAS } from './logica/motor.js';
import { ROLES } from './parametros-default.js';

const SEM = {
  rojo: ['⛔', 'Rojo'], amarillo: ['⚠', 'Amarillo'], verde: ['✓', 'Verde'], azul: ['●', 'Ejecutada'], gris: ['⊘', 'Desistida'],
};
export function semaforo(color, titulo = '') {
  const [ico, txt] = SEM[color] || ['?', color];
  return `<span class="sem ${color}" title="${esc(titulo)}"><span aria-hidden="true">${ico}</span>${txt}</span>`;
}

const MARCAS = { confirmado: '✔ confirmado', deducido: '≈ deducido', inferido: '? inferido' };
export function etapa(et) {
  return `<span class="etapa">${et.etapa} · ${esc(ETAPAS[et.etapa])}</span><span class="marca ${et.marca}" title="Fuente: ${esc(et.fuente)}">${MARCAS[et.marca]}</span>`;
}

export const nombreRol = (r) => ROLES[r] || r || 'sin rol';

export function opciones(lista, sel, vacia = '—') {
  const o = vacia !== null ? [`<option value="">${esc(vacia)}</option>`] : [];
  for (const it of lista) {
    const [v, t] = Array.isArray(it) ? it : [it, it];
    o.push(`<option value="${esc(v)}"${String(v) === String(sel ?? '') ? ' selected' : ''}>${esc(t)}</option>`);
  }
  return o.join('');
}

let tToast;
export function toast(msg, error = false) {
  const el = document.getElementById('toast');
  el.textContent = msg;
  el.className = `toast${error ? ' error' : ''}`;
  clearTimeout(tToast);
  tToast = setTimeout(() => el.classList.add('oculto'), error ? 7000 : 3000);
}

/** Muestra un tooltip para elementos con data-tip (hover y foco). */
export function activarTooltips(raiz) {
  if (raiz.dataset.tips) return;
  raiz.dataset.tips = '1';
  const tip = document.getElementById('tooltip');
  const mostrar = (e) => {
    const t = e.target.closest('[data-tip]');
    if (!t || !raiz.contains(t)) return;
    tip.innerHTML = t.dataset.tip;
    tip.classList.remove('oculto');
    const r = t.getBoundingClientRect();
    const x = e.clientX ?? r.left + r.width / 2;
    const y = e.clientY ?? r.top;
    tip.style.left = `${Math.min(x + 12, window.innerWidth - tip.offsetWidth - 8)}px`;
    tip.style.top = `${Math.max(8, y - tip.offsetHeight - 12)}px`;
  };
  const ocultar = () => tip.classList.add('oculto');
  raiz.addEventListener('mousemove', mostrar);
  raiz.addEventListener('focusin', mostrar);
  raiz.addEventListener('mouseleave', ocultar);
  raiz.addEventListener('focusout', ocultar);
  raiz.addEventListener('mouseover', (e) => { if (!e.target.closest('[data-tip]')) ocultar(); });
}

/** Texto de fuente y fecha de corte para cada cifra. */
export function fuenteCifra(ctx, extra = '') {
  const corte = ctx.corteBase ? fecha(ctx.corteBase) : 'sin datos';
  const mes = ['enero', 'febrero', 'marzo', 'abril', 'mayo', 'junio', 'julio', 'agosto', 'septiembre', 'octubre', 'noviembre', 'diciembre'][ctx.p.mesCorte - 1];
  return `<div class="fuente-cifra">Fuente: planillas de unidades (última modificación ${corte})${ctx.hayBaseSEP ? ' y Seguimiento SEP' : ''}; real = desglose hasta ${mes} o devengo SIGFE si Finanzas lo registró${extra ? `; ${esc(extra)}` : ''}.</div>`;
}

export function kpi(etq, val, det = '') {
  return `<div class="tarjeta kpi"><div class="etq">${esc(etq)}</div><div class="val">${val}</div>${det ? `<div class="det">${det}</div>` : ''}</div>`;
}

/** Descarga un texto como archivo. */
export function descargar(nombre, contenido, tipo = 'text/plain;charset=utf-8') {
  const url = URL.createObjectURL(new Blob([contenido], { type: tipo }));
  const a = Object.assign(document.createElement('a'), { href: url, download: nombre });
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

export const montoCelda = (n) => `<td class="num">${clp(n)}</td>`;

/** Ordena filas por una clave accesora con dirección. */
export function ordenar(arr, fn, dir = 1) {
  return [...arr].sort((a, b) => {
    const x = fn(a); const y = fn(b);
    if (x === y) return 0;
    if (x === null || x === undefined) return 1;
    if (y === null || y === undefined) return -1;
    return (typeof x === 'number' && typeof y === 'number' ? x - y : String(x).localeCompare(String(y), 'es', { numeric: true })) * dir;
  });
}
