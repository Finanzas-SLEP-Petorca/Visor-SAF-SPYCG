# Visor de Monitoreo de Control, Ejecución y Proyección SAF/SPYCG

Servicio Local de Educación Pública de Petorca · Subdepartamento de Finanzas.

Instrumento compartido entre SAF y SPYCG: reúne en una **planilla en línea** las compras de las
planillas de cada unidad requirente y del Seguimiento SEP, les agrega la gestión de Compras,
Presupuesto, Finanzas y las Subdirecciones, y calcula etapas, ventanas de compra, semáforos,
alertas y la proyección de cierre en tres escenarios.

Publicado en <https://finanzas-slep-petorca.github.io/Visor-SAF-SPYCG/>.

> **Este repositorio es público.** Nunca agregue planillas, JSON, CSV, capturas ni textos con datos
> reales. Los datos viven solo en Firestore, detrás del inicio de sesión y de las reglas por rol.
> La carpeta `docs/privado/` (especificación, reglas y roles iniciales) está excluida de git.

## Arquitectura

```
Unidades requirentes ─ editan ─► Planillas Excel en SharePoint (el Visor nunca las modifica)
                                      │
      Importación desde el navegador (Fase 1a) · agente local (Fase 1b) · conector Graph (Fase 2)
                                      │  mismo normalizador: src/normalizer.js
                                      ▼
            Firestore (proyecto slep-petorca-finanzas-permisos, colecciones visor_*)
                                      │  tiempo real
                                      ▼
                     Visor en GitHub Pages (index.html, sin compilación)
```

| Carpeta / archivo | Contenido |
|---|---|
| `index.html`, `css/`, `src/app.js`, `src/vistas/` | Interfaz (módulos ES, sin compilación) |
| `src/normalizer.js`, `src/normalizer-sep.js` | Normalizadores puros (navegador, agente y conector) |
| `src/conciliacion.js`, `src/importacion.js` | Conciliación de IDs y preparación de cada importación |
| `src/logica/` | Días hábiles, etapas, ventanas, semáforo, proyección, alertas y acciones |
| `src/roles.js` | Campos de `visor_gestion` que escribe cada rol (deben coincidir con las reglas) |
| `src/parametros-default.js` | Valores por defecto de los parámetros |
| `sync/agente-local.mjs` | Agente local de sincronización (Fase 1b) |
| `test/` | Pruebas con fixtures **sintéticos** y prueba de integración opcional |

Librerías por CDN: Firebase 10.12.0 (gstatic.com) y SheetJS 0.20.3 (cdn.sheetjs.com, CDN oficial;
la versión 0.18.5 publicada en cdnjs/npm tiene vulnerabilidades conocidas). El agente local y las pruebas
instalan SheetJS desde el mismo origen oficial (`https://cdn.sheetjs.com/xlsx-0.20.3/xlsx-0.20.3.tgz`).
Los gráficos son SVG propios.

## Acceso y roles

- Acceso por **enlace al correo** (Firebase Email Link), igual que Calendariopermisos. El enlace debe
  abrirse en el mismo navegador donde se pidió.
- El Visor **no usa** la lista `isAllowed()` de las otras apps: solo entran los correos con rol activo
  en `visor_config/roles` y los administradores escritos en las reglas.
- Roles: `finanzas`, `compras`, `presupuesto`, `subdirSAF`, `subdirSPYCG`, `lectura`. Cada rol ve todo
  y edita solo sus campos (celdas amarillas). Cualquier rol editor registra contactos con proveedores.
- Las observaciones, los contactos y el historial solo se agregan: nadie los edita ni los borra.

### Primer ingreso del administrador

1. Ingrese con el correo de administrador. Como `visor_config/roles` aún no existe, el Visor muestra
   **Configuración inicial de roles**.
2. Cargue el archivo `docs/privado/roles-inicial.json` (fuera de git) con el formato
   `{ "usuarios": { "correo": { "rol", "nombre", "activo", "admin"? } } }`.

### Agregar o cambiar usuarios

*Parámetros → Usuarios y roles* (solo administradores): agregar fila, elegir rol, marcar activo y
**Guardar usuarios y roles**. Se reescribe el mapa completo (los correos tienen puntos). La marca
"admin" es visual: los permisos de administración los dan las reglas.

## Importar planillas (Fase 1a)

1. *Calidad y sincronización → Elegir carpeta* y seleccionar la carpeta sincronizada de OneDrive
   `Monitoreo control de pagos y ejecucion 2026` (o *Elegir archivos*).
2. Se reconocen `ESTATUS DEVENGOS COMPRAS <UNIDAD> 2026.xlsx` (acepta unidades nuevas con el mismo
   patrón) y el Seguimiento SEP (nombre con "SEGUIMIENTO" y "SEP").
   El Seguimiento SEP es **solo de seguimiento**: no suma en los totales del Servicio, porque sus compras
   se registran en las planillas de las unidades (UATP y otras Subdirecciones).
3. Revise la **conciliación** (compras nuevas, desaparecidas o con detalle muy distinto) y las
   advertencias de calidad, y presione **Confirmar importación**. La gestión y las observaciones se
   conservan: están en otra capa, asociadas al ID de la compra (`<UNIDAD>-<N° con 3 dígitos>`).

## Agente local (Fase 1b): actualización automática desde OneDrive

Con el agente, lo que las unidades guardan en SharePoint aparece solo en el Visor (cada 10 minutos).

1. **Firebase Console → Authentication → Sign-in method**: habilitar *Correo electrónico/contraseña*.
2. **Authentication → Users → Agregar usuario**: un correo técnico (por ejemplo `visor-sync@…`) y
   una contraseña larga. Copie su **UID**.
3. En `firestore.rules`, reemplace `REEMPLAZAR_POR_UID_USUARIO_SYNC` por ese UID y publique las reglas.
   El usuario sync solo puede escribir `visor_base` y entradas de historial de tipo `sync`; no puede
   leer nada.
4. En el PC que queda encendido (Node 20 o superior), dentro del repositorio: `npm install`, copie
   `sync/env.ejemplo` como `sync/.env` y complete `VISOR_DATA_DIR`, `VISOR_SYNC_EMAIL` y
   `VISOR_SYNC_PASSWORD`. `sync/.env` y `sync/.estado/` están fuera de git.
5. Pruebe: `npm run sync:simular` (no escribe) y luego `npm run sync`.
6. Programe la tarea (PowerShell, ajuste las rutas), cada 10 minutos de lunes a viernes de 08:00 a 19:00:

   ```powershell
   schtasks /Create /TN "Visor SAF-SPYCG agente" /SC WEEKLY /D MON,TUE,WED,THU,FRI /ST 08:00 /RI 10 /DU 11:00 `
     /TR "cmd /c cd /d C:\Users\<usuario>\Documents\GitHub\Visor-SAF-SPYCG && node sync\agente-local.mjs >> sync\.estado\agente.log 2>&1"
   ```

El agente compara fecha y tamaño de cada archivo, copia a un temporal los que cambiaron (pueden estar
abiertos en Excel), los normaliza y escribe solo si el contenido cambió. Solo registra conteos.

## Publicar las reglas de Firestore

Las reglas combinadas (calendario, panel SEP 70/30, déficit P02 y Visor) están en
`docs/privado/firestore.rules`, con sus pruebas en `docs/privado/firestore.rules.test.mjs`.

1. Pruebas con el emulador (requiere Java 11 o superior): `npm install` y `npm run test:reglas`.
   Todas deben pasar.
2. Firebase Console → Firestore → Reglas: copiar las reglas vigentes como respaldo, pegar el archivo
   completo y **Publicar**.
3. Probar de inmediato el calendario de permisos, el panel SEP y el panel de déficit.

Si se agregan o renombran campos de `visor_gestion`, actualizar en el mismo cambio `src/roles.js`,
`vCamposRol()` de las reglas y sus pruebas (`npm test` verifica que coincidan).

## Pruebas

- `npm test`: normalizador, lógica y campos por rol, con fixtures sintéticos.
- Integración con las planillas reales (solo en el PC con OneDrive; nunca imprime datos, solo cifras
  de control, y compara con la sección 12 de `docs/privado/ESPECIFICACION.md`):

  ```powershell
  $env:VISOR_DATA_DIR = "C:\Users\<usuario>\OneDrive - ...\Monitoreo control de pagos y ejecucion 2026"
  npm run test:integracion
  ```

- Desarrollo local contra emuladores: `npx firebase emulators:start --only auth,firestore --project demo-visor`,
  servir la carpeta (`npx http-server -p 5173`) y abrir `http://localhost:5173/?emulador`. Los enlaces de
  acceso del emulador se ven en `http://127.0.0.1:9099/emulator/v1/projects/demo-visor/oobCodes`.

## Respaldo

*Parámetros → Respaldo → Exportar respaldo JSON* descarga la capa de gestión, las observaciones, los
contactos y los parámetros. Guárdelo solo en carpetas institucionales. La restauración se hace con
permisos de administración del proyecto (importación de Firestore desde Google Cloud), porque las reglas
impiden reescribir observaciones o gestión con fechas antiguas desde la app.

## Presupuesto de lecturas

Plan Spark (50.000 lecturas/día, compartidas con las otras 3 apps). Una sesión nueva lee ~8 documentos
de base, los de gestión y 2 de configuración; observaciones e historial se leen solo al abrir un detalle
o sus vistas. Revise *Firebase Console → Uso* la primera semana.
