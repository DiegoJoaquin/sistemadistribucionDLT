/**
 * Reporte semanal: el catastro de lo que se publicó, listo para enviar.
 *
 * Reemplaza al reporte diario como lo que el equipo manda. Dos diferencias de
 * fondo respecto de aquel:
 *
 *  - El corte es la SERIE, no la categoría. La pregunta que responde es "qué
 *    hashtags salieron esta semana y cómo le fue a cada uno".
 *  - No lleva preguntas de texto libre. El reporte diario tenía cinco campos
 *    para escribir a mano (qué aprendimos, qué recomendamos, riesgos); acá se
 *    sacaron a pedido del equipo. Todo lo que va en el correo sale de los
 *    datos, así que el reporte se genera sin que nadie tenga que redactar.
 *
 * Igual que el diario, está partido en dos: `construirReporteSemanal` produce
 * un modelo puro y testeable, y `htmlSemanal` / `textoSemanal` lo renderizan.
 * Así el criterio de qué se muestra no queda enterrado entre etiquetas HTML.
 */

import type { Catastro } from "@/lib/datos/consultas";
import type { LineaPerfil } from "@/lib/dominio/calculo";
import {
  type BloqueCatastro,
  type DestacadaCatastro,
  type LineaCatastro,
  metricaTitular,
  type SerieCruzada,
} from "@/lib/dominio/catastro";
import {
  coloresDeltaHex,
  mesLargo,
  numero,
  numeroFino,
  porcentaje,
  porcentajeDelta,
  rotularSemana,
} from "@/lib/dominio/formato";
import { tieneAlcanceRed } from "@/lib/dominio/redes";

export interface ReporteSemanal {
  desde: string;
  hasta: string;
  /** "22 al 28 de septiembre de 2026" */
  periodo: string;
  nombreBase: string | null;
  /**
   * true si la línea base cubre parte de la semana. Ahí las publicaciones de
   * la semana están DENTRO de la referencia y la comparación es en parte
   * contra sí misma: hay que decirlo en el correo, no dejarlo implícito.
   */
  baseSeSolapa: boolean;
  bloques: BloqueCatastro[];
  cruzadas: SerieCruzada[];
  mejores: DestacadaCatastro[];
  peores: DestacadaCatastro[];
  perfil: LineaPerfil[];
  publicaciones: number;
  series: number;
  cuentas: number;
  hayDatos: boolean;
}

export function construirReporteSemanal(catastro: Catastro): ReporteSemanal {
  const mesBase = catastro.base?.mes.slice(0, 7) ?? null;

  return {
    desde: catastro.desde,
    hasta: catastro.hasta,
    periodo: rotularSemana({ desde: catastro.desde, hasta: catastro.hasta }),
    nombreBase: catastro.base ? mesLargo(catastro.base.mes) : null,
    baseSeSolapa:
      mesBase !== null &&
      (catastro.desde.slice(0, 7) === mesBase || catastro.hasta.slice(0, 7) === mesBase),
    bloques: catastro.bloques,
    cruzadas: catastro.cruzadas,
    mejores: catastro.mejores,
    peores: catastro.peores,
    perfil: catastro.perfil,
    publicaciones: catastro.publicaciones,
    series: catastro.series,
    cuentas: catastro.bloques.length,
    hayDatos: catastro.hayAlgo,
  };
}

function perfilDe(r: ReporteSemanal, cuentaId: string): LineaPerfil | null {
  return r.perfil.find((l) => l.cuenta?.id === cuentaId) ?? null;
}

/** El valor de titular de una línea: alcance, o visualizaciones si no hay (§9.6). */
function titular(linea: LineaCatastro): {
  etiqueta: string;
  valor: number | null;
  vsSuBase: number | null;
  vsCuenta: number | null;
} {
  const metrica = metricaTitular(linea.cuenta);
  return {
    etiqueta: metrica === "alcance" ? "Alcance" : "Visualizaciones",
    valor: linea.periodo[metrica],
    vsSuBase: linea.vsSuBase[metrica],
    vsCuenta: linea.vsPromedioCuenta[metrica],
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

const TH = (t: string, alinear = "left") =>
  `<th style="padding:8px 6px;text-align:${alinear};font-size:11px;text-transform:uppercase;letter-spacing:.05em;color:#6e6e68">${esc(
    t,
  )}</th>`;

/**
 * Una línea de KPI, en el mismo formato que ya usa el equipo:
 *
 *     Alcance: 63.874 (-9,0% que la línea base)
 *
 * §9.4 — distingue dos cosas que se veían iguales y no lo son: que la métrica
 * no se haya medido esa semana, y que no haya línea base contra la que
 * compararla. Antes las dos salían como "— (sin línea base)", que le echaba la
 * culpa a la base cuando lo que faltaba era el dato.
 */
function lineaKPI(
  nombre: string,
  valorCrudo: number | null,
  valor: string,
  vsBase: number | null,
  textoBase: string,
  vsCuenta?: number | null,
): string {
  const gris = (t: string) => `<span style="color:#8a8a82">${t}</span>`;

  let comparacion: string;
  if (valorCrudo === null) {
    comparacion = gris("no se midió esta semana");
  } else {
    const trozo = (d: number | null, que: string) => {
      if (d === null) return gris(`sin ${que}`);
      const c = coloresDeltaHex(d);
      return `<span style="color:${c.texto}">${porcentajeDelta(d)} ${que}</span>`;
    };
    const partes = [trozo(vsBase, textoBase)];
    if (vsCuenta !== undefined) partes.push(trozo(vsCuenta, "que la cuenta"));
    comparacion = partes.join(" · ");
  }

  return `<tr>
    <td style="padding:3px 0;font-size:14px;color:#33332f">
      <span style="color:#6e6e68">${esc(nombre)}:</span>
      <strong style="color:${valorCrudo === null ? "#8a8a82" : "#1a1a18"}">${valor}</strong>
      <span style="font-size:13px">(${comparacion})</span>
    </td>
  </tr>`;
}

/**
 * Línea de métrica de perfil, con el mismo formato que las de KPI.
 *
 * Lleva "sin línea base" cuando hay dato: estas tres se cargan a mano y
 * todavía no tienen promedio histórico (§9.7). Sin dato queda solo el guion,
 * porque "— (sin línea base)" no dice nada.
 */
function lineaPerfil(nombre: string, valor: number | null, texto: string): string {
  if (valor === null) {
    return `<tr>
      <td style="padding:3px 0;font-size:14px;color:#33332f">
        <span style="color:#6e6e68">${esc(nombre)}:</span>
        <strong style="color:#8a8a82">${texto}</strong>
      </td>
    </tr>`;
  }
  return lineaKPI(nombre, valor, texto, null, "línea base");
}

/** El TOTAL de una cuenta, en formato de líneas de KPI. */
function bloqueTotal(linea: LineaCatastro, perfil: LineaPerfil | null): string {
  const conAlcance = tieneAlcanceRed(linea.cuenta.red);

  const filas = [
    conAlcance
      ? lineaKPI(
          "Alcance",
          linea.periodo.alcance,
          numero(linea.periodo.alcance),
          linea.vsSuBase.alcance,
          "que la línea base",
        )
      : `<tr><td style="padding:3px 0;font-size:13px;color:#8a8a82">Alcance: no lo entrega YouTube</td></tr>`,
    lineaKPI(
      "Visualizaciones",
      linea.periodo.visualizaciones,
      numero(linea.periodo.visualizaciones),
      linea.vsSuBase.visualizaciones,
      "que la línea base",
    ),
    lineaKPI(
      "Interacciones",
      linea.periodo.interacciones,
      numero(linea.periodo.interacciones),
      linea.vsSuBase.interacciones,
      "que la línea base",
    ),
    lineaKPI(
      "Engagement",
      linea.periodo.engagement,
      porcentaje(linea.periodo.engagement),
      linea.vsSuBase.engagement,
      "que la línea base",
    ),
    lineaKPI(
      "Seguidores nuevos",
      linea.periodo.nuevos_seguidores,
      numeroFino(linea.periodo.nuevos_seguidores),
      linea.vsSuBase.nuevos_seguidores,
      "que la línea base",
    ),
    // §4.3 — las de perfil van en el mismo bloque, a continuación.
    ...(perfil
      ? [
          lineaPerfil(
            "Visitas al perfil",
            perfil.visitas_perfil,
            numeroFino(perfil.visitas_perfil),
          ),
          lineaPerfil(
            "Vistas de seguidores",
            perfil.vistas_seguidores,
            numeroFino(perfil.vistas_seguidores),
          ),
          lineaPerfil(
            "Vistas de no seguidores",
            perfil.vistas_no_seguidores,
            numeroFino(perfil.vistas_no_seguidores),
          ),
          lineaPerfil(
            "% de no seguidores",
            perfil.pct_no_seguidores,
            porcentaje(perfil.pct_no_seguidores),
          ),
        ]
      : [
          `<tr><td style="padding:3px 0;font-size:13px;color:#8a8a82">Métricas de perfil: no se cargaron esta semana</td></tr>`,
        ]),
  ].join("");

  return `<table role="presentation" cellpadding="0" cellspacing="0" style="width:100%">${filas}</table>`;
}

/**
 * Las series de una cuenta, como tabla.
 *
 * Acá sí va tabla y no líneas: son el catastro, y una cuenta puede tener
 * cuarenta series en una semana. Cuarenta bloques de cinco líneas cada uno
 * serían doscientas líneas de correo y nadie las leería. El TOTAL de arriba
 * conserva el formato de líneas, que es el que pidió el equipo.
 */
function tablaSeries(bloque: BloqueCatastro): string {
  if (bloque.series.length === 0) return "";

  const filas = bloque.series
    .map((s) => {
      const t = titular(s);
      const nombre =
        s.corte.tipo === "sin-hashtag"
          ? `<span style="color:#8a8a82;font-style:italic">Sin hashtag</span>`
          : `<strong>${esc(s.etiqueta)}</strong>`;
      const nueva = s.serieNueva
        ? `<br><span style="font-size:11px;color:#8a8a82">serie nueva: no está en la línea base</span>`
        : "";

      return `<tr>
        <td style="padding:7px 6px;border-top:1px solid #e5e4e0;font-size:13px;color:#1a1a18">${nombre}${nueva}</td>
        <td style="padding:7px 6px;border-top:1px solid #e5e4e0;text-align:right;font-size:13px;color:#33332f">${s.publicaciones}</td>
        <td style="padding:7px 6px;border-top:1px solid #e5e4e0;text-align:right;font-size:13px;color:#33332f">${numero(
          t.valor,
        )}</td>
        <td style="padding:7px 6px;border-top:1px solid #e5e4e0;text-align:center">${pill(
          t.vsSuBase,
        )}</td>
        <td style="padding:7px 6px;border-top:1px solid #e5e4e0;text-align:center">${pill(
          t.vsCuenta,
        )}</td>
        <td style="padding:7px 6px;border-top:1px solid #e5e4e0;text-align:right;font-size:13px;color:#33332f">${porcentaje(
          s.periodo.engagement,
        )}</td>
      </tr>`;
    })
    .join("");

  const cabecera = tieneAlcanceRed(bloque.cuenta.red) ? "Alcance" : "Visualiz.";

  return `<table role="presentation" cellpadding="0" cellspacing="0" style="width:100%;margin-top:10px;border-collapse:collapse">
    <tr>
      ${TH("Serie")}${TH("Pub.", "right")}${TH(cabecera, "right")}
      ${TH("vs la serie", "center")}${TH("vs la cuenta", "center")}${TH("Engag.", "right")}
    </tr>
    ${filas}
  </table>`;
}

function bloqueCuenta(r: ReporteSemanal, bloque: BloqueCatastro): string {
  const series = bloque.series.filter((s) => s.corte.tipo === "hashtag").length;

  return `<div style="margin:0 0 16px;padding:12px 14px;border:1px solid #e5e4e0;border-radius:8px;background:#ffffff">
    <p style="margin:0 0 8px;font-size:14px;font-weight:700;color:#1a1a18">
      ${esc(bloque.cuenta.nombre)}
      <span style="font-weight:400;color:#8a8a82">· ${bloque.cuenta.red}${
        bloque.cuenta.es_influencer ? " · influencer" : ""
      } · ${bloque.total.publicaciones} ${
        bloque.total.publicaciones === 1 ? "publicación" : "publicaciones"
      } · ${series} ${series === 1 ? "serie" : "series"}</span>
    </p>
    ${bloqueTotal(bloque.total, perfilDe(r, bloque.cuenta.id))}
    ${tablaSeries(bloque)}
    ${
      tieneAlcanceRed(bloque.cuenta.red)
        ? ""
        : `<p style="margin:8px 0 0;font-size:11px;color:#8a8a82">YouTube no entrega alcance: la columna es de visualizaciones y su engagement no es comparable con el de las otras redes.</p>`
    }
  </div>`;
}

function tablaCruzadas(series: SerieCruzada[]): string {
  if (series.length === 0) {
    return `${H2("Series en más de una cuenta")}<p style="margin:0;font-size:14px;color:#8a8a82">Ninguna serie de esta semana salió en más de una cuenta.</p>`;
  }

  const bloques = series
    .map((s) => {
      const filas = s.cuentas
        .map((c) => {
          const conAlcance = tieneAlcanceRed(c.cuenta.red);
          const valor = conAlcance ? c.periodo.alcance : c.periodo.visualizaciones;
          const d = conAlcance ? c.vsSuBase.alcance : c.vsSuBase.visualizaciones;
          return `<tr>
            <td style="padding:6px 6px;border-top:1px solid #e5e4e0;font-size:13px;color:#1a1a18">${esc(
              c.cuenta.nombre,
            )} <span style="color:#8a8a82;font-size:11px">${esc(c.cuenta.red)}</span></td>
            <td style="padding:6px 6px;border-top:1px solid #e5e4e0;text-align:right;font-size:13px;color:#33332f">${
              c.publicaciones
            }</td>
            <td style="padding:6px 6px;border-top:1px solid #e5e4e0;text-align:right;font-size:13px;color:#33332f">${numero(
              valor,
            )}<span style="color:#8a8a82;font-size:11px"> ${
              conAlcance ? "alcance" : "visualiz."
            }</span></td>
            <td style="padding:6px 6px;border-top:1px solid #e5e4e0;text-align:center">${pill(d)}</td>
          </tr>`;
        })
        .join("");

      return `<div style="margin:0 0 12px;padding:10px 12px;border:1px solid #e5e4e0;border-radius:8px;background:#ffffff">
        <p style="margin:0;font-size:13px;font-weight:700;color:#1a1a18">${esc(
          `#${s.hashtag}`,
        )} <span style="font-weight:400;color:#8a8a82">· ${s.publicaciones} ${
          s.publicaciones === 1 ? "publicación" : "publicaciones"
        } en ${s.cuentas.length} cuentas</span></p>
        <table role="presentation" cellpadding="0" cellspacing="0" style="width:100%;margin-top:6px;border-collapse:collapse">
          <tr>${TH("Cuenta")}${TH("Pub.", "right")}${TH("Valor", "right")}${TH(
            "vs la serie",
            "center",
          )}</tr>
          ${filas}
        </table>
      </div>`;
    })
    .join("");

  return `${H2("Series en más de una cuenta")}
  <p style="margin:0 0 10px;font-size:13px;color:#6e6e68">Cada cuenta va por separado: no se promedian entre sí porque son públicos y redes distintas.</p>
  ${bloques}`;
}

function listaDestacadas(
  items: DestacadaCatastro[],
  titulo: string,
  vacio: string,
): string {
  if (items.length === 0) {
    return `${H2(titulo)}<p style="margin:0;font-size:14px;color:#8a8a82">${esc(vacio)}</p>`;
  }

  const filas = items
    .map(
      (d) => `<tr>
        <td style="padding:8px 10px;border-top:1px solid #e5e4e0;font-size:13px;color:#1a1a18">
          <strong>${esc(`#${d.hashtag}`)}</strong><br>
          <span style="color:#8a8a82;font-size:12px">${esc(d.cuenta.nombre)} · ${
            d.publicaciones
          } ${d.publicaciones === 1 ? "publicación" : "publicaciones"} · ${
            d.metrica === "alcance" ? "alcance" : "visualizaciones"
          }</span>
        </td>
        <td style="padding:8px 10px;border-top:1px solid #e5e4e0;text-align:right">${pill(
          d.valor,
        )}</td>
      </tr>`,
    )
    .join("");

  return `${H2(titulo)}
  <table role="presentation" cellpadding="0" cellspacing="0" style="width:100%;border:1px solid #e5e4e0;border-radius:8px;border-collapse:separate;background:#ffffff">
    ${filas}
  </table>`;
}

export interface OpcionesCorreoSemanal {
  /**
   * URL pública de la aplicación. Sin ella el correo va sin logo: un cliente
   * de correo no resuelve rutas relativas.
   */
  urlBase?: string | null;
}

export function htmlSemanal(
  r: ReporteSemanal,
  opciones: OpcionesCorreoSemanal = {},
): string {
  const referencia = r.nombreBase
    ? `Cada serie se compara contra su propio promedio en la línea base de ${esc(
        r.nombreBase,
      )} y contra el promedio total de su cuenta.`
    : "No hay línea base activa: las variaciones aparecen como guion.";

  const aviso = r.baseSeSolapa
    ? `<p style="margin:10px 0 0;padding:10px 12px;border:1px solid #f0d9a8;border-radius:8px;background:#fdf6e7;font-size:13px;color:#6b4e12">
        La línea base es del mismo mes que esta semana, así que estas publicaciones están incluidas en la referencia y las variaciones se comparan en parte contra sí mismas. Una serie que solo salió esta semana marca 0,0%.
      </p>`
    : "";

  return `<!doctype html>
<html lang="es-CL">
<head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Reporte semanal ${esc(
    r.periodo,
  )}</title></head>
<body style="margin:0;padding:0;background:#f6f5f3">
<table role="presentation" cellpadding="0" cellspacing="0" style="width:100%;background:#f6f5f3">
<tr><td align="center" style="padding:24px 12px">
<table role="presentation" cellpadding="0" cellspacing="0" style="width:100%;max-width:720px;text-align:left;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Helvetica,Arial,sans-serif">
<tr><td>

  ${
    opciones.urlBase
      ? `<img src="${opciones.urlBase}/logo-dlt.png" width="46" height="47" alt="DLT Sports" style="display:block;border:0;margin:0 0 14px">`
      : ""
  }
  <p style="margin:0;font-size:11px;font-weight:700;letter-spacing:.14em;text-transform:uppercase;color:#8a8a82">DLT Sports · Distribución</p>
  <h1 style="margin:6px 0 2px;font-size:22px;font-weight:700;color:#1a1a18">Catastro semanal de distribución</h1>
  <p style="margin:0 0 4px;font-size:15px;color:#33332f">${esc(r.periodo)}</p>
  <p style="margin:0;font-size:12px;color:#8a8a82">${referencia}</p>
  ${aviso}

  ${
    r.hayDatos
      ? `<p style="margin:16px 0 0;padding:10px 12px;border:1px solid #e5e4e0;border-radius:8px;background:#ffffff;font-size:14px;color:#33332f">
          <strong>${r.publicaciones}</strong> ${
            r.publicaciones === 1 ? "publicación" : "publicaciones"
          } · <strong>${r.series}</strong> ${
            r.series === 1 ? "serie" : "series distintas"
          } · <strong>${r.cuentas}</strong> ${
            r.cuentas === 1 ? "cuenta" : "cuentas"
          } con actividad
        </p>`
      : `<p style="margin:20px 0;padding:12px 14px;border:1px dashed #d3d2cc;border-radius:8px;font-size:14px;color:#6e6e68">Esta semana no tiene publicaciones cargadas.</p>`
  }

  ${listaDestacadas(
    r.mejores,
    "Lo que más subió",
    "Ninguna serie de esta semana tiene línea base con la que compararse.",
  )}

  ${listaDestacadas(
    r.peores,
    "Lo que más bajó",
    "Ninguna serie quedó bajo su promedio histórico.",
  )}

  ${tablaCruzadas(r.cruzadas)}

  ${H2("Catastro por cuenta")}
  ${
    r.bloques.length > 0
      ? r.bloques.map((b) => bloqueCuenta(r, b)).join("")
      : `<p style="margin:0;font-size:14px;color:#8a8a82">No hay cuentas con publicaciones en esta semana.</p>`
  }

  <p style="margin:28px 0 0;padding-top:12px;border-top:1px solid #e5e4e0;font-size:11px;line-height:1.6;color:#8a8a82">
    Todos los valores son promedios por publicación, no sumas: una serie con 10 publicaciones no se ve mejor que una con 2 por haber salido más veces.<br>
    El TOTAL de cada cuenta se calcula sobre todas sus publicaciones, no sumando las series.
  </p>

</td></tr>
</table>
</td></tr>
</table>
</body>
</html>`;
}

/** Versión en texto plano, para pegar en WhatsApp o en un correo simple. */
export function textoSemanal(r: ReporteSemanal): string {
  const l: string[] = [];

  l.push(`CATASTRO SEMANAL DE DISTRIBUCIÓN — ${r.periodo}`);
  if (r.nombreBase) {
    l.push(
      `Cada serie se compara contra su propio promedio en la línea base de ${r.nombreBase} y contra el promedio total de su cuenta.`,
    );
  } else {
    l.push("No hay línea base activa: las variaciones aparecen como guion.");
  }
  if (r.baseSeSolapa) {
    l.push(
      "AVISO: la línea base es del mismo mes que esta semana, así que la comparación es en parte contra sí misma.",
    );
  }
  l.push("");

  if (!r.hayDatos) {
    l.push("Esta semana no tiene publicaciones cargadas.");
    return l.join("\n");
  }

  l.push(
    `${r.publicaciones} publicaciones · ${r.series} series distintas · ${r.cuentas} cuentas con actividad`,
  );
  l.push("");

  const destacadas = (items: DestacadaCatastro[], titulo: string, vacio: string) => {
    l.push(titulo.toUpperCase());
    if (items.length === 0) {
      l.push(`  ${vacio}`);
    } else {
      for (const d of items) {
        l.push(
          `  • #${d.hashtag} — ${d.cuenta.nombre} · ${d.publicaciones} ${
            d.publicaciones === 1 ? "publicación" : "publicaciones"
          } · ${d.metrica} ${porcentajeDelta(d.valor)}`,
        );
      }
    }
    l.push("");
  };

  destacadas(r.mejores, "Lo que más subió", "Ninguna serie con línea base.");
  destacadas(r.peores, "Lo que más bajó", "Ninguna serie bajo su promedio.");

  l.push("SERIES EN MÁS DE UNA CUENTA");
  if (r.cruzadas.length === 0) {
    l.push("  Ninguna serie salió en más de una cuenta.");
  } else {
    for (const s of r.cruzadas) {
      l.push(`  #${s.hashtag} — ${s.publicaciones} publicaciones en ${s.cuentas.length} cuentas`);
      for (const c of s.cuentas) {
        const conAlcance = tieneAlcanceRed(c.cuenta.red);
        const valor = conAlcance ? c.periodo.alcance : c.periodo.visualizaciones;
        const d = conAlcance ? c.vsSuBase.alcance : c.vsSuBase.visualizaciones;
        l.push(
          `      ${c.cuenta.nombre}: ${c.publicaciones} pub · ${
            conAlcance ? "alcance" : "visualizaciones"
          } ${numero(valor)} (${porcentajeDelta(d)} que la serie)`,
        );
      }
    }
  }
  l.push("");

  l.push("CATASTRO POR CUENTA");
  for (const b of r.bloques) {
    const series = b.series.filter((s) => s.corte.tipo === "hashtag").length;
    l.push(
      `  ${b.cuenta.nombre} (${b.cuenta.red}) — ${b.total.publicaciones} publicaciones · ${series} series`,
    );

    // §9.4 — "no se midió" y "no hay base" son dos cosas distintas.
    const kpi = (n: string, crudo: number | null, v: string, d: number | null) => {
      if (crudo === null) return `    ${n}: ${v} (no se midió esta semana)`;
      const comp =
        d === null ? "sin línea base" : `${porcentajeDelta(d)} que la línea base`;
      return `    ${n}: ${v} (${comp})`;
    };

    if (tieneAlcanceRed(b.cuenta.red)) {
      l.push(
        kpi(
          "Alcance",
          b.total.periodo.alcance,
          numero(b.total.periodo.alcance),
          b.total.vsSuBase.alcance,
        ),
      );
    } else {
      l.push("    Alcance: no lo entrega YouTube");
    }
    l.push(
      kpi(
        "Visualizaciones",
        b.total.periodo.visualizaciones,
        numero(b.total.periodo.visualizaciones),
        b.total.vsSuBase.visualizaciones,
      ),
    );
    l.push(
      kpi(
        "Interacciones",
        b.total.periodo.interacciones,
        numero(b.total.periodo.interacciones),
        b.total.vsSuBase.interacciones,
      ),
    );
    l.push(
      kpi(
        "Engagement",
        b.total.periodo.engagement,
        porcentaje(b.total.periodo.engagement),
        b.total.vsSuBase.engagement,
      ),
    );
    l.push(
      kpi(
        "Seguidores nuevos",
        b.total.periodo.nuevos_seguidores,
        numeroFino(b.total.periodo.nuevos_seguidores),
        b.total.vsSuBase.nuevos_seguidores,
      ),
    );

    // §4.3 — métricas de perfil, en el mismo bloque y con el mismo formato.
    const perfil = perfilDe(r, b.cuenta.id);
    if (!perfil) {
      l.push("    Métricas de perfil: no se cargaron esta semana");
    } else {
      const p = (n: string, valor: number | null, texto: string) =>
        valor === null ? `    ${n}: ${texto}` : `    ${n}: ${texto} (sin línea base)`;
      l.push(p("Visitas al perfil", perfil.visitas_perfil, numeroFino(perfil.visitas_perfil)));
      l.push(
        p(
          "Vistas de seguidores",
          perfil.vistas_seguidores,
          numeroFino(perfil.vistas_seguidores),
        ),
      );
      l.push(
        p(
          "Vistas de no seguidores",
          perfil.vistas_no_seguidores,
          numeroFino(perfil.vistas_no_seguidores),
        ),
      );
      l.push(
        p("% de no seguidores", perfil.pct_no_seguidores, porcentaje(perfil.pct_no_seguidores)),
      );
    }

    l.push("    Series:");
    for (const s of b.series) {
      const t = titular(s);
      l.push(
        `      ${s.etiqueta} · ${s.publicaciones} pub · ${t.etiqueta.toLowerCase()} ${numero(
          t.valor,
        )} (${porcentajeDelta(t.vsSuBase)} que la serie · ${porcentajeDelta(
          t.vsCuenta,
        )} que la cuenta)${s.serieNueva ? " [serie nueva]" : ""}`,
      );
    }
    l.push("");
  }

  l.push(
    "Todos los valores son promedios por publicación, no sumas. El TOTAL de cada cuenta se calcula sobre todas sus publicaciones, no sumando las series.",
  );

  return l.join("\n");
}
