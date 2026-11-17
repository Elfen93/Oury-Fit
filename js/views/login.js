import { html, useEffect, useState, useRef } from "../lib.js";
import { CLIENT_ID } from "../data.js";
import { Icon, Spinner } from "../ui.js";

export function Logo({ size = 72 }) {
  return html`<div class="logo" style="width:${size}px;height:${size}px;border-radius:${size * 0.3}px">
    <${Icon} n="bolt" size=${size * 0.52}/>
  </div>`;
}

export function Login({ onGoogle, onLocal, error }) {
  const [estado, setEstado] = useState("cargando"); // cargando | listo | sin-google
  const btn = useRef();

  useEffect(() => {
    let intentos = 0, t;
    const s = document.createElement("script");
    s.src = "https://accounts.google.com/gsi/client";
    s.async = true;
    document.head.appendChild(s);
    function init() {
      if (window.google?.accounts?.id) {
        window.google.accounts.id.initialize({ client_id: CLIENT_ID, callback: (r) => onGoogle(r.credential), ux_mode: "popup" });
        window.google.accounts.id.renderButton(btn.current, { theme: "filled_black", size: "large", width: 260, text: "continue_with", shape: "pill" });
        setEstado("listo");
      } else if (++intentos < 30) t = setTimeout(init, 300);
      else setEstado("sin-google");
    }
    init();
    return () => clearTimeout(t);
  }, []);

  return html`<main class="center-screen fade">
    <${Logo}/>
    <div class="brand">OURYFIT</div>
    <p class="dim" style="margin-bottom:36px">Entreno, comida y progreso. Todo en uno.</p>

    ${error === "acceso_denegado" && html`<div class="alert">Este email no tiene acceso a la hoja de OuryFit.</div>`}

    <div class="card" style="max-width:340px;width:100%;text-align:center;padding:26px">
      <h2 style="margin-bottom:6px">Entra con Google</h2>
      <p class="dim small" style="margin-bottom:20px">Tus datos se guardan en tu hoja de Google y se sincronizan entre dispositivos.</p>
      <div ref=${btn} class="gbtn">${estado === "cargando" && html`<${Spinner} size=${24}/>`}</div>
      ${estado === "sin-google" && html`<p class="small" style="color:var(--rose)">No se pudo cargar Google. Revisa la conexión.</p>`}
      <div class="divider"><span>o</span></div>
      <button class="btn ghost press" onClick=${onLocal}><${Icon} n="device-mobile" size=${18}/> Usar solo en este dispositivo</button>
      <p class="faint small" style="margin-top:10px">Sin cuenta. Los datos se quedan en este navegador; puedes pasarlos a Google más tarde.</p>
    </div>
  </main>`;
}
