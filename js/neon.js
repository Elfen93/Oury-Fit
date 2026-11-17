// ── Cliente mínimo de Neon Auth (Better Auth) + Data API ────────────────
// Sin SDK: unas pocas llamadas fetch.
import { NEON } from "./data.js";

// En Render, /neon-auth se reenvía al servidor de auth de Neon (ver render.yaml):
// así la cookie de sesión es del mismo dominio que la app y ningún navegador la bloquea.
// Si el reenvío no existe (p. ej. en local), se usa la URL directa.
let base = null;
async function authBase() {
  if (base) return base;
  try {
    const r = await fetch("neon-auth/ok", { credentials: "include", cache: "no-store" });
    if (r.ok && (await r.json())?.ok) return (base = new URL("neon-auth", location.href).href.replace(/\/$/, ""));
  } catch {}
  return (base = NEON.auth);
}

export class SinSesion extends Error {}

async function authFetch(path, opts = {}) {
  const b = await authBase();
  return fetch(b + path, {
    credentials: "include",
    cache: "no-store",
    ...opts,
    headers: { "Content-Type": "application/json", ...(opts.headers || {}) },
  });
}

const MENSAJES = {
  INVALID_EMAIL_OR_PASSWORD: "Email o contraseña incorrectos.",
  USER_ALREADY_EXISTS: "Ya existe una cuenta con ese email. Inicia sesión.",
  PASSWORD_TOO_SHORT: "La contraseña es demasiado corta (mínimo 8 caracteres).",
  INVALID_EMAIL: "El email no es válido.",
};

async function errorDe(r) {
  let j = null;
  try { j = await r.json(); } catch {}
  const code = j?.code || "";
  if (MENSAJES[code]) return new Error(MENSAJES[code]);
  if (/sign.?up.*disabled|signup/i.test(j?.message || "") || code.includes("SIGN_UP")) return new Error("Los registros están desactivados. Inicia sesión con tu cuenta.");
  return new Error(j?.message || `Error ${r.status}`);
}

// ── JWT para la Data API (caduca a los 15 min; se renueva solo) ──
let jwt = null, jwtExp = 0;
const expDe = (t) => { try { return JSON.parse(atob(t.split(".")[1].replace(/-/g, "+").replace(/_/g, "/"))).exp * 1000; } catch { return 0; } };

export async function token(forzar = false) {
  if (!forzar && jwt && jwtExp - Date.now() > 60000) return jwt;
  const r = await authFetch("/get-session");
  if (!r.ok) throw new Error(`get-session ${r.status}`);
  const sesion = await r.json().catch(() => null);
  if (!sesion?.session) { jwt = null; return null; }
  let t = r.headers.get("set-auth-jwt");
  if (!t) {
    const r2 = await authFetch("/token");
    if (r2.ok) t = (await r2.json().catch(() => null))?.token || null;
  }
  jwt = t; jwtExp = t ? expDe(t) : 0;
  return t;
}

export async function sesionActual() {
  const t = await token();
  if (!t) return null;
  try { return JSON.parse(atob(t.split(".")[1].replace(/-/g, "+").replace(/_/g, "/"))); } catch { return {}; }
}

export async function entrar(email, password) {
  const r = await authFetch("/sign-in/email", { method: "POST", body: JSON.stringify({ email, password }) });
  if (!r.ok) throw await errorDe(r);
  return comprobarSesion();
}

export async function registrar(email, password, name) {
  const r = await authFetch("/sign-up/email", { method: "POST", body: JSON.stringify({ email, password, name: name || email.split("@")[0] }) });
  if (!r.ok) throw await errorDe(r);
  return comprobarSesion();
}

async function comprobarSesion() {
  const t = await token(true);
  if (!t) throw new Error("El navegador no guardó la sesión (cookies bloqueadas). Prueba desde la web publicada en Render o permite las cookies.");
  return t;
}

export async function salir() {
  try { await authFetch("/sign-out", { method: "POST", body: "{}" }); } catch {}
  jwt = null; jwtExp = 0;
}

// ── Datos: una fila por usuario en public.ouryfit_datos ──
async function rest(path, opts = {}, reintento = true) {
  const t = await token();
  if (!t) throw new SinSesion("sin sesión");
  const r = await fetch(NEON.rest + path, {
    ...opts,
    headers: { Authorization: `Bearer ${t}`, "Content-Type": "application/json", ...(opts.headers || {}) },
  });
  if (r.status === 401 && reintento) { await token(true); return rest(path, opts, false); }
  if (r.status === 401) throw new SinSesion("sesión caducada");
  if (!r.ok) throw new Error(`Data API ${r.status}: ${(await r.text()).slice(0, 200)}`);
  return r;
}

export async function cargarDatos() {
  const r = await rest("/ouryfit_datos?select=data,updated_at");
  const filas = await r.json();
  return filas[0] || null;
}

export async function guardarDatos(data) {
  await rest("/ouryfit_datos?on_conflict=user_id", {
    method: "POST",
    headers: { Prefer: "resolution=merge-duplicates,return=minimal" },
    body: JSON.stringify({ data }),
  });
}
