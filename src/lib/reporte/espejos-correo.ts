/**
 * La sección de publicaciones espejo del correo semanal.
 *
 * Una tabla con TODOS los espejos de la semana, no solo un aviso: cada fila es
 * un contenido y cada columna una red, con sus visualizaciones y cuánto se
 * alejó de lo habitual de su cuenta. Los dispares van primero y marcados.
 */

import { type Espejo, REDES_ESPEJO, UMBRAL_DISPAR, type VersionEspejo } from "@/lib/dominio/espejos";
import { numero } from "@/lib/dominio/formato";
import { esc, H2, pill, TH } from "./correo-base";

/** Tope de filas: el correo no puede pasar el límite de Gmail. */
export const TOPE_ESPEJOS_CORREO = 15;

function veces(x: number): string {
  return x.toLocaleString("es-CL", { maximumFractionDigits: 1, minimumFractionDigits: 1 });
}

function celda(v: VersionEspejo | undefined, destacada: "mejor" | "peor" | null): string {
  if (!v) return `<td class="c" align="center" style="color:#9a9a93">—</td>`;
  const vis = v.visualizaciones === null ? "—" : numero(v.visualizaciones);
  const enlace = v.enlace ? `<a href="${esc(v.enlace)}" style="color:#1f1f1c">${vis}</a>` : vis;
  const comparacion = v.indice === null ? `<span class="sm">sin habitual</span>` : pill(v.indice - 1);
  const fondo = destacada === "mejor" ? "background:#eef7f0;" : destacada === "peor" ? "background:#fbefee;" : "";
  const nota = v.porDuracion ? `<br><span class="sm">por duración</span>` : "";
  return `<td class="c" align="right" style="${fondo}white-space:nowrap"><strong class="val">${enlace}</strong><br><span class="sm">${esc(
    v.cuenta,
  )}</span><br>${comparacion}${nota}</td>`;
}

function diferencia(e: Espejo): string {
  if (e.disparidad === null) return `<span class="sm">No se puede comparar</span>`;
  if (!e.dispar) return `<span class="sm">Parejo (${veces(e.disparidad)}×)</span>`;
  return `<strong style="color:#9a3412">⚠ ${esc(e.mejor ?? "")} rinde ${veces(e.disparidad)} veces lo que ${esc(
    e.peor ?? "",
  )}</strong>`;
}

export function seccionEspejosHTML(espejos: readonly Espejo[]): string {
  const titulo = H2("Publicaciones espejo");
  if (espejos.length === 0) {
    return `${titulo}<p class="nota">Esta semana no hay videos que se hayan subido a más de una red, o falta cargar alguna de ellas.</p>`;
  }

  const dispares = espejos.filter((e) => e.dispar).length;
  const filas = espejos.slice(0, TOPE_ESPEJOS_CORREO).map((e) => {
    const porRed = new Map(e.versiones.map((v) => [v.red, v]));
    const marca = (red: string): "mejor" | "peor" | null =>
      e.dispar ? (red === e.mejor ? "mejor" : red === e.peor ? "peor" : null) : null;
    return `<tr${e.dispar ? ' style="border-left:3px solid #c2410c"' : ""}>
      <td class="c"><strong>${esc(e.titulo)}</strong><br><span class="sm">${esc(
        e.fecha.split("-").reverse().join("-"),
      )}</span><br>${diferencia(e)}</td>
      ${REDES_ESPEJO.map((r) => celda(porRed.get(r), marca(r))).join("")}
    </tr>`;
  });

  const resto = espejos.length - TOPE_ESPEJOS_CORREO;
  return `${titulo}
  <p style="margin:0 0 10px;font-size:13px;color:#6e6e68">${espejos.length} ${
    espejos.length === 1 ? "video subido" : "videos subidos"
  } a más de una red${
    dispares > 0
      ? ` · <strong style="color:#9a3412">${dispares} con rendimiento muy distinto</strong> entre redes (una rinde ${UMBRAL_DISPAR} veces o más lo que otra)`
      : ", todos con un rendimiento parejo"
  }. Cada versión se compara contra lo habitual de su cuenta, porque las visualizaciones de una red no son comparables con las de otra. Las marcadas «por duración» no traían título (los Shorts de YouTube en Iconosquare) y se reconocieron por la duración y la hora de subida.</p>
  <table role="presentation" cellpadding="6" cellspacing="0" class="t" style="border:1px solid #e5e4e0;border-radius:8px;background:#fff">
    <tr>${TH("Contenido")}${REDES_ESPEJO.map((r) => TH(r, "right")).join("")}</tr>
    ${filas.join("")}
  </table>
  ${resto > 0 ? `<p class="sm" style="margin:6px 0 0">Y ${resto} espejos parejos más: están todos en la plataforma, en Espejos.</p>` : ""}`;
}

export function seccionEspejosTexto(espejos: readonly Espejo[]): string[] {
  const l: string[] = ["PUBLICACIONES ESPEJO"];
  if (espejos.length === 0) {
    l.push("  Esta semana no hay videos subidos a más de una red (o falta cargar alguna).");
    return l;
  }
  for (const e of espejos.slice(0, TOPE_ESPEJOS_CORREO)) {
    const encabezado = e.dispar
      ? `  ⚠ ${e.titulo} — ${e.mejor} rinde ${veces(e.disparidad!)} veces lo que ${e.peor}`
      : `  • ${e.titulo}`;
    l.push(encabezado);
    for (const v of e.versiones) {
      const comp = v.indice === null ? "sin habitual" : `${v.indice >= 1 ? "+" : ""}${Math.round((v.indice - 1) * 100)}% vs lo habitual`;
      l.push(
        `      ${v.red} (${v.cuenta}): ${numero(v.visualizaciones)} visualizaciones, ${comp}${v.porDuracion ? " (por duración)" : ""}${v.enlace ? ` · ${v.enlace}` : ""}`,
      );
    }
  }
  if (espejos.length > TOPE_ESPEJOS_CORREO) l.push(`  Y ${espejos.length - TOPE_ESPEJOS_CORREO} espejos parejos más en la plataforma.`);
  return l;
}
