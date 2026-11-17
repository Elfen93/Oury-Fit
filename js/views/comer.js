import { html, useState } from "../lib.js";
import { ALIMENTOS, uid } from "../data.js";
import { hoy, sumarDias, fechaRelativa, totalesDia, itemDesdeAlimento, anadirItem, quitarItem, r1 } from "../calc.js";
import { Icon, Bar, TopBar, Sheet, Stepper, useApp, Empty } from "../ui.js";

const fmtCant = (c) => (c === 0.5 ? "½" : c === 1.5 ? "1½" : String(c).replace(".", ","));

export function Comer() {
  const { data, update, toast } = useApp();
  const [dia, setDia] = useState(hoy());
  const [tab, setTab] = useState("buscar");
  const [busca, setBusca] = useState("");
  const [elegido, setElegido] = useState(null);
  const [cant, setCant] = useState(1);
  const [m, setM] = useState({ n: "", g: "", cal: "", p: "", c: "", gr: "", guardar: true });

  const cm = totalesDia(data.comidas[dia]);
  const agua = data.agua[dia] || 0;
  const esHoy = dia === hoy();
  const lista = [...data.alimentos.map((a) => ({ ...a, propio: true })), ...ALIMENTOS];
  const q = busca.trim().toLowerCase();
  const filt = q ? lista.filter((a) => a.n.toLowerCase().includes(q)) : lista;
  const ayer = totalesDia(data.comidas[sumarDias(dia, -1)]);

  const setDiaComida = (fn) => update((d) => ({ ...d, comidas: { ...d.comidas, [dia]: fn(d.comidas[dia]) } }));
  const sumarAgua = (n) => update((d) => ({ ...d, agua: { ...d.agua, [dia]: Math.max(0, Math.round(((d.agua[dia] || 0) + n) * 100) / 100) } }));

  function confirmar() {
    setDiaComida((x) => anadirItem(x, itemDesdeAlimento(elegido, cant)));
    toast(`${elegido.n} añadido`);
    setElegido(null);
  }

  function manual() {
    if (!m.cal) return;
    const a = { n: m.n.trim() || "Comida", g: m.g.trim() || "1 ración", cal: +m.cal || 0, p: +m.p || 0, c: +m.c || 0, gr: +m.gr || 0 };
    update((d) => ({
      ...d,
      comidas: { ...d.comidas, [dia]: anadirItem(d.comidas[dia], itemDesdeAlimento(a, 1)) },
      alimentos: m.guardar && m.n.trim() && !d.alimentos.some((x) => x.n === a.n) ? [{ id: uid(), ...a }, ...d.alimentos] : d.alimentos,
    }));
    toast(`${a.n} añadido`);
    setM({ n: "", g: "", cal: "", p: "", c: "", gr: "", guardar: true });
  }

  function copiarAyer() {
    update((d) => {
      let x = d.comidas[dia];
      for (const it of ayer.items) x = anadirItem(x, { ...it, id: uid() });
      return { ...d, comidas: { ...d.comidas, [dia]: x } };
    });
    toast(`${ayer.items.length} alimentos copiados`);
  }

  function borrarPropio(a) {
    if (!confirm(`¿Quitar "${a.n}" de tus alimentos?`)) return;
    update((d) => ({ ...d, alimentos: d.alimentos.filter((x) => x.n !== a.n) }));
  }

  const macros = [
    { l: "Kcal", v: cm.cal, m: data.metas.calorias, c: "var(--lime)" },
    { l: "Prot", v: cm.prot, m: data.metas.proteina, c: "var(--cyan)" },
    { l: "Carb", v: cm.carbs, m: data.metas.carbs, c: "var(--amber)" },
    { l: "Grasa", v: cm.grasa, m: data.metas.grasa, c: "var(--violet)" },
  ];

  return html`<div class="page">
    <${TopBar} titulo="Nutrición" sub="Lo que comes"/>

    <div class="daynav">
      <button class="icon-btn press" onClick=${() => setDia(sumarDias(dia, -1))} aria-label="Día anterior"><${Icon} n="chevron-left"/></button>
      <button class="daynav-l" onClick=${() => setDia(hoy())}>${fechaRelativa(dia)}</button>
      <button class="icon-btn press" disabled=${esHoy} onClick=${() => setDia(sumarDias(dia, 1))} aria-label="Día siguiente"><${Icon} n="chevron-right"/></button>
    </div>

    <div class="grid4">
      ${macros.map((x) => html`<div class="card mini">
        <span class="label">${x.l}</span>
        <b>${Math.round(x.v)}</b>
        <${Bar} pct=${(x.v / x.m) * 100} color=${x.c} h=${4}/>
        <span class="faint small">/${x.m}</span>
      </div>`)}
    </div>

    <section class="card" style="border-color:color-mix(in srgb,var(--cyan) 25%,var(--line))">
      <div class="row" style="justify-content:space-between;align-items:center">
        <div class="row" style="gap:12px;align-items:center">
          <div class="sq-ic" style="color:var(--cyan)"><${Icon} n="droplet" size=${22}/></div>
          <div><b style="font-size:20px">${String(agua).replace(".", ",")}</b><span class="dim small"> / ${data.metas.agua} L</span><div class="small dim">Hidratación</div></div>
        </div>
        <div class="row" style="gap:8px">
          <button class="icon-btn press" onClick=${() => sumarAgua(-0.25)} aria-label="Quitar 250 ml"><${Icon} n="minus"/></button>
          <button class="icon-btn press filled-cyan" onClick=${() => sumarAgua(0.25)} aria-label="Añadir 250 ml"><${Icon} n="plus"/></button>
        </div>
      </div>
      <div style="margin-top:14px"><${Bar} pct=${(agua / data.metas.agua) * 100} color="var(--cyan)"/></div>
    </section>

    ${cm.items.length > 0 && html`<section class="card">
      <div class="card-head"><span class="label">Comido ${esHoy ? "hoy" : fechaRelativa(dia).toLowerCase()}</span><span class="small faint">${cm.items.length}</span></div>
      ${cm.items.map((it) => html`<div class="item">
        <div style="min-width:0">
          <div class="item-n">${it.n}${it.cant && it.cant !== 1 ? html` <span class="faint">×${fmtCant(it.cant)}</span>` : ""}</div>
          <div class="small dim">${Math.round(it.cal)} kcal${it.p != null ? ` · P${Math.round(it.p)} C${Math.round(it.c)} G${Math.round(it.gr)}` : ""}</div>
        </div>
        <button class="icon-btn sm danger press" onClick=${() => setDiaComida((x) => quitarItem(x, it.id))} aria-label="Quitar ${it.n}"><${Icon} n="x" size=${17}/></button>
      </div>`)}
    </section>`}

    ${cm.items.length === 0 && ayer.items.length > 0 && html`<button class="btn ghost press" style="margin-bottom:14px" onClick=${copiarAyer}>
      <${Icon} n="copy" size=${17}/> Repetir lo del día anterior (${ayer.items.length})
    </button>`}

    <div class="seg" style="margin-bottom:14px">
      ${[["buscar", "Alimentos"], ["manual", "Manual"]].map(([id, l]) => html`<button class=${tab === id ? "on" : ""} onClick=${() => setTab(id)}>${l}</button>`)}
    </div>

    ${tab === "buscar" && html`<div>
      <div class="search">
        <${Icon} n="search" size=${18}/>
        <input placeholder="Buscar alimento..." value=${busca} onInput=${(e) => setBusca(e.target.value)}/>
      </div>
      ${filt.map((a) => html`<div class="food press" onClick=${() => { setElegido(a); setCant(1); }} role="button">
        <div style="min-width:0">
          <div class="item-n">${a.n} <span class="faint small" style="font-weight:400">· ${a.g}</span>${a.propio ? html` <span class="tag">tuyo</span>` : ""}</div>
          <div class="small dim"><b class="lime">${a.cal} kcal</b> · P${a.p} C${a.c} G${a.gr}</div>
        </div>
        <div class="add-ic"><${Icon} n="plus" size=${19}/></div>
      </div>`)}
      ${filt.length === 0 && html`<${Empty} icon="search">Sin resultados. <button class="link" onClick=${() => { setTab("manual"); setM({ ...m, n: busca }); }}>Añádelo a mano</button><//>`}
    </div>`}

    ${tab === "manual" && html`<section class="card">
      <div class="grid2">
        <label class="field"><span>Nombre</span><input placeholder="Ej: Tortilla" value=${m.n} onInput=${(e) => setM({ ...m, n: e.target.value })}/></label>
        <label class="field"><span>Ración</span><input placeholder="1 plato" value=${m.g} onInput=${(e) => setM({ ...m, g: e.target.value })}/></label>
        ${[["cal", "Calorías"], ["p", "Proteína (g)"], ["c", "Carbos (g)"], ["gr", "Grasa (g)"]].map(([k, l]) => html`
          <label class="field"><span>${l}</span><input type="number" inputmode="decimal" value=${m[k]} onInput=${(e) => setM({ ...m, [k]: e.target.value })}/></label>`)}
      </div>
      <label class="check"><input type="checkbox" checked=${m.guardar} onChange=${(e) => setM({ ...m, guardar: e.target.checked })}/> Guardar en mis alimentos</label>
      <button class="btn primary press" disabled=${!m.cal} onClick=${manual}>Añadir</button>
    </section>`}

    <${Sheet} abierto=${!!elegido} onClose=${() => setElegido(null)} titulo=${elegido?.n || ""}>
      ${elegido && html`<div>
        <p class="dim small" style="margin-bottom:14px">Ración: ${elegido.g}</p>
        <${Stepper} value=${cant} step=${0.5} min=${0.5} onChange=${setCant} fmt=${(v) => `${fmtCant(v)} ración${v === 1 ? "" : "es"}`}/>
        <div class="grid4" style="margin:16px 0">
          ${[["kcal", elegido.cal], ["P", elegido.p], ["C", elegido.c], ["G", elegido.gr]].map(([l, v]) => html`<div class="card mini"><span class="label">${l}</span><b>${Math.round(r1(v * cant))}</b></div>`)}
        </div>
        <button class="btn primary press" onClick=${confirmar}>Añadir a ${fechaRelativa(dia).toLowerCase()}</button>
        ${elegido.propio && html`<button class="btn ghost danger-text press" style="margin-top:10px" onClick=${() => { borrarPropio(elegido); setElegido(null); }}><${Icon} n="trash" size=${16}/> Quitar de mis alimentos</button>`}
      </div>`}
    <//>
  </div>`;
}
