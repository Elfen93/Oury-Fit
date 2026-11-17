import { html, useState } from "../lib.js";
import { OBJETIVOS, calcularMetas, LS } from "../data.js";
import { diasEntreno, hoy } from "../calc.js";
import { ls } from "../store.js";
import { Icon } from "../ui.js";
import { Logo } from "./login.js";

export function Setup({ data, update }) {
  const [paso, setPaso] = useState(0);
  const [v, setV] = useState({
    name: data.profile.name || ls.get(LS.nameHint) || "",
    sexo: data.profile.sexo || "h",
    edad: data.profile.edad || "",
    peso: data.profile.peso || "",
    altura: data.profile.altura || "",
    objetivo: data.profile.objetivo || "ganar",
  });
  const set = (k, val) => setV({ ...v, [k]: val });
  const metas = calcularMetas(v, diasEntreno(data));

  const pasos = [
    { t: "¿Cómo te llamas?", s: "Para saludarte cada día.", ok: v.name.trim().length > 0 },
    { t: "Sobre ti", s: "Para calcular tu metabolismo basal.", ok: +v.edad > 12 && +v.edad < 100 },
    { t: "Tus medidas", s: "Peso y altura actuales.", ok: +v.peso > 30 && +v.peso < 300 && +v.altura > 100 && +v.altura < 250 },
    { t: "Tu objetivo", s: "Ajusta calorías y proteína.", ok: true },
    { t: "Tu plan", s: "Puedes cambiar todo esto luego en Ajustes.", ok: true },
  ];
  const cur = pasos[paso];

  function terminar() {
    update((d) => ({
      ...d,
      profile: { ...d.profile, name: v.name.trim(), sexo: v.sexo, edad: +v.edad, peso: +v.peso, altura: +v.altura, objetivo: v.objetivo, setup: true },
      metas,
      pesoCorporal: Object.keys(d.pesoCorporal).length ? d.pesoCorporal : { [hoy()]: +v.peso },
    }));
  }

  return html`<main class="page narrow" style="padding-top:3rem">
    <div style="text-align:center;margin-bottom:28px"><${Logo} size=${56}/></div>
    <div class="steps">${pasos.map((_, i) => html`<div class=${i <= paso ? "on" : ""}/>`)}</div>

    <div class="fade" key=${paso}>
      <h1 style="font-size:26px">${cur.t}</h1>
      <p class="dim" style="margin:4px 0 22px">${cur.s}</p>

      ${paso === 0 && html`<input class="big" autofocus placeholder="Tu nombre" value=${v.name} onInput=${(e) => set("name", e.target.value)}/>`}

      ${paso === 1 && html`<div class="stack">
        <div class="seg">
          ${[["h", "Hombre", "gender-male"], ["m", "Mujer", "gender-female"]].map(([k, l, ic]) => html`
            <button class=${v.sexo === k ? "on" : ""} onClick=${() => set("sexo", k)}><${Icon} n=${ic} size=${18}/> ${l}</button>`)}
        </div>
        <label class="field"><span>Edad</span><input type="number" inputmode="numeric" placeholder="años" value=${v.edad} onInput=${(e) => set("edad", e.target.value)}/></label>
      </div>`}

      ${paso === 2 && html`<div class="grid2">
        <label class="field"><span>Peso (kg)</span><input type="number" inputmode="decimal" placeholder="70" value=${v.peso} onInput=${(e) => set("peso", e.target.value)}/></label>
        <label class="field"><span>Altura (cm)</span><input type="number" inputmode="numeric" placeholder="175" value=${v.altura} onInput=${(e) => set("altura", e.target.value)}/></label>
      </div>`}

      ${paso === 3 && html`<div class="stack">
        ${Object.entries(OBJETIVOS).map(([k, o]) => html`<button class="option press ${v.objetivo === k ? "on" : ""}" onClick=${() => set("objetivo", k)}>
          <div><b>${o.l}</b><div class="small dim">${o.d}</div></div>
          ${v.objetivo === k && html`<${Icon} n="circle-check-filled" size=${22}/>`}
        </button>`)}
      </div>`}

      ${paso === 4 && html`<div class="card">
        <div class="kv"><span>Calorías</span><b>${metas.calorias} kcal</b></div>
        <div class="kv"><span>Proteína</span><b>${metas.proteina} g</b></div>
        <div class="kv"><span>Carbohidratos</span><b>${metas.carbs} g</b></div>
        <div class="kv"><span>Grasa</span><b>${metas.grasa} g</b></div>
        <div class="kv"><span>Agua</span><b>${metas.agua} L</b></div>
        <div class="kv"><span>Peso objetivo</span><b>${metas.pesoObjetivo} kg</b></div>
        <p class="faint small" style="margin-top:12px">Estimación con Mifflin-St Jeor y ${diasEntreno(data)} entrenos por semana. Es un punto de partida: ajústalo según cómo responda tu cuerpo.</p>
      </div>`}
    </div>

    <div class="row" style="margin-top:28px">
      ${paso > 0 && html`<button class="btn ghost press" style="flex:0 0 auto" onClick=${() => setPaso(paso - 1)}>Atrás</button>`}
      <button class="btn primary press" disabled=${!cur.ok} onClick=${() => (paso < pasos.length - 1 ? setPaso(paso + 1) : terminar())}>
        ${paso < pasos.length - 1 ? "Continuar" : "Empezar"}
      </button>
    </div>
  </main>`;
}
