// Guía de uso de cada pestaña: qué muestra, cómo leerla y qué puede ingresar cada rol.
import { esc } from './formato.js';
import { ROLES } from './parametros-default.js';

const G = {
  resumen: {
    titulo: 'Resumen ejecutivo',
    que: 'La portada para la Dirección y las Subdirecciones: muestra en un vistazo cuánto se planificó (PAC), cuánto está comprometido, cuánto se ha devengado y cómo se proyecta el cierre 2026.',
    leer: [
      'Las <b>tarjetas</b> de arriba suman las compras de las planillas de las unidades. El Seguimiento SEP aparece en una tarjeta aparte, con borde punteado, y <b>no suma</b>: sus compras se registran en las planillas de las unidades.',
      '<b>Proyección de cierre</b>: tres escenarios. <i>Conservador</i> solo cuenta lo que ya tiene OC o está en ejecución; <i>probable</i> aplica factores según la etapa y la ventana; <i>planificado</i> supone que todo lo programado por las unidades se cumple.',
      'La <b>curva acumulada</b> muestra en línea continua lo real (hasta el mes de corte) y en líneas discontinuas los tres escenarios. Pase el cursor sobre un mes para ver las cifras, o use "Ver tabla".',
      'Abra <b>Supuestos de la proyección</b> para ver qué se asumió: mes de corte, factores, UTM y montos condicionados.',
      '<b>Las 10 compras en riesgo</b>: compras en rojo ordenadas por el monto que no se alcanzaría a ejecutar. Haga clic en el ID para abrir su detalle.',
      '<b>Frescura</b>: cuántos días lleva cada planilla sin modificarse. En amarillo, las que superan el umbral.',
    ],
    ingresar: 'Esta pestaña es de lectura. Las cifras cambian solas cuando alguien registra información en la Planilla en línea o se importan planillas.',
    acciones: ['<b>PDF ejecutivo</b>: imprime esta portada en hoja horizontal (elija "Guardar como PDF" en el diálogo de impresión).'],
  },
  planilla: {
    titulo: 'Planilla en línea',
    que: 'Todas las compras de las unidades y del Seguimiento SEP en una sola tabla, con su estado, ventana de compra, semáforo y la última observación de cada rol. Es la pestaña de trabajo diario.',
    leer: [
      '<b>Etapa</b>: 0 Planificada · 1 En proceso de compra · 2 Adjudicada/formalizada · 3 En ejecución · 4 Ejecutada · X Desistida. La marca indica de dónde sale: <span class="marca confirmado">✔ confirmado</span> (Compras o Subdirección), <span class="marca">≈ deducido</span> (OC o devengo de la planilla), <span class="marca inferido">? inferido</span> (leído de las observaciones de la unidad; Compras debe confirmarlo).',
      '<b>Ventana</b>: fecha límite para iniciar la compra (requerimiento completo) y días hábiles de margen. "Vencida" significa que ya no alcanza con los plazos de su modalidad.',
      '<b>Semáforo</b>: ⛔ rojo requiere acción; ⚠ amarillo, atención; ✓ verde, sin alertas; ● ejecutada; ⊘ desistida. Pase el cursor sobre el semáforo para ver los motivos.',
      'Los meses en <span class="mes-real">azul</span> son lo reportado como ejecutado por la unidad; en <span class="mes-proy">naranjo</span>, lo proyectado. Active "12 meses" para ver el año completo.',
      '"ᴾ" junto al devengado indica que viene de la planilla de la unidad y aún no del SIGFE.',
    ],
    ingresar: 'Las <span class="celda-muestra">celdas amarillas</span> son las que su rol puede editar directamente en la tabla: el cambio se guarda al elegir la opción o al salir de la celda. Para el resto de los campos, observaciones y contactos, haga clic en el <b>ID</b> de la compra para abrir su detalle.',
    porRol: {
      compras: 'Usted edita en la tabla el <b>estado del proceso</b> y la <b>modalidad</b>. En el detalle: ID de Mercado Público, N° de llamado, fechas, monto adjudicado, OC, ventana institucional, plazo de entrega y contacto con proveedores.',
      presupuesto: 'Usted edita en la tabla la <b>acción presupuestaria</b> (mantener, liberar, reasignar). En el detalle: asignación validada, CDP, comprometido SIGFE y definición pendiente.',
      finanzas: 'Usted edita en la tabla el <b>devengado SIGFE</b>. En el detalle: pagado SIGFE, fecha de corte y programación de caja por mes.',
      subdirSAF: 'Usted edita en la tabla el <b>estado general</b>. En el detalle: fuentes de financiamiento, fecha estimada del requerimiento, prioridad, acuerdos, responsable y fecha compromiso.',
      subdirSPYCG: 'Usted edita en la tabla el <b>estado general</b>. En el detalle: fuentes de financiamiento, fecha estimada del requerimiento, prioridad, acuerdos, responsable y fecha compromiso.',
      lectura: 'Su rol es de lectura: puede filtrar, abrir el detalle y exportar, pero no editar.',
    },
    acciones: [
      'Use los <b>filtros</b> (unidad, Subdirección, fuente, etapa, semáforo, ventana, texto) para acotar la tabla; los totales de arriba y las exportaciones respetan el filtro.',
      'Haga clic en un <b>encabezado</b> (PAC, Etapa, Ventana, Semáforo…) para ordenar.',
      'Cuando otra persona cambia una compra, la fila se ilumina y dice "editado por…".',
      '<b>Exportar Excel/CSV</b> descarga lo que está filtrado, con fuente, fecha de corte y usuario. Para exportar solo algunas compras, marque sus <b>casillas</b> en la columna ID (la casilla del encabezado marca todas las filtradas) y use "Exportar selección".',
      'Para moverse hacia el lado use la <b>barra de desplazamiento de arriba</b> de la tabla, que queda fija al bajar por la página, o Mayús + rueda del mouse.',
      'En el detalle de una compra, <b>⬇ Excel</b> y <b>⬇ PDF</b> descargan solo esa compra. El detalle se cierra con "Cerrar", con Esc o haciendo clic fuera del recuadro; si hay cambios sin guardar, pregunta antes.',
    ],
  },
  fuentes: {
    titulo: 'Por fuente y SEP',
    que: 'Agrupa las compras según la fuente de financiamiento o subvención que registran las Subdirecciones, y muestra el Seguimiento SEP con el formato de fases.',
    leer: [
      'Cada tarjeta muestra PAC, adjudicado, devengado, proyección probable y monto en riesgo de esa fuente. Un contrato con varias fuentes se reparte según los montos indicados.',
      '"Sin clasificar" reúne las compras a las que aún nadie les asignó fuente.',
      'Pestaña <b>SEP</b>: es solo de seguimiento y no suma en los totales. Muestra cada ítem con su fase recalculada (la columna "Etapa actual" de la planilla no se usa), visación UATP, devengado, pagado y el vínculo 🔗 con la compra de la unidad donde se controla',
    ],
    ingresar: 'La fuente se registra en el detalle de cada compra (sección Subdirecciones). Los vínculos SEP propuestos por similitud los confirma o descarta la administración en la pestaña SEP.',
    porRol: {
      subdirSAF: 'Para asignar fuentes, abra la compra desde "Planilla en línea" o desde el detalle de una tarjeta, y complete "Fuentes de financiamiento".',
      subdirSPYCG: 'Para asignar fuentes, abra la compra desde "Planilla en línea" o desde el detalle de una tarjeta, y complete "Fuentes de financiamiento".',
      presupuesto: 'Si no está de acuerdo con la fuente asignada, regístrelo en su observación de la compra.',
    },
    acciones: ['Haga clic en una tarjeta para ver las compras de esa fuente.'],
  },
  unidades: {
    titulo: 'Por unidad y Subdirección',
    que: 'El avance de cada unidad requirente agrupado por Subdirección, con las acciones que debe tomar y los compromisos registrados.',
    leer: [
      'Cada tarjeta muestra PAC, devengado, proyección y monto en riesgo, la cantidad de compras por estado y por semáforo.',
      '<b>Acciones requeridas</b> se redactan a partir de las alertas ("Enviar el requerimiento…", "Definir si se libera…") e indican el responsable.',
      '<b>Compromisos y acuerdos</b> lista lo que registraron las Subdirecciones en cada compra, con responsable y fecha.',
    ],
    ingresar: 'Los acuerdos se registran en el detalle de cada compra (sección Subdirecciones). El mapa unidad → Subdirección se define en Parámetros.',
    acciones: ['<b>PDF de la unidad</b>: imprime solo la tarjeta de esa unidad, para enviarla o llevarla a reunión.'],
  },
  calendario: {
    titulo: 'Calendario y ventanas',
    que: 'La línea de tiempo de septiembre a diciembre con los hitos de cierre, las ventanas institucionales y las fechas límite de cada compra que aún no inicia o está en proceso.',
    leer: [
      'La línea azul es hoy y la roja discontinua, el corte de devengo.',
      'Cada símbolo (▲ rojo · ◆ amarillo · ● verde) es una compra ubicada en su fecha límite para iniciar. Pase el cursor para ver cuál es.',
      'El <b>mapa semanal</b> cuenta cuántos procesos deben iniciarse cada semana; un recuadro rojo indica más procesos de los que se pueden tramitar (cuello de botella).',
    ],
    ingresar: 'Los hitos los edita Finanzas y las ventanas institucionales, Compras, en la pestaña Parámetros. La ventana de cada compra la asigna Compras en su detalle.',
    acciones: [],
  },
  observaciones: {
    titulo: 'Observaciones',
    que: 'Todas las observaciones registradas, separadas por rol (Finanzas, Compras, Presupuesto, Subdirector SAF, Subdirector SPYCG).',
    leer: [
      'Use los botones de rol y los filtros por unidad, fechas o compra.',
      'Las observaciones <b>no se pueden editar ni borrar</b>: quedan con autor y fecha. Para corregir, agregue una nueva.',
    ],
    ingresar: 'Para agregar una observación, abra la compra (clic en su ID) y escriba en la columna de su rol, en "Observaciones por rol". La última observación de cada rol aparece también en la Planilla en línea.',
    acciones: ['"Recargar" trae las observaciones más recientes.'],
  },
  proveedores: {
    titulo: 'Proveedores',
    que: 'La bitácora de contactos con proveedores (llamados, correos, reuniones, consultas al mercado) y las compras desiertas que aún no tienen un contacto registrado.',
    leer: ['La primera tabla es la lista de pendientes: compras desiertas sin contacto. La segunda, todos los contactos registrados.'],
    ingresar: 'Para registrar un contacto, abra la compra y complete "Contacto con proveedores" (fecha, medio, proveedor, resultado y próxima acción). Cualquier rol editor puede hacerlo, a su nombre.',
    acciones: [],
  },
  calidad: {
    titulo: 'Calidad y sincronización',
    que: 'El estado de cada planilla: cuándo la modificó la unidad, cuándo se sincronizó, cuántas filas tiene y qué problemas de calidad se detectaron.',
    leer: [
      'Las <b>advertencias</b> señalan datos que el Visor corrigió o no pudo interpretar (subtítulo invertido, tipo de compra vacío, monto OC sin N° de OC, total que no cuadra, etc.). Sirven para pedir correcciones a cada unidad.',
      'El Visor nunca modifica las planillas: solo las lee.',
    ],
    ingresar: 'La administración importa las planillas con <b>Elegir carpeta</b> (la carpeta de OneDrive) o <b>Elegir archivos</b>. Antes de guardar se muestra la conciliación: compras nuevas, desaparecidas o con un detalle muy distinto (posible renumeración). La gestión y las observaciones se conservan.',
    acciones: ['Con el agente local activo, esta tabla se actualiza sola cada 10 minutos.'],
  },
  parametros: {
    titulo: 'Parámetros',
    que: 'Los supuestos con que el Visor calcula ventanas, semáforos y proyecciones, más los usuarios y roles.',
    leer: ['Cada sección indica quién puede editarla; las que puede editar su rol aparecen resaltadas en amarillo.'],
    ingresar: 'Modifique los valores y presione <b>Guardar</b> en la sección. Todos los cambios quedan en el Historial.',
    porRol: {
      finanzas: 'Usted edita la fecha de corte de devengo, el mes de corte, el valor UTM (actualícelo cada mes), los feriados y los hitos.',
      compras: 'Usted edita las duraciones por modalidad, los plazos de entrega y las ventanas institucionales.',
    },
    acciones: ['La administración además edita factores, umbrales, listas, el mapa unidad → Subdirección y los usuarios. "Exportar respaldo JSON" descarga la gestión y las observaciones.'],
  },
  historial: {
    titulo: 'Historial',
    que: 'El registro completo de cambios: quién cambió qué, cuándo, y el valor antes y después. Incluye la gestión, las sincronizaciones de planillas y los cambios de configuración.',
    leer: ['Filtre por tipo, autor o texto. El historial no se puede modificar.'],
    ingresar: 'No se ingresa nada aquí: se registra solo cada vez que alguien guarda un cambio.',
    acciones: ['Haga clic en el ID para abrir la compra.'],
  },
};

const CLAVE = 'visorGuiaCerrada';
function cerradas() { try { return JSON.parse(localStorage.getItem(CLAVE) || '{}'); } catch { return {}; } }
function guardarCerrada(vista, cerrada) {
  try { const c = cerradas(); c[vista] = cerrada; localStorage.setItem(CLAVE, JSON.stringify(c)); } catch { /* sin almacenamiento */ }
}

/** Pinta la guía de la pestaña en `el`. Se muestra abierta la primera vez; luego recuerda si el usuario la cerró. */
export function pintarGuia(el, vista, rol) {
  const g = G[vista];
  if (!g) { el.innerHTML = ''; return; }
  const abierta = !cerradas()[vista];
  const propia = g.porRol?.[rol];
  el.innerHTML = `<details class="guia no-imprimir"${abierta ? ' open' : ''}>
    <summary><span aria-hidden="true">ⓘ</span> ¿Cómo se usa <b>${esc(g.titulo)}</b>?</summary>
    <div class="guia-cuerpo">
      <div><h4>Qué muestra</h4><p>${g.que}</p></div>
      <div><h4>Cómo leerla</h4><ul>${g.leer.map((x) => `<li>${x}</li>`).join('')}</ul></div>
      <div><h4>Cómo ingresar información</h4><p>${g.ingresar}</p>
        ${propia ? `<p class="guia-rol"><b>Con su rol (${esc(ROLES[rol] || rol)}):</b> ${propia}</p>` : ''}
        ${g.acciones.length ? `<ul>${g.acciones.map((x) => `<li>${x}</li>`).join('')}</ul>` : ''}</div>
    </div></details>`;
  el.querySelector('details').addEventListener('toggle', (e) => guardarCerrada(vista, !e.target.open));
}

export const VISTAS_CON_GUIA = Object.keys(G);
