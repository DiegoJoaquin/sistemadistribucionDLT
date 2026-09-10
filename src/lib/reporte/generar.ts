/**
 * §6 — Armado del reporte diario.
 *
 * Separado en dos partes: `construirReporte` produce un modelo de datos puro
 * (testeable, sin HTML), y `htmlCorreo` lo convierte en un correo. Así el
 * criterio de qué es una publicación destacada no queda enterrado entre etiquetas.
 */

import type { LineaPanel } from "@/lib/dominio/calculo";
import {
  coloresDeltaHex,
  fechaLarga,
  mesLargo,
  numero,
  numeroFino,
  porcentaje,
  porcentajeDelta,
} from "@/lib/dominio/formato";
import { type Categoria, type Plataforma, tieneAlcance } from "@/lib/dominio/plataformas";
import type { PanelDiario } from "@/lib/datos/consultas";
import type { RegistroConAutor, ReporteRow } from "@/lib/supabase/tipos-db";

/** §6.1 — el umbral que define "desempeño destacado". */
export const UMBRAL_DESTACADO = 0.8;

export interface Destacada {
  id: string;
  titulo: string;
  plataforma: Plataforma;
  categoria: Categoria | null;
  publicaciones: number;
  enlace: string | null;
  deltas: {
    alcance: number | null;
    visualizaciones: number | null;
    interacciones: number | null;
    nuevos_seguidores: number | null;
  };
  /** El delta más extremo, que es el que la hizo entrar a la lista. */
  extremo: number;
}

export interface TextosReporte {
  plan_publicaciones: string | null;
  conversacion_audiencia: string | null;
  aprendizajes: string | null;
  recomendaciones: string | null;
  riesgos: string | null;
}

export interface Reporte {
  fecha: string;
  nombreBase: string | null;
  sobre: Destacada[];
  bajo: Destacada[];
  bloques: LineaPanel[];
  textos: TextosReporte;
  hayDatos: boolean;
}

export interface FilaConDeltas {
  registro: RegistroConAutor;
  deltas: Destacada["deltas"];
}

function extremos(d: Destacada["deltas"]): { max: number | null; min: number | null } {
  const vs = Object.values(d).filter((v): v is number => v !== null && Number.isFinite(v));
  if (vs.length === 0) return { max: null, min: null };
  return { max: Math.max(...vs), min: Math.min(...vs) };
}

function titulo(r: RegistroConAutor): string {
  if (r.titulo_contenido) return r.titulo_contenido;
  const cat = r.categoria ? ` · ${r.categoria}` : "";
  return `${r.plataforma}${cat} (sin título)`;
}

/**
 * §6.1 — una fila entra a "destacado" si CUALQUIERA de sus cuatro variaciones
 * supera el umbral. Se ordenan por el delta más extremo para que lo más
 * llamativo quede arriba.
 */
export function construirReporte(
  panel: PanelDiario,
  filas: FilaConDeltas[],
  textos: ReporteRow | null,
): Reporte {
  const sobre: Destacada[] = [];
  const bajo: Destacada[] = [];

  for (const { registro, deltas } of filas) {
    const { max, min } = extremos(deltas);
    const base: Omit<Destacada, "extremo"> = {
      id: registro.id,
      titulo: titulo(registro),
      plataforma: registro.plataforma,
      categoria: registro.categoria,
      publicaciones: registro.publicaciones,
      enlace: registro.enlace,
      deltas,
    };
    if (max !== null && max > UMBRAL_DESTACADO) sobre.push({ ...base, extremo: max });
    if (min !== null && min < -UMBRAL_DESTACADO) bajo.push({ ...base, extremo: min });
  }

  sobre.sort((a, b) => b.extremo - a.extremo);
  bajo.sort((a, b) => a.extremo - b.extremo);

  return {
    fecha: panel.fecha,
    nombreBase: panel.base ? mesLargo(panel.base.mes) : null,
    sobre,
    bajo,
    // Solo las plataformas que tuvieron actividad ese día.
    bloques: panel.bloques.filter((b) => !b.sinDatos).map((b) => b.total),
    textos: {
      plan_publicaciones: textos?.plan_publicaciones ?? null,
      conversacion_audiencia: textos?.conversacion_audiencia ?? null,
      aprendizajes: textos?.aprendizajes ?? null,
      recomendaciones: textos?.recomendaciones ?? null,
      riesgos: textos?.riesgos ?? null,
    },
    hayDatos: panel.hayAlgo,
  };
}

/* ------------------------------------------------------------------ */
/* Render a correo                                                     */
/* ------------------------------------------------------------------ */

const esc = (s: string) =>
  s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");

const parrafos = (texto: string) =>
  texto
    .split(/\n{2,}/)
    .map(
      (p) =>
        `<p style="margin:0 0 10px;font-size:14px;line-height:1.6;color:#33332f">${esc(
          p,
        ).replace(/\n/g, "<br>")}</p>`,
    )
    .join("");

function pill(d: number | null): string {
  const c = coloresDeltaHex(d);
  return `<span style="display:inline-block;padding:2px 6px;border-radius:4px;background:${c.fondo};color:${c.texto};font-size:12px;font-weight:600;white-space:nowrap">${porcentajeDelta(
    d,
  )}</span>`;
}

const H2 = (t: string) =>
  `<h2 style="margin:28px 0 10px;font-size:13px;font-weight:700;letter-spacing:.08em;text-transform:uppercase;color:#6e6e68">${esc(
    t,
  )}</h2>`;

/** Una línea de KPI en el formato que ya usa el equipo. */
function lineaKPI(nombre: string, valor: string, d: number | null): string {
  const c = coloresDeltaHex(d);
  const comparacion =
    d === null
      ? `<span style="color:#8a8a82;font-size:13px">(sin línea base)</span>`
      : `<span style="color:${c.texto};font-size:13px">(${porcentajeDelta(
          d,
        )} que promedio diario)</span>`;
  return `<tr>
    <td style="padding:3px 0;font-size:14px;color:#33332f">
      <span style="color:#6e6e68">${esc(nombre)}:</span>
      <strong style="color:#1a1a18">${valor}</strong>
      ${comparacion}
    </td>
  </tr>`;
}

function bloqueKPI(l: LineaPanel): string {
  const conAlcance = tieneAlcance(l.plataforma);
  const filas = [
    conAlcance
      ? lineaKPI("Alcance", numero(l.dia.alcance), l.deltas.alcance)
      : `<tr><td style="padding:3px 0;font-size:13px;color:#8a8a82">Alcance: no lo entrega YouTube</td></tr>`,
    lineaKPI("Visualizaciones", numero(l.dia.visualizaciones), l.deltas.visualizaciones),
    lineaKPI("Interacciones", numero(l.dia.interacciones), l.deltas.interacciones),
    lineaKPI("Engagement", porcentaje(l.dia.engagement), l.deltas.engagement),
    lineaKPI(
      "Seguidores nuevos",
      numeroFino(l.dia.nuevos_seguidores),
      l.deltas.nuevos_seguidores,
    ),
  ].join("");

  const nota = conAlcance
    ? ""
    : `<p style="margin:6px 0 0;font-size:11px;color:#8a8a82">El engagement de YouTube se calcula sobre visualizaciones y no es comparable con el de las otras plataformas.</p>`;

  return `<div style="margin:0 0 16px;padding:12px 14px;border:1px solid #e5e4e0;border-radius:8px;background:#ffffff">
    <p style="margin:0 0 8px;font-size:14px;font-weight:700;color:#1a1a18">
      ${esc(l.plataforma)}
      <span style="font-weight:400;color:#8a8a82">· ${l.publicaciones} ${
        l.publicaciones === 1 ? "publicación" : "publicaciones"
      }</span>
    </p>
    <table role="presentation" cellpadding="0" cellspacing="0" style="width:100%">${filas}</table>
    ${nota}
  </div>`;
}

function tablaDestacadas(items: Destacada[], titulo: string, vacio: string): string {
  if (items.length === 0) {
    return `${H2(titulo)}<p style="margin:0;font-size:14px;color:#8a8a82">${esc(vacio)}</p>`;
  }

  const filas = items
    .map(
      (d) => `<tr>
        <td style="padding:8px 10px;border-top:1px solid #e5e4e0;font-size:13px;color:#1a1a18">
          <strong>${esc(d.titulo)}</strong><br>
          <span style="color:#8a8a82;font-size:12px">${esc(d.plataforma)}${
            d.categoria ? ` · ${esc(d.categoria)}` : ""
          } · ${d.publicaciones} ${d.publicaciones === 1 ? "publicación" : "publicaciones"}</span>
        </td>
        <td style="padding:8px 6px;border-top:1px solid #e5e4e0;text-align:center">${pill(d.deltas.alcance)}</td>
        <td style="padding:8px 6px;border-top:1px solid #e5e4e0;text-align:center">${pill(d.deltas.visualizaciones)}</td>
        <td style="padding:8px 6px;border-top:1px solid #e5e4e0;text-align:center">${pill(d.deltas.interacciones)}</td>
        <td style="padding:8px 6px;border-top:1px solid #e5e4e0;text-align:center">${pill(d.deltas.nuevos_seguidores)}</td>
      </tr>`,
    )
    .join("");

  return `${H2(titulo)}
  <table role="presentation" cellpadding="0" cellspacing="0" style="width:100%;border:1px solid #e5e4e0;border-radius:8px;border-collapse:separate;background:#ffffff">
    <tr>
      <th style="padding:8px 10px;text-align:left;font-size:11px;text-transform:uppercase;letter-spacing:.05em;color:#6e6e68">Contenido</th>
      <th style="padding:8px 6px;font-size:11px;text-transform:uppercase;letter-spacing:.05em;color:#6e6e68">Alcance</th>
      <th style="padding:8px 6px;font-size:11px;text-transform:uppercase;letter-spacing:.05em;color:#6e6e68">Visualiz.</th>
      <th style="padding:8px 6px;font-size:11px;text-transform:uppercase;letter-spacing:.05em;color:#6e6e68">Interacc.</th>
      <th style="padding:8px 6px;font-size:11px;text-transform:uppercase;letter-spacing:.05em;color:#6e6e68">Seguidores</th>
    </tr>
    ${filas}
  </table>`;
}

const PREGUNTAS: [keyof TextosReporte, string][] = [
  ["plan_publicaciones", "¿Se cumplió el plan de publicaciones?"],
  ["conversacion_audiencia", "¿Qué observamos en la conversación de la audiencia?"],
  ["aprendizajes", "¿Qué aprendimos hoy?"],
  ["recomendaciones", "¿Qué recomendamos hacer mañana y por qué?"],
  ["riesgos", "¿Existe algún riesgo o decisión que requiera gerencia?"],
];

export function htmlCorreo(r: Reporte): string {
  const secciones = PREGUNTAS.filter(([k]) => r.textos[k])
    .map(
      ([k, pregunta]) => `<div style="margin:0 0 14px">
        <p style="margin:0 0 4px;font-size:13px;font-weight:700;color:#1a1a18">${esc(pregunta)}</p>
        ${parrafos(r.textos[k]!)}
      </div>`,
    )
    .join("");

  const referencia = r.nombreBase
    ? `Las variaciones comparan el promedio por publicación del día contra la línea base de ${esc(
        r.nombreBase,
      )}.`
    : "No hay línea base activa: las variaciones aparecen como guion.";

  return `<!doctype html>
<html lang="es-CL">
<head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>KPIs ${esc(
    fechaLarga(r.fecha),
  )}</title></head>
<body style="margin:0;padding:0;background:#f6f5f3">
<table role="presentation" cellpadding="0" cellspacing="0" style="width:100%;background:#f6f5f3">
<tr><td align="center" style="padding:24px 12px">
<table role="presentation" cellpadding="0" cellspacing="0" style="width:100%;max-width:660px;text-align:left;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Helvetica,Arial,sans-serif">
<tr><td>

  <p style="margin:0;font-size:11px;font-weight:700;letter-spacing:.14em;text-transform:uppercase;color:#8a8a82">DLT Sports · Distribución</p>
  <h1 style="margin:6px 0 2px;font-size:22px;font-weight:700;color:#1a1a18">Reporte diario de KPIs</h1>
  <p style="margin:0 0 4px;font-size:15px;color:#33332f;text-transform:capitalize">${esc(
    fechaLarga(r.fecha),
  )}</p>
  <p style="margin:0;font-size:12px;color:#8a8a82">${referencia}</p>

  ${
    r.hayDatos
      ? ""
      : `<p style="margin:20px 0;padding:12px 14px;border:1px dashed #d3d2cc;border-radius:8px;font-size:14px;color:#6e6e68">Este día no tiene datos cargados.</p>`
  }

  ${tablaDestacadas(
    r.sobre,
    "Desempeño sobre el promedio (+80% o más)",
    "Ninguna publicación superó el promedio en más de 80%.",
  )}

  ${tablaDestacadas(
    r.bajo,
    "Desempeño bajo el promedio (-80% o menos)",
    "Ninguna publicación quedó más de 80% bajo el promedio.",
  )}

  ${H2("KPIs del día por plataforma")}
  ${
    r.bloques.length > 0
      ? r.bloques.map(bloqueKPI).join("")
      : `<p style="margin:0;font-size:14px;color:#8a8a82">No hay plataformas con registros para este día.</p>`
  }

  ${secciones ? H2("Lectura del día") + secciones : ""}

  <p style="margin:28px 0 0;padding-top:12px;border-top:1px solid #e5e4e0;font-size:11px;color:#8a8a82">
    Todos los valores son promedios por publicación, no sumas.
  </p>

</td></tr>
</table>
</td></tr>
</table>
</body>
</html>`;
}

/** Versión en texto plano, para pegar en WhatsApp o en un correo simple. */
export function textoPlano(r: Reporte): string {
  const l: string[] = [];
  l.push(`REPORTE DIARIO DE KPIs — ${fechaLarga(r.fecha)}`);
  if (r.nombreBase) l.push(`Comparado contra la línea base de ${r.nombreBase}.`);
  l.push("");

  const lista = (items: Destacada[], titulo: string, vacio: string) => {
    l.push(titulo.toUpperCase());
    if (items.length === 0) {
      l.push(`  ${vacio}`);
    } else {
      for (const d of items) {
        l.push(`  • ${d.titulo} — ${d.plataforma}${d.categoria ? ` · ${d.categoria}` : ""}`);
        l.push(
          `      alcance ${porcentajeDelta(d.deltas.alcance)} · visualizaciones ${porcentajeDelta(
            d.deltas.visualizaciones,
          )} · interacciones ${porcentajeDelta(
            d.deltas.interacciones,
          )} · seguidores ${porcentajeDelta(d.deltas.nuevos_seguidores)}`,
        );
      }
    }
    l.push("");
  };

  lista(r.sobre, "Desempeño sobre +80%", "Ninguna publicación.");
  lista(r.bajo, "Desempeño bajo -80%", "Ninguna publicación.");

  l.push("KPIS DEL DÍA POR PLATAFORMA");
  for (const b of r.bloques) {
    l.push(`  ${b.plataforma} (${b.publicaciones} publicaciones)`);
    const linea = (n: string, v: string, d: number | null) =>
      `    ${n}: ${v}${d === null ? "" : ` (${porcentajeDelta(d)} que promedio diario)`}`;
    if (tieneAlcance(b.plataforma)) {
      l.push(linea("Alcance", numero(b.dia.alcance), b.deltas.alcance));
    }
    l.push(linea("Visualizaciones", numero(b.dia.visualizaciones), b.deltas.visualizaciones));
    l.push(linea("Interacciones", numero(b.dia.interacciones), b.deltas.interacciones));
    l.push(linea("Engagement", porcentaje(b.dia.engagement), b.deltas.engagement));
    l.push(
      linea("Seguidores nuevos", numeroFino(b.dia.nuevos_seguidores), b.deltas.nuevos_seguidores),
    );
    l.push("");
  }

  for (const [k, pregunta] of PREGUNTAS) {
    const t = r.textos[k];
    if (!t) continue;
    l.push(pregunta.toUpperCase());
    l.push(`  ${t.replace(/\n/g, "\n  ")}`);
    l.push("");
  }

  return l.join("\n");
}

export { PREGUNTAS };
