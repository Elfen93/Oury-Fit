import { html } from "../lib.js";
import { DIAS_CORTOS, FRASES } from "../data.js";
import { hoy, rachas, rutinaDelDia, totalesDia, lunesDe, sumarDias, rutinaPorId, fechaLarga, fmtKg, r1, progresoSesion } from "../calc.js";
import { Icon, Ring, Bar, useApp, color } from "../ui.js";

export function Hoy() {
  const { data, update, go, sesion } = useApp();
  const k = hoy();
  const rut = rutinaDelDia(data, k);
  const hecho = data.registros[k];
  const cm = totalesDia(data.comidas[k]);
  const agua = data.agua[k] || 0;
  const { actual } = rachas(data);
  const h = new Date().getHours();
  const saludo = h < 6 ? "Buenas noches" : h < 13 ? "Buenos días" : h < 21 ? "Buenas tardes" : "Buenas noches";
  const frase = FRASES[new Date().getDate() % FRASES.length];
  const restante = Math.round(data.metas.calorias - cm.cal);
  const pesos = Object.entries(data.pesoCorporal).sort((a, b) => a[0].localeCompare(b[0]));
  const pesoActual = pesos.length ? pesos[pesos.length - 1][1] : data.profile.peso;
  const pesoInicial = pesos.length ? pesos[0][1] : data.profile.peso;
  const delta = r1(pesoActual - pesoInicial);
  const lunes = lunesDe(k);

  const sumarAgua = (n) => update((d) => ({ ...d, agua: { ...d.agua, [k]: Math.max(0, Math.round(((d.agua[k] || 0) + n) * 100) / 100) } }));

  return html`<div class="page">
    <header class="hello fade">
      <div>
        <div class="dim small">${fechaLarga(k).replace(/^./, (c) => c.toUpperCase())}</div>
        <h1 class="hello-name">${saludo}, ${data.profile.name}</h1>
      </div>
      <button class="chip-stat press" onClick=${() => go("progreso")} aria-label="Racha">
        <${Icon} n="flame" size=${20} style="color:var(--amber)"/>
        <div><b>${actual}</b><span>racha</span></div>
      </button>
    </header>
    <p class="quote">“${frase}”</p>

    ${sesion
      ? html`<${TarjetaEntreno} acento=${sesion.acento} eyebrow="Sesión en curso" titulo=${sesion.rutina}
          sub="${progresoSesion(sesion).hechas} de ${progresoSesion(sesion).total} series" icon="player-play-filled" onClick=${() => go("gym")}/>`
      : hecho
      ? html`<div class="card done-card fade">
          <div class="done-ic"><${Icon} n="check" size=${26}/></div>
          <div><b>Sesión completada</b><div class="small dim">${hecho.rutina}${hecho.volumen ? ` · ${Math.round(hecho.volumen).toLocaleString("es-ES")} kg movidos` : ""}</div></div>
        </div>`
      : rut
      ? html`<${TarjetaEntreno} acento=${rut.acento} eyebrow="Toca para entrenar" titulo=${rut.nombre}
          sub="${rut.ejercicios.length} ejercicios · ${rut.ejercicios.reduce((a, e) => a + e.series, 0)} series" icon="player-play-filled" onClick=${() => go("gym")}/>`
      : html`<div class="card rest-card fade">
          <div class="rest-ic"><${Icon} n="moon" size=${24}/></div>
          <div style="flex:1"><b>Día de descanso</b><div class="small dim">Camina, estira, duerme bien. Hoy también creces.</div></div>
          <button class="btn small ghost press" onClick=${() => go("gym")}>Entrenar</button>
        </div>`}

    <section class="card press fade" onClick=${() => go("comer")} role="button">
      <div class="card-head"><span class="label">Nutrición de hoy</span><${Icon} n="chevron-right" size=${18} class="faint"/></div>
      <div class="row" style="gap:18px;align-items:center">
        <${Ring} pct=${(cm.cal / data.metas.calorias) * 100}>
          <b class="ring-num">${Math.round(cm.cal)}</b><span class="ring-sub">/ ${data.metas.calorias} kcal</span>
        <//>
        <div style="flex:1;min-width:0">
          <div class="small dim" style="margin-bottom:10px">${restante >= 0 ? html`Te quedan <b class="lime">${restante}</b> kcal` : html`<b style="color:var(--rose)">${-restante}</b> kcal por encima`}</div>
          <${Macro} l="Proteína" v=${cm.prot} m=${data.metas.proteina} c="var(--cyan)"/>
          <${Macro} l="Carbos" v=${cm.carbs} m=${data.metas.carbs} c="var(--amber)"/>
          <${Macro} l="Grasa" v=${cm.grasa} m=${data.metas.grasa} c="var(--violet)"/>
        </div>
      </div>
    </section>

    <div class="grid2 fade">
      <section class="card tile">
        <div class="tile-top"><${Icon} n="droplet" size=${22} style="color:var(--cyan)"/><span class="faint small">de ${data.metas.agua} L</span></div>
        <div class="tile-num">${String(agua).replace(".", ",")}<small>L</small></div>
        <${Bar} pct=${(agua / data.metas.agua) * 100} color="var(--cyan)" h=${5}/>
        <div class="row" style="gap:6px;margin-top:10px">
          <button class="btn tiny ghost press" onClick=${() => sumarAgua(-0.25)} aria-label="Quitar 250 ml"><${Icon} n="minus" size=${16}/></button>
          <button class="btn tiny cyan press" onClick=${() => sumarAgua(0.25)}><${Icon} n="plus" size=${16}/> 250ml</button>
        </div>
      </section>
      <section class="card tile press" onClick=${() => go("progreso")} role="button">
        <div class="tile-top"><${Icon} n="scale" size=${22} style="color:var(--lime)"/><span class="faint small">meta ${fmtKg(data.metas.pesoObjetivo)} kg</span></div>
        <div class="tile-num">${fmtKg(pesoActual)}<small>kg</small></div>
        <div class="small ${delta === 0 ? "dim" : ""}" style="color:${delta === 0 ? "" : (delta > 0) === (data.metas.pesoObjetivo >= pesoInicial) ? "var(--lime)" : "var(--rose)"}">
          ${delta > 0 ? "+" : ""}${fmtKg(delta)} kg desde el inicio
        </div>
        <div class="small faint" style="margin-top:10px">Toca para registrar</div>
      </section>
    </div>

    <section class="card fade">
      <div class="card-head"><span class="label">Tu semana</span>
        <button class="link" onClick=${() => go("rutinas")}>Editar plan</button></div>
      <div class="week">
        ${DIAS_CORTOS.map((dl, i) => {
          const dk = sumarDias(lunes, i);
          const reg = data.registros[dk];
          const done = !!reg;
          const r = (done && rutinaPorId(data, reg.rutinaId)) || rutinaPorId(data, data.plan[i]);
          const esHoy = dk === k;
          const pasado = dk < k;
          const c = r ? color(r.acento) : "var(--faint)";
          return html`<div class="week-day ${esHoy ? "today" : ""}">
            <span class="week-l">${dl}</span>
            <div class="week-dot ${done ? "done" : ""} ${!done && pasado && r ? "miss" : ""}" style="--c:${c}">
              ${done ? html`<${Icon} n="check" size=${16}/>` : r ? html`<${Icon} n=${r.icon} size=${16}/>` : html`<${Icon} n="zzz" size=${14}/>`}
            </div>
            <span class="week-n">${r ? r.corto : "—"}</span>
          </div>`;
        })}
      </div>
    </section>
  </div>`;
}

function TarjetaEntreno({ acento, eyebrow, titulo, sub, icon, onClick }) {
  const c = color(acento);
  return html`<section class="card hero press fade" style="--c:${c}" onClick=${onClick} role="button">
    <div class="hero-glow"/>
    <div class="eyebrow" style="color:${c}">${eyebrow}</div>
    <div class="row" style="justify-content:space-between;align-items:flex-end;margin-top:12px">
      <div><div class="hero-title">${titulo}</div><div class="small dim" style="margin-top:4px">${sub}</div></div>
      <div class="hero-play"><${Icon} n=${icon} size=${24}/></div>
    </div>
  </section>`;
}

function Macro({ l, v, m, c }) {
  return html`<div style="margin-bottom:9px">
    <div class="row small" style="justify-content:space-between;margin-bottom:4px">
      <span class="dim">${l}</span><span><b>${Math.round(v)}</b><span class="faint">/${m}g</span></span>
    </div>
    <${Bar} pct=${(v / m) * 100} color=${c}/>
  </div>`;
}
