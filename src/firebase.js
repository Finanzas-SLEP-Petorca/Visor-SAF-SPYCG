// Conexión a Firebase (mismo proyecto que Calendariopermisos) y acceso por enlace al correo.
import { initializeApp } from 'https://www.gstatic.com/firebasejs/10.12.0/firebase-app.js';
import {
  getAuth, sendSignInLinkToEmail, isSignInWithEmailLink, signInWithEmailLink, signOut, onAuthStateChanged, connectAuthEmulator,
} from 'https://www.gstatic.com/firebasejs/10.12.0/firebase-auth.js';
import {
  initializeFirestore, persistentLocalCache, persistentMultipleTabManager, connectFirestoreEmulator,
} from 'https://www.gstatic.com/firebasejs/10.12.0/firebase-firestore.js';
import { firebaseConfig as configBase } from './firebase-config.js';

const firebaseConfig = { ...configBase };

// Solo para desarrollo: http://localhost…/?emulador usa los emuladores locales (proyecto demo).
export const EMULADOR = ['localhost', '127.0.0.1'].includes(location.hostname) && new URLSearchParams(location.search).has('emulador');
if (EMULADOR) firebaseConfig.projectId = 'demo-visor';

export const app = initializeApp(firebaseConfig);
export const auth = getAuth(app);
if (EMULADOR) connectAuthEmulator(auth, 'http://127.0.0.1:9099', { disableWarnings: true });

// Caché persistente (IndexedDB) para funcionar sin conexión, compartida entre pestañas.
let db;
try {
  db = initializeFirestore(app, { localCache: persistentLocalCache({ tabManager: persistentMultipleTabManager() }) });
} catch (e) {
  console.warn('Caché persistente no disponible; se usa memoria.', e?.message);
  db = initializeFirestore(app, {});
}
if (EMULADOR) connectFirestoreEmulator(db, '127.0.0.1', 8080);
export { db };

const CLAVE_CORREO = 'visorEmailForSignIn';

export async function enviarEnlace(email) {
  const url = window.location.origin + window.location.pathname + (EMULADOR ? '?emulador' : '');
  await sendSignInLinkToEmail(auth, email, { url, handleCodeInApp: true });
  localStorage.setItem(CLAVE_CORREO, email);
}

/** Si la URL es un enlace de acceso, completa el ingreso. Devuelve true si lo manejó. */
export async function completarEnlace() {
  if (!isSignInWithEmailLink(auth, window.location.href)) return false;
  let email = localStorage.getItem(CLAVE_CORREO);
  if (!email) email = window.prompt('Confirme su correo para completar el acceso:');
  if (!email) return false;
  await signInWithEmailLink(auth, email.trim().toLowerCase(), window.location.href);
  history.replaceState(null, '', window.location.pathname + (EMULADOR ? '?emulador' : ''));
  localStorage.removeItem(CLAVE_CORREO);
  return true;
}

export const cerrarSesion = () => signOut(auth);
export const alCambiarSesion = (fn) => onAuthStateChanged(auth, fn);
