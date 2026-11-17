// ── Almacenamiento: local primero, sincronización con Google Sheets ─────
import { useState, useEffect, useRef } from "./lib.js";
import { LS, SCRIPT_URL, datosPorDefecto, migrar, aHoja, deHoja } from "./data.js";
import { rachas, semanaPrograma } from "./calc.js";

export const ls = {
  get(k) { try { return localStorage.getItem(k); } catch { return null; } },
  set(k, v) { try { localStorage.setItem(k, v); } catch {} },
  del(k) { try { localStorage.removeItem(k); } catch {} },
  json(k) { try { const r = localStorage.getItem(k); return r ? JSON.parse(r) : null; } catch { return null; } },
};

async function hojaCargar(email) {
  const r = await fetch(`${SCRIPT_URL}?action=load&email=${encodeURIComponent(email)}`);
  const j = await r.json();
  if (j.status === "error") throw new Error(j.error || "error");
  return j.data || {};
}

async function hojaGuardar(email, data, keepalive = false) {
  const body = JSON.stringify({ action: "save", email, data });
  // Sin content-type → text/plain: evita el preflight CORS con Apps Script.
  const r = await fetch(SCRIPT_URL, { method: "POST", body, keepalive: keepalive && body.length < 60000 });
  if (!r.ok) throw new Error(`HTTP ${r.status}`);
  try { const j = await r.json(); if (j?.status === "error") throw new Error(j.error); } catch (e) { if (e.message && !/JSON|Unexpected/.test(e.message)) throw e; }
}

function paraHoja(d) {
  const { actual, mejor } = rachas(d);
  return aHoja(d, { racha: actual, mejorRacha: mejor, semana: semanaPrograma(d) });
}

// Decodifica el JWT de Google (base64url + UTF-8; la v4 fallaba con tildes).
export function leerJWT(token) {
  const b64 = token.split(".")[1].replace(/-/g, "+").replace(/_/g, "/");
  const bin = atob(b64 + "===".slice((b64.length + 3) % 4));
  const bytes = Uint8Array.from(bin, (c) => c.charCodeAt(0));
  return JSON.parse(new TextDecoder().decode(bytes));
}

function cuentaInicial() {
  const email = ls.get(LS.email);
  if (email) return { modo: "google", email };
  if (ls.get(LS.mode) === "local") return { modo: "local" };
  return null;
}

function cargarLocal(owner) {
  const d = ls.json(LS.data);
  if (d) return { data: migrar(d), owner: ls.get(LS.owner) };
  const legacy = ls.json(LS.legacy);
  if (legacy) return { data: migrar(legacy), owner: null };
  return null;
}

export function useStore() {
  const [cuenta, setCuenta] = useState(cuentaInicial);
  const [data, setData] = useState(null);
  const [sync, setSync] = useState("idle"); // idle | cargando | guardando | ok | error
  const [authError, setAuthError] = useState(null);
  const ref = useRef(null);
  const cuentaRef = useRef(cuenta);
  const timer = useRef(null);
  const rev = useRef(0);
  cuentaRef.current = cuenta;

  function aplicar(d, persistir = true) {
    ref.current = d;
    setData(d);
    if (persistir) {
      ls.set(LS.data, JSON.stringify(d));
      const c = cuentaRef.current;
      ls.set(LS.owner, c?.modo === "google" ? c.email : "local");
    }
  }

  async function subir(keepalive = false) {
    const c = cuentaRef.current;
    if (c?.modo !== "google" || !ref.current) return;
    clearTimeout(timer.current);
    const v = rev.current;
    setSync("guardando");
    try {
      await hojaGuardar(c.email, paraHoja(ref.current), keepalive);
      if (rev.current === v) ls.del(LS.dirty);
      setSync("ok");
    } catch {
      setSync("error");
    }
  }

  // Carga inicial al cambiar de cuenta
  useEffect(() => {
    if (!cuenta) { ref.current = null; setData(null); return; }
    const local = cargarLocal();

    if (cuenta.modo === "local") {
      aplicar(local?.data || datosPorDefecto(), !local);
      setSync("idle");
      return;
    }

    let cancel = false;
    const mismoDueno = local && (local.owner === cuenta.email || local.owner == null);
    const pendiente = ls.get(LS.dirty) === "1" && mismoDueno;
    if (mismoDueno) aplicar(local.data, false);
    setSync("cargando");

    hojaCargar(cuenta.email)
      .then((raw) => {
        if (cancel) return;
        const remoto = deHoja(raw);
        if (pendiente) { subir(); return; } // cambios locales sin subir: mandan ellos
        if (remoto.profile.setup) { aplicar(remoto); setSync("ok"); return; }
        // Hoja vacía: si hay datos locales (de modo local o v4) los adoptamos y los subimos
        if (local?.data.profile.setup) { aplicar(local.data); ls.set(LS.dirty, "1"); subir(); return; }
        aplicar(remoto); setSync("ok");
      })
      .catch((err) => {
        if (cancel) return;
        if (err.message === "acceso_denegado") {
          setAuthError("acceso_denegado");
          ls.del(LS.email);
          setCuenta(null);
          return;
        }
        if (!mismoDueno) aplicar(datosPorDefecto(), false);
        setSync("error");
      });
    return () => { cancel = true; };
  }, [cuenta]);

  // Reintentos: al recuperar conexión y al salir de la app
  useEffect(() => {
    const online = () => ls.get(LS.dirty) === "1" && subir();
    const vis = () => document.visibilityState === "hidden" && ls.get(LS.dirty) === "1" && subir(true);
    window.addEventListener("online", online);
    document.addEventListener("visibilitychange", vis);
    return () => { window.removeEventListener("online", online); document.removeEventListener("visibilitychange", vis); };
  }, []);

  // update(fn | objeto): siempre parte del estado más reciente.
  function update(fn) {
    const nd = typeof fn === "function" ? fn(ref.current) : fn;
    if (!nd || nd === ref.current) return;
    aplicar(nd);
    if (cuentaRef.current?.modo === "google") {
      rev.current++;
      ls.set(LS.dirty, "1");
      clearTimeout(timer.current);
      timer.current = setTimeout(() => subir(), 1500);
    }
  }

  function loginGoogle(credential) {
    const p = leerJWT(credential);
    if (p.given_name) ls.set(LS.nameHint, p.given_name);
    ls.set(LS.email, p.email);
    ls.del(LS.mode);
    setAuthError(null);
    setCuenta({ modo: "google", email: p.email });
  }

  function usarLocal() {
    ls.set(LS.mode, "local");
    setAuthError(null);
    setCuenta({ modo: "local" });
  }

  async function salir() {
    const c = cuentaRef.current;
    if (c?.modo === "google") {
      if (ls.get(LS.dirty) === "1") await subir();
      if (ls.get(LS.dirty) !== "1") { ls.del(LS.data); ls.del(LS.owner); ls.del(LS.session); }
      ls.del(LS.email);
    } else {
      ls.del(LS.mode);
    }
    setCuenta(null);
  }

  return { cuenta, data, update, sync, subir, authError, loginGoogle, usarLocal, salir };
}
