// ── Almacenamiento: local primero, sincronización con Neon ──────────────
import { useState, useEffect, useRef } from "./lib.js";
import { LS, SHEETS_URL_ANTIGUA, datosPorDefecto, migrar, deHoja } from "./data.js";
import * as neon from "./neon.js";

export const ls = {
  get(k) { try { return localStorage.getItem(k); } catch { return null; } },
  set(k, v) { try { localStorage.setItem(k, v); } catch {} },
  del(k) { try { localStorage.removeItem(k); } catch {} },
  json(k) { try { const r = localStorage.getItem(k); return r ? JSON.parse(r) : null; } catch { return null; } },
};

// Importación única de los datos que quedaron en la hoja de Google (app v4).
export async function importarDeSheets(email) {
  const r = await fetch(`${SHEETS_URL_ANTIGUA}?action=load&email=${encodeURIComponent(email)}`);
  const j = await r.json();
  if (j.status === "error") throw new Error(j.error === "acceso_denegado" ? "Ese email no tiene acceso a la hoja." : j.error || "Error");
  return deHoja(j.data || {});
}

function cuentaInicial() {
  const modo = ls.get(LS.mode);
  const email = ls.get(LS.email);
  if (modo === "neon" && email) return { modo: "neon", email };
  if (modo === "local") return { modo: "local" };
  return null;
}

function cargarLocal() {
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
      ls.set(LS.owner, c?.modo === "neon" ? c.email : "local");
    }
  }

  function sesionPerdida() {
    // Los datos siguen en el dispositivo; al volver a entrar se suben.
    ls.del(LS.mode);
    setAuthError("sesion");
    setCuenta(null);
  }

  async function subir() {
    if (cuentaRef.current?.modo !== "neon" || !ref.current) return;
    clearTimeout(timer.current);
    const v = rev.current;
    setSync("guardando");
    try {
      await neon.guardarDatos(ref.current);
      if (rev.current === v) ls.del(LS.dirty);
      setSync("ok");
    } catch (e) {
      if (e instanceof neon.SinSesion) return sesionPerdida();
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

    neon.cargarDatos()
      .then((fila) => {
        if (cancel) return;
        if (pendiente) { subir(); return; } // cambios locales sin subir: mandan ellos
        if (fila?.data) { aplicar(migrar(fila.data)); setSync("ok"); return; }
        // Base de datos vacía: adoptamos lo que haya en el dispositivo (modo local, v4 o la versión con Sheets)
        aplicar(local?.data || datosPorDefecto());
        if (local?.data.profile.setup) { ls.set(LS.dirty, "1"); subir(); } else setSync("ok");
      })
      .catch((e) => {
        if (cancel) return;
        if (e instanceof neon.SinSesion) return sesionPerdida();
        if (!mismoDueno) aplicar(datosPorDefecto(), false);
        setSync("error"); // sin conexión: se sigue usando lo local
      });
    return () => { cancel = true; };
  }, [cuenta]);

  // Reintentos: al recuperar conexión y al volver a la app
  useEffect(() => {
    const reintentar = () => ls.get(LS.dirty) === "1" && subir();
    const vis = () => reintentar();
    window.addEventListener("online", reintentar);
    document.addEventListener("visibilitychange", vis);
    return () => { window.removeEventListener("online", reintentar); document.removeEventListener("visibilitychange", vis); };
  }, []);

  // update(fn | objeto): siempre parte del estado más reciente.
  function update(fn) {
    const nd = typeof fn === "function" ? fn(ref.current) : fn;
    if (!nd || nd === ref.current) return;
    aplicar(nd);
    if (cuentaRef.current?.modo === "neon") {
      rev.current++;
      ls.set(LS.dirty, "1");
      clearTimeout(timer.current);
      timer.current = setTimeout(() => subir(), 1500);
    }
  }

  async function login(email, password, crear) {
    email = email.trim().toLowerCase();
    if (crear) await neon.registrar(email, password);
    else await neon.entrar(email, password);
    ls.set(LS.email, email);
    ls.set(LS.mode, "neon");
    setAuthError(null);
    setCuenta({ modo: "neon", email });
  }

  function usarLocal() {
    ls.set(LS.mode, "local");
    setAuthError(null);
    setCuenta({ modo: "local" });
  }

  async function salir() {
    const c = cuentaRef.current;
    if (c?.modo === "neon") {
      if (ls.get(LS.dirty) === "1") await subir();
      await neon.salir();
      // Solo se borra la copia local si todo está subido
      if (ls.get(LS.dirty) !== "1") { ls.del(LS.data); ls.del(LS.owner); ls.del(LS.session); }
    }
    ls.del(LS.mode);
    setCuenta(null);
  }

  return { cuenta, data, update, sync, subir, authError, login, usarLocal, salir };
}
