// ── Componentes de interfaz compartidos ─────────────────────────────────
import { html, createContext, useContext, useEffect, useState } from "./lib.js";
import { ICONOS } from "./icons.js";
import { COLORES } from "./data.js";

export const Ctx = createContext(null);
export const useApp = () => useContext(Ctx);

export const color = (acento) => COLORES[acento] || acento || COLORES.lime;

export function Icon({ n, size = 20, class: cls = "", style = "" }) {
  const def = ICONOS[n] || ICONOS["circle"];
  return html`<svg class="icon ${cls}" width=${size} height=${size} viewBox="0 0 24 24"
    fill=${def.filled ? "currentColor" : "none"} stroke=${def.filled ? "none" : "currentColor"}
    stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"
    style=${style} dangerouslySetInnerHTML=${{ __html: def.d }}></svg>`;
}

export function Ring({ pct, size = 128, stroke = 11, color: c = COLORES.lime, children }) {
  const r = (size - stroke) / 2, circ = 2 * Math.PI * r;
  const off = circ - (Math.max(0, Math.min(100, pct || 0)) / 100) * circ;
  return html`<div class="ring" style="width:${size}px;height:${size}px">
    <svg width=${size} height=${size} style="transform:rotate(-90deg)">
      <circle cx=${size / 2} cy=${size / 2} r=${r} fill="none" stroke="var(--line)" stroke-width=${stroke}/>
      <circle cx=${size / 2} cy=${size / 2} r=${r} fill="none" stroke=${c} stroke-width=${stroke}
        stroke-dasharray=${circ} stroke-dashoffset=${off} stroke-linecap="round" class="ring-arc"/>
    </svg>
    <div class="ring-in">${children}</div>
  </div>`;
}

export function Bar({ pct, color: c = COLORES.lime, h = 6 }) {
  const over = pct > 100;
  return html`<div class="bar" style="height:${h}px">
    <div style="width:${Math.max(0, Math.min(100, pct || 0))}%;background:${over ? COLORES.rose : c}"/>
  </div>`;
}

export function Spinner({ size = 32 }) {
  return html`<div class="spinner" style="width:${size}px;height:${size}px"/>`;
}

export function TopBar({ titulo, sub, onBack, acento, children }) {
  return html`<header class="topbar">
    ${onBack && html`<button class="icon-btn press" onClick=${onBack} aria-label="Volver"><${Icon} n="chevron-left"/></button>`}
    <div class="topbar-txt">
      ${sub && html`<div class="eyebrow" style="color:${color(acento)}">${sub}</div>`}
      <h1>${titulo}</h1>
    </div>
    ${children && html`<div class="topbar-right">${children}</div>`}
  </header>`;
}

export function Section({ titulo, extra, children, class: cls = "" }) {
  return html`<section class="card ${cls}">
    ${(titulo || extra) && html`<div class="card-head"><span class="label">${titulo}</span>${extra}</div>`}
    ${children}
  </section>`;
}

export function Sheet({ abierto, onClose, titulo, children }) {
  useEffect(() => {
    if (!abierto) return;
    const k = (e) => e.key === "Escape" && onClose();
    window.addEventListener("keydown", k);
    return () => window.removeEventListener("keydown", k);
  }, [abierto]);
  if (!abierto) return null;
  return html`<div class="sheet-bg" onClick=${onClose}>
    <div class="sheet" role="dialog" aria-label=${titulo} onClick=${(e) => e.stopPropagation()}>
      <div class="sheet-grip"/>
      <div class="sheet-head"><h2>${titulo}</h2>
        <button class="icon-btn press" onClick=${onClose} aria-label="Cerrar"><${Icon} n="x"/></button></div>
      ${children}
    </div>
  </div>`;
}

export function Stepper({ value, onChange, step = 1, min = 0, fmt = (v) => v }) {
  return html`<div class="stepper">
    <button class="icon-btn press" onClick=${() => onChange(Math.max(min, Math.round((value - step) * 100) / 100))} aria-label="Menos"><${Icon} n="minus"/></button>
    <div class="stepper-val">${fmt(value)}</div>
    <button class="icon-btn press" onClick=${() => onChange(Math.round((value + step) * 100) / 100)} aria-label="Más"><${Icon} n="plus"/></button>
  </div>`;
}

export function Empty({ icon = "mood-empty", children }) {
  return html`<div class="empty"><${Icon} n=${icon} size=${26}/><div>${children}</div></div>`;
}

// Gráfica de línea simple. pts: [{x: etiqueta, y: número}]
export function LineChart({ pts, meta, c = COLORES.lime, unidad = "", alto = 130 }) {
  const [sel, setSel] = useState(null);
  if (!pts || pts.length < 2) return null;
  const W = 300, H = alto, padY = 14, padX = 6;
  const ys = pts.map((p) => p.y).concat(meta != null ? [meta] : []);
  let mn = Math.min(...ys), mx = Math.max(...ys);
  const marg = Math.max(0.5, (mx - mn) * 0.12);
  mn -= marg; mx += marg;
  const X = (i) => padX + (i / (pts.length - 1)) * (W - padX * 2);
  const Y = (v) => H - padY - ((v - mn) / (mx - mn)) * (H - padY * 2);
  const linea = pts.map((p, i) => `${X(i).toFixed(1)},${Y(p.y).toFixed(1)}`).join(" ");
  const gid = "g" + Math.random().toString(36).slice(2, 7);
  const s = sel != null ? pts[sel] : pts[pts.length - 1];
  return html`<div class="chart">
    <div class="chart-val"><b>${String(s.y).replace(".", ",")}${unidad}</b> <span>${s.x}</span></div>
    <svg viewBox="0 0 ${W} ${H}" preserveAspectRatio="none" style="width:100%;height:${H}px"
      onPointerMove=${(e) => { const r = e.currentTarget.getBoundingClientRect(); setSel(Math.round(((e.clientX - r.left) / r.width) * (pts.length - 1))); }}
      onPointerLeave=${() => setSel(null)}>
      <defs><linearGradient id=${gid} x1="0" y1="0" x2="0" y2="1">
        <stop offset="0%" stop-color=${c} stop-opacity="0.35"/><stop offset="100%" stop-color=${c} stop-opacity="0"/>
      </linearGradient></defs>
      ${meta != null && html`<line x1="0" x2=${W} y1=${Y(meta)} y2=${Y(meta)} stroke=${COLORES.cyan} stroke-width="1.5" stroke-dasharray="4 4" vector-effect="non-scaling-stroke" opacity="0.8"/>`}
      <polygon points="${X(0)},${H} ${linea} ${X(pts.length - 1)},${H}" fill="url(#${gid})"/>
      <polyline points=${linea} fill="none" stroke=${c} stroke-width="2.5" stroke-linejoin="round" stroke-linecap="round" vector-effect="non-scaling-stroke"/>
      ${sel != null && html`<line x1=${X(sel)} x2=${X(sel)} y1="0" y2=${H} stroke="var(--faint)" stroke-width="1" vector-effect="non-scaling-stroke"/>`}
    </svg>
    <div class="chart-axis"><span>${pts[0].x}</span>${meta != null && html`<span style="color:${COLORES.cyan}">Meta ${meta}${unidad}</span>`}<span>${pts[pts.length - 1].x}</span></div>
  </div>`;
}
