/**
 * El informe de mejores reels, listo para mandar por correo.
 *
 * Mismo formato que el informe por cliente y el catastro semanal: comparte la
 * hoja de estilos, el encabezado y el pie de `correo-base`. Lo distinto es lo
 * que muestra: no promedios, sino los reels uno por uno, con su enlace.
 */

import { fechaCorta, numero, porcentaje } from "@/lib/dominio/formato";
import {
  engagementDe,
  type Mejores,
  type MejoresDeRed,
  NOMBRE_METRICA_MEJORES,
  type Reel,
} from "@/lib/dominio/mejores";
import { envoltura, esc, H2, type OpcionesCorreo, TH } from "./correo-base";

const cifra = (v: number | null) => (v === null ? `<span class="g">—</span>` : numero(v));

/** Un titular legible: la primera línea del caption, sin el prefijo de la serie. */
export function titularDe(r: Reel): string {
  if (!r.titulo) return "Ver publicación";
  const sinSerie = r.titulo.replace(/^[^|]*#[^|]*\|\s*/u, "").trim();
  const texto = sinSerie || r.titulo;
  return texto.length > 90 ? `${texto.slice(0, 88).trimEnd()}…` : texto;
}

function fila(r: Reel, i: number, metrica: Mejores["metrica"]): string {
  const titular = esc(titularDe(r));
  const enlace = r.enlace
    ? `<a href="${esc(r.enlace)}" style="color:#1a1a18;text-decoration:underline">${titular}</a>`
    : titular;
  const fuerte = (k: Mejores["metrica"], v: string) => (k === metrica ? `<strong>${v}</strong>` : v);
  const eng = engagementDe(r);
  return `<tr>
    <td class="c" align="right" style="color:#8a8a82">${i + 1}</td>
    <td class="c" style="white-space:nowrap">${fechaCorta(r.fecha)}</td>
    <td class="c">${enlace}<br><span class="sm">${esc(r.cuenta)}</span></td>
    <td class="c" align="right">${fuerte("visualizaciones", cifra(r.visualizaciones))}</td>
    <td class="c" align="right">${fuerte("alcance", cifra(r.alcance))}</td>
    <td class="c" align="right">${fuerte("interacciones", cifra(r.interacciones))}</td>
    <td class="c" align="right">${fuerte("compartidos", cifra(r.compartidos))}</td>
    <td class="c" align="right">${eng === null ? `<span class="g">—</span>` : porcentaje(eng)}</td>
  </tr>`;
}

function bloqueRed(d: MejoresDeRed, m: Mejores): string {
  if (d.total === 0) {
    return `${H2(d.red)}<div class="card"><p class="nota">No hay reels de ${esc(m.cliente)} en ${d.red} en este período.</p></div>`;
  }
  const unidad = d.red === "Instagram" ? "reels" : "videos";
  const sinMetrica =
    d.sinMetrica > 0
      ? ` ${d.sinMetrica} no entran al ranking porque no traen ${NOMBRE_METRICA_MEJORES[m.metrica]}.`
      : "";
  return `${H2(`${d.red} · los ${d.mejores.length} con más ${NOMBRE_METRICA_MEJORES[m.metrica]}`)}
  <div class="card">
    <p class="tit">${numero(d.total)} ${unidad} de ${esc(m.cliente)} en el período <span class="g" style="font-weight:400">· ${numero(
      d.visualizaciones,
    )} visualizaciones en total</span></p>
    <table role="presentation" cellpadding="4" cellspacing="0" class="t">
      <tr>${TH("#", "right")}${TH("Fecha")}${TH(d.red === "Instagram" ? "Reel" : "Video")}${TH("Visualiz.", "right")}${TH(
        "Alcance",
        "right",
      )}${TH("Interac.", "right")}${TH("Compart.", "right")}${TH("Engag.", "right")}</tr>
      ${d.mejores.map((r, i) => fila(r, i, m.metrica)).join("")}
    </table>
    ${sinMetrica ? `<p class="sm" style="margin:8px 0 0">${esc(sinMetrica.trim())}</p>` : ""}
  </div>`;
}

export function htmlMejores(m: Mejores, opciones: OpcionesCorreo = {}): string {
  const periodo = `${fechaCorta(m.desde)} al ${fechaCorta(m.hasta)}`;
  const cuerpo = m.hayDatos
    ? m.redes.map((d) => bloqueRed(d, m)).join("")
    : `<p style="margin:20px 0;padding:12px 14px;border:1px dashed #d3d2cc;border-radius:8px;font-size:14px;color:#6e6e68">No hay reels de ${esc(
        m.cliente,
      )} en este período.</p>`;

  return envoltura({
    titulo: `Mejores reels ${m.cliente} · ${periodo}`,
    encabezado: `Los ${m.cuantos} mejores reels · ${m.cliente}`,
    bajada: periodo,
    referencia: `Ordenados por ${esc(NOMBRE_METRICA_MEJORES[m.metrica])}, en Instagram y en TikTok. Se cuentan las publicaciones con ${esc(
      m.hashtags.map((h) => `#${h}`).join(" o "),
    )}.`,
    cuerpo,
    pie: `Instagram: solo reels. TikTok: todos los videos. Una colaboración publicada en dos cuentas se cuenta una sola vez.<br>
    Engagement = interacciones sobre alcance. Cada título lleva a la publicación.`,
    opciones,
  });
}

export function textoMejores(m: Mejores): string {
  const l: string[] = [];
  l.push(`LOS ${m.cuantos} MEJORES REELS — ${m.cliente.toUpperCase()}`);
  l.push(`${fechaCorta(m.desde)} al ${fechaCorta(m.hasta)}`);
  l.push(`Ordenados por ${NOMBRE_METRICA_MEJORES[m.metrica]}. Hashtags: ${m.hashtags.map((h) => `#${h}`).join(", ")}`);
  for (const d of m.redes) {
    l.push("");
    l.push(`${d.red.toUpperCase()} — ${d.total} ${d.red === "Instagram" ? "reels" : "videos"} en el período`);
    if (d.total === 0) {
      l.push("  Sin reels en este período.");
      continue;
    }
    d.mejores.forEach((r, i) => {
      l.push(
        `  ${i + 1}. ${fechaCorta(r.fecha)} · ${titularDe(r)} (${r.cuenta}) · ${
          r.visualizaciones === null ? "—" : numero(r.visualizaciones)
        } visualiz. · ${r.interacciones === null ? "—" : numero(r.interacciones)} interac. · ${
          r.compartidos === null ? "—" : numero(r.compartidos)
        } compart.${r.enlace ? ` · ${r.enlace}` : ""}`,
      );
    });
  }
  return l.join("\n");
}
