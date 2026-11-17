import { html, useState, useRef } from "../lib.js";
import { OBJETIVOS, calcularMetas, migrar } from "../data.js";
import { diasEntreno, aCSV, descargar, hoy } from "../calc.js";
import { Icon, TopBar, Section, useApp, Spinner } from "../ui.js";
import { importarDeSheets } from "../store.js";

export function Ajustes() {
  const { data, update, go, cuenta, sync, subir, salir, toast } = useApp();
  const [p, setP] = useState({ ...data.profile });
  const fileRef = useRef();
  const [sheetsEmail, setSheetsEmail] = useState("");
  const [importando, setImportando] = useState(false);
  const cambiado = ["name", "sexo", "edad", "peso", "altura", "objetivo"].some((k) => String(p[k]) !== String(data.profile[k]));
  const sugeridas = calcularMetas(p, diasEntreno(data));

  function guardarPerfil() {
    update((d) => ({ ...d, profile: { ...d.profile, ...p, edad: +p.edad, peso: +p.peso, altura: +p.altura } }));
    toast("Perfil guardado");
  }

  function aplicarMetas() {
    if (!confirm(`¿Sustituir tus metas por las calculadas?\n\n${sugeridas.calorias} kcal · P${sugeridas.proteina} C${sugeridas.carbs} G${sugeridas.grasa}`)) return;
    update((d) => ({ ...d, metas: sugeridas }));
    toast("Metas actualizadas");
  }

  const setMeta = (k, v) => update((d) => ({ ...d, metas: { ...d.metas, [k]: Math.max(0, +String(v).replace(",", ".") || 0) } }));

  function importar(e) {
    const f = e.target.files?.[0];
    if (!f) return;
    const rd = new FileReader();
    rd.onload = () => {
      try {
        const raw = JSON.parse(rd.result);
        const nd = migrar(raw.data || raw);
        if (!confirm(`Se importarán ${Object.keys(nd.registros).length} entrenos y ${Object.keys(nd.comidas).length} días de comidas.\nEsto SUSTITUYE tus datos actuales. ¿Continuar?`)) return;
        update(nd);
        toast("Datos importados");
      } catch {
        alert("El archivo no es una copia válida de OuryFit.");
      }
      e.target.value = "";
    };
    rd.readAsText(f);
  }

  async function deSheets() {
    if (!sheetsEmail.includes("@")) return;
    setImportando(true);
    try {
      const nd = await importarDeSheets(sheetsEmail.trim());
      const n = Object.keys(nd.registros).length, c = Object.keys(nd.comidas).length;
      if (!n && !c && !nd.profile.setup) { alert("La hoja está vacía para ese email."); return; }
      if (!confirm(`En la hoja hay ${n} entrenos y ${c} días de comidas.\nEsto SUSTITUYE tus datos actuales (puedes hacer antes una copia JSON). ¿Importar?`)) return;
      update(nd);
      toast("Datos de Google Sheets importados");
    } catch (e) {
      alert("No se pudo leer la hoja: " + (e.message || e));
    } finally { setImportando(false); }
  }

  const syncTxt = {
    cargando: ["refresh", "Cargando…", "var(--dim)"],
    guardando: ["refresh", "Guardando…", "var(--dim)"],
    ok: ["cloud-check", "Sincronizado", "var(--lime)"],
    error: ["cloud-off", "Sin conexión. Los cambios están a salvo en este dispositivo y se subirán solos.", "var(--rose)"],
    idle: ["cloud", "Pendiente", "var(--dim)"],
  }[sync] || ["cloud", "", "var(--dim)"];

  return html`<div class="page">
    <${TopBar} titulo="Ajustes"/>

    <${Section} titulo="Cuenta">
      ${cuenta?.modo === "neon"
        ? html`<div class="kv"><span>Cuenta</span><b class="small" style="word-break:break-all">${cuenta.email}</b></div>
          <div class="kv"><span class="row" style="gap:6px;align-items:center;color:${syncTxt[2]}"><${Icon} n=${syncTxt[0]} size=${17}/> ${syncTxt[1]}</span>
            <button class="btn tiny ghost press" onClick=${() => subir()}>Sincronizar</button></div>`
        : html`<p class="small dim">Modo local: los datos solo están en este navegador. Para no perderlos, haz copias de seguridad o entra con tu cuenta (se subirán si aún no hay nada guardado).</p>`}
      <button class="btn ghost press" style="margin-top:12px" onClick=${() => confirm(cuenta?.modo === "neon" ? "¿Cerrar sesión en este dispositivo?" : "¿Salir del modo local? Tus datos se quedan guardados en este navegador.") && salir()}>
        <${Icon} n="logout" size=${17}/> ${cuenta?.modo === "neon" ? "Cerrar sesión" : "Salir / entrar con mi cuenta"}
      </button>
    <//>

    <${Section} titulo="Perfil">
      <div class="grid2">
        <label class="field"><span>Nombre</span><input value=${p.name} onInput=${(e) => setP({ ...p, name: e.target.value })}/></label>
        <label class="field"><span>Sexo</span><select value=${p.sexo} onChange=${(e) => setP({ ...p, sexo: e.target.value })}><option value="h">Hombre</option><option value="m">Mujer</option></select></label>
        <label class="field"><span>Edad</span><input type="number" inputmode="numeric" value=${p.edad} onInput=${(e) => setP({ ...p, edad: e.target.value })}/></label>
        <label class="field"><span>Altura (cm)</span><input type="number" inputmode="numeric" value=${p.altura} onInput=${(e) => setP({ ...p, altura: e.target.value })}/></label>
        <label class="field"><span>Peso (kg)</span><input type="number" inputmode="decimal" value=${p.peso} onInput=${(e) => setP({ ...p, peso: e.target.value })}/></label>
        <label class="field"><span>Objetivo</span><select value=${p.objetivo} onChange=${(e) => setP({ ...p, objetivo: e.target.value })}>
          ${Object.entries(OBJETIVOS).map(([k, o]) => html`<option value=${k}>${o.l}</option>`)}</select></label>
      </div>
      ${cambiado && html`<button class="btn primary press" onClick=${guardarPerfil}>Guardar perfil</button>`}
    <//>

    <${Section} titulo="Metas diarias">
      <div class="grid2">
        ${[["calorias", "Calorías (kcal)"], ["proteina", "Proteína (g)"], ["carbs", "Carbos (g)"], ["grasa", "Grasa (g)"], ["agua", "Agua (L)"], ["pesoObjetivo", "Peso objetivo (kg)"]].map(([k, l]) => html`
          <label class="field"><span>${l}</span><input type="number" inputmode="decimal" step=${k === "agua" ? 0.25 : 1} value=${data.metas[k]} onChange=${(e) => setMeta(k, e.target.value)}/></label>`)}
      </div>
      <div class="note" style="margin:4px 0 12px">
        <${Icon} n="calculator" size=${18}/>
        <span>Según tu perfil y ${diasEntreno(data)} entrenos/semana: <b>${sugeridas.calorias} kcal</b> · P${sugeridas.proteina} · C${sugeridas.carbs} · G${sugeridas.grasa}</span>
      </div>
      <button class="btn ghost press" onClick=${aplicarMetas}>Usar metas calculadas</button>
    <//>

    <${Section} titulo="Entrenamiento">
      <button class="btn ghost press" onClick=${() => go("rutinas")}><${Icon} n="list-details" size=${17}/> Editar rutinas y plan semanal</button>
    <//>

    <${Section} titulo="Tus datos">
      <div class="stack">
        <button class="btn ghost press" onClick=${() => descargar(`ouryfit-${hoy()}.json`, JSON.stringify({ app: "ouryfit", exportado: new Date().toISOString(), data }, null, 2), "application/json")}>
          <${Icon} n="download" size=${17}/> Copia de seguridad (JSON)</button>
        <button class="btn ghost press" onClick=${() => fileRef.current.click()}><${Icon} n="upload" size=${17}/> Restaurar copia</button>
        <button class="btn ghost press" onClick=${() => descargar(`ouryfit-${hoy()}.csv`, "﻿" + aCSV(data), "text/csv;charset=utf-8")}>
          <${Icon} n="table-export" size=${17}/> Exportar CSV (Excel / Sheets)</button>
      </div>
      <details class="more" style="margin-top:14px"><summary>Importar desde Google Sheets (versión anterior)</summary>
        <p class="small dim" style="margin:8px 0">Trae los datos que quedaron en tu hoja de Google. Escribe el email con el que entrabas.</p>
        <div class="row" style="gap:8px">
          <input type="email" placeholder="tu@gmail.com" value=${sheetsEmail} onInput=${(e) => setSheetsEmail(e.target.value)} style="flex:1"/>
          <button class="btn small ghost press" disabled=${importando || !sheetsEmail.includes("@")} onClick=${deSheets}>${importando ? html`<${Spinner} size=${16}/>` : "Importar"}</button>
        </div>
      </details>
      <input ref=${fileRef} type="file" accept="application/json,.json" style="display:none" onChange=${importar}/>
    <//>

    <p class="small faint" style="text-align:center;margin:8px 0 0">OuryFit · v5</p>
  </div>`;
}
