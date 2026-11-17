import { html, render, useState, useEffect, useRef } from "./lib.js";
import { LS } from "./data.js";
import { useStore, ls } from "./store.js";
import { Ctx, Icon, Spinner } from "./ui.js";
import { Login } from "./views/login.js";
import { Setup } from "./views/setup.js";
import { Hoy } from "./views/hoy.js";
import { Gym, useAhora } from "./views/gym.js";
import { Comer } from "./views/comer.js";
import { Progreso } from "./views/progreso.js";
import { Ajustes } from "./views/ajustes.js";
import { Rutinas } from "./views/rutinas.js";

const TABS = [
  { id: "hoy", l: "Hoy", icon: "home" },
  { id: "gym", l: "Gym", icon: "barbell" },
  { id: "comer", l: "Comer", icon: "salad" },
  { id: "progreso", l: "Progreso", icon: "chart-line" },
  { id: "ajustes", l: "Ajustes", icon: "settings" },
];
const VISTAS = { hoy: Hoy, gym: Gym, comer: Comer, progreso: Progreso, ajustes: Ajustes, rutinas: Rutinas };

// ── Aviso sonoro + vibración al terminar el descanso ──
let audio = null;
function prepararAudio() {
  try { audio = audio || new (window.AudioContext || window.webkitAudioContext)(); if (audio.state === "suspended") audio.resume(); } catch {}
}
function pitido() {
  try { navigator.vibrate?.([200, 100, 200]); } catch {}
  if (!audio) return;
  [0, 0.25].forEach((t) => {
    const o = audio.createOscillator(), g = audio.createGain();
    o.frequency.value = 880;
    g.gain.setValueAtTime(0.0001, audio.currentTime + t);
    g.gain.exponentialRampToValueAtTime(0.3, audio.currentTime + t + 0.02);
    g.gain.exponentialRampToValueAtTime(0.0001, audio.currentTime + t + 0.18);
    o.connect(g).connect(audio.destination);
    o.start(audio.currentTime + t); o.stop(audio.currentTime + t + 0.2);
  });
}

function Descanso({ rest, setRest }) {
  const ahora = useAhora(250, !!rest);
  const avisado = useRef(false);
  const quedan = rest ? Math.max(0, Math.ceil((rest.fin - ahora) / 1000)) : 0;

  useEffect(() => { avisado.current = false; }, [rest?.fin]);
  useEffect(() => {
    if (!rest || quedan > 0 || avisado.current) return;
    avisado.current = true;
    pitido();
    const t = setTimeout(() => setRest(null), 4000);
    return () => clearTimeout(t);
  }, [quedan, rest]);

  if (!rest) return null;
  const pct = 100 - (quedan / rest.total) * 100;
  const listo = quedan === 0;
  return html`<div class="rest ${listo ? "ready" : quedan <= 10 ? "near" : ""}" role="timer" aria-live="polite">
    <div class="rest-bar" style="width:${pct}%"/>
    <div class="rest-txt">
      <span class="small">${listo ? "¡A por la siguiente!" : "Descanso"}</span>
      <b>${Math.floor(quedan / 60)}:${String(quedan % 60).padStart(2, "0")}</b>
    </div>
    ${!listo && html`<button class="btn tiny ghost press" onClick=${() => setRest({ ...rest, fin: rest.fin + 15000, total: rest.total + 15 })}>+15s</button>`}
    <button class="btn tiny ghost press" onClick=${() => setRest(null)}>${listo ? "OK" : "Saltar"}</button>
  </div>`;
}

function App() {
  const store = useStore();
  const { cuenta, data, update, authError, loginGoogle, usarLocal } = store;
  const [vista, setVista] = useState("hoy");
  const [sesion, setSesionState] = useState(() => ls.json(LS.session));
  const [rest, setRest] = useState(null);
  const [aviso, setAviso] = useState(null);
  const avisoT = useRef();

  // Navegación con el botón "atrás" del móvil
  useEffect(() => {
    history.replaceState({ vista: "hoy" }, "");
    const pop = (e) => setVista(e.state?.vista || "hoy");
    window.addEventListener("popstate", pop);
    return () => window.removeEventListener("popstate", pop);
  }, []);
  useEffect(() => { window.scrollTo(0, 0); }, [vista]);

  function go(v) {
    if (v === vista) return;
    history.pushState({ vista: v }, "");
    setVista(v);
  }
  const back = () => (history.state?.vista && history.length > 1 ? history.back() : setVista("hoy"));

  function setSesion(s) {
    setSesionState(s);
    if (s) ls.set(LS.session, JSON.stringify(s)); else ls.del(LS.session);
  }

  function toast(msg, icon = "check") {
    clearTimeout(avisoT.current);
    setAviso({ msg, icon });
    avisoT.current = setTimeout(() => setAviso(null), 2600);
  }

  function startRest(seg) {
    if (!seg) return;
    prepararAudio();
    setRest({ fin: Date.now() + seg * 1000, total: seg });
  }

  if (!cuenta) return html`<${Login} onGoogle=${loginGoogle} onLocal=${usarLocal} error=${authError}/>`;
  if (!data) return html`<main class="center-screen"><${Spinner}/><p class="faint small" style="margin-top:14px">Cargando tus datos…</p></main>`;
  if (!data.profile.setup) return html`<${Setup} data=${data} update=${update}/>`;

  const Vista = VISTAS[vista] || Hoy;
  const ctx = { ...store, go, back, sesion, setSesion, startRest, stopRest: () => setRest(null), toast };
  const tabActiva = vista === "rutinas" ? "ajustes" : vista;

  return html`<${Ctx.Provider} value=${ctx}>
    ${store.sync === "error" && cuenta.modo === "google" && html`<button class="sync-pill press" onClick=${() => store.subir()}><${Icon} n="cloud-off" size=${14}/> Sin sincronizar · reintentar</button>`}
    ${aviso && html`<div class="toast" key=${aviso.msg}><${Icon} n=${aviso.icon} size=${18}/> ${aviso.msg}</div>`}
    <div class="shell ${rest ? "with-rest" : ""}"><${Vista} key=${vista}/></div>
    <${Descanso} rest=${rest} setRest=${setRest}/>
    <nav class="nav">
      ${TABS.map((t) => html`<button class="press ${tabActiva === t.id ? "on" : ""}" onClick=${() => go(t.id)} aria-label=${t.l}>
        <${Icon} n=${t.icon} size=${21}/>
        <span>${t.l}</span>
        ${t.id === "gym" && sesion && tabActiva !== "gym" && html`<i class="dot"/>`}
      </button>`)}
    </nav>
  <//>`;
}

render(html`<${App}/>`, document.getElementById("root"));

if ("serviceWorker" in navigator && location.protocol === "https:") {
  navigator.serviceWorker.register("./sw.js").catch(() => {});
}
