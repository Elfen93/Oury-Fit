import { html, useState } from "../lib.js";
import { Icon, Spinner } from "../ui.js";

export function Logo({ size = 72 }) {
  return html`<div class="logo" style="width:${size}px;height:${size}px;border-radius:${size * 0.3}px">
    <${Icon} n="bolt" size=${size * 0.52}/>
  </div>`;
}

export function Login({ onLogin, onLocal, error }) {
  const [crear, setCrear] = useState(false);
  const [email, setEmail] = useState("");
  const [pw, setPw] = useState("");
  const [ver, setVer] = useState(false);
  const [cargando, setCargando] = useState(false);
  const [fallo, setFallo] = useState(null);
  const ok = /\S+@\S+\.\S+/.test(email) && pw.length >= 8;

  async function enviar(e) {
    e.preventDefault();
    if (!ok || cargando) return;
    setCargando(true); setFallo(null);
    try { await onLogin(email, pw, crear); }
    catch (err) { setFallo(err.message || "No se pudo conectar."); setCargando(false); }
  }

  return html`<main class="center-screen fade">
    <${Logo}/>
    <div class="brand">OURYFIT</div>
    <p class="dim" style="margin-bottom:30px">Entreno, comida y progreso. Todo en uno.</p>

    ${error === "sesion" && html`<div class="alert">Tu sesión ha caducado. Vuelve a entrar; tus datos siguen en este dispositivo.</div>`}

    <form class="card" style="max-width:340px;width:100%;text-align:left;padding:24px" onSubmit=${enviar}>
      <h2 style="margin-bottom:4px">${crear ? "Crear tu cuenta" : "Entrar"}</h2>
      <p class="dim small" style="margin-bottom:18px">${crear ? "Solo la primera vez. Después se desactivan los registros." : "Tus datos se sincronizan entre dispositivos."}</p>
      <label class="field"><span>Email</span>
        <input type="email" autocomplete="email" inputmode="email" value=${email} onInput=${(e) => setEmail(e.target.value)}/></label>
      <label class="field" style="margin-top:8px"><span>Contraseña</span>
        <div style="position:relative">
          <input type=${ver ? "text" : "password"} autocomplete=${crear ? "new-password" : "current-password"} value=${pw}
            onInput=${(e) => setPw(e.target.value)} style="padding-right:46px"/>
          <button type="button" class="pw-eye" onClick=${() => setVer(!ver)} aria-label=${ver ? "Ocultar contraseña" : "Mostrar contraseña"}>
            <${Icon} n=${ver ? "eye-off" : "eye"} size=${18}/></button>
        </div></label>
      ${crear && pw.length > 0 && pw.length < 8 && html`<p class="small" style="color:var(--amber);margin-top:6px">Mínimo 8 caracteres.</p>`}
      ${fallo && html`<p class="small" style="color:var(--rose);margin-top:10px">${fallo}</p>`}
      <button type="submit" class="btn primary press" style="margin-top:16px" disabled=${!ok || cargando}>
        ${cargando ? html`<${Spinner} size=${18}/>` : crear ? "Crear cuenta" : "Entrar"}
      </button>
      <button type="button" class="link" style="display:block;margin:14px auto 0" onClick=${() => { setCrear(!crear); setFallo(null); }}>
        ${crear ? "Ya tengo cuenta" : "Primera vez: crear cuenta"}
      </button>
      <div class="divider"><span>o</span></div>
      <button type="button" class="btn ghost press" onClick=${onLocal}><${Icon} n="device-mobile" size=${18}/> Usar solo en este dispositivo</button>
      <p class="faint small" style="margin-top:10px;text-align:center">Sin cuenta, los datos se quedan en este navegador. Puedes entrar más tarde y se suben.</p>
    </form>
  </main>`;
}
