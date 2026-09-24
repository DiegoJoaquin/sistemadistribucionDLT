/**
 * El informe por cliente, listo para mandar o descargar.
 *
 * Mismo formato que el catastro semanal —comparte la hoja de estilos y los
 * ladrillos con `correo-base`— pero responde otra pregunta: qué publicó DLT
 * del cliente en un período, y cómo le fue comparado con el promedio de las
 * cuentas donde salió.
 *
 * Dos cosas que este informe dice y el semanal no, porque va a un tercero:
 *
 *  - Sobre cuántas publicaciones se calculó cada promedio. §9.4 — YouTube no
 *    entrega alcance, así que "19 publicaciones · alcance 41.431" invita a
 *    leer ese promedio sobre 19 cuando en realidad es sobre 12.
 *  - Qué hashtags del cliente NO tuvieron publicaciones. Si esperaba cinco
 *    series y salieron tres, hay que decirlo, no dejar que se note por una
 *    fila ausente.
 */

import { metricaTitular } from "@/lib/dominio/catastro";
import type { BloqueCatastro, LineaCatastro } from "@/lib/dominio/catastro";
import {
  fechaCorta,
  mesLargo,
  numero,
  numeroFino,
  porcentaje,
  porcentajeDelta,
} from "@/lib/dominio/formato";
import type { Informe, MesInforme, SerieDelCliente } from "@/lib/dominio/informe";
import { tieneAlcanceRed } from "@/lib/dominio/redes";
import {
  envoltura,
  esc,
  H2,
  lineaKPI,
  lineaSuelta,
  type OpcionesCorreo,
  pill,
  TH,
} from "./correo-base";

export interface ReporteCliente {
  informe: Informe;
  /** Mes de la línea base contra la que se comparó. */
  nombreBase: string | null;
  /**
   * true si el mes de la línea base cae dentro del período. Ahí esas
   * publicaciones están incluidas en la referencia y la comparación es en
   * parte contra sí misma: hay que decirlo, no dejarlo implícito.
   */
  baseSeSolapa: boolean;
}

/**
 * @param mesBase El primer día del mes de la línea base ("2026-08-01"), tal
 *   como lo guarda `lineas_base.mes`. Se guarda rotulado para mostrar y el
 *   crudo se usa para saber si cae dentro del período.
 */
export function construirReporteCliente(
  informe: Informe,
  mesBase: string | null,
): ReporteCliente {
  const mes = mesBase?.slice(0, 7) ?? null;
  return {
    informe,
    nombreBase: mesBase === null ? null : mesLargo(mesBase),
    baseSeSolapa:
      mes !== null &&
      mes >= informe.desde.slice(0, 7) &&
      mes <= informe.hasta.slice(0, 7),
  };
}

const MESES = [
  "enero",
  "febrero",
  "marzo",
  "abril",
  "mayo",
  "junio",
  "julio",
  "agosto",
  "septiembre",
  "octubre",
  "noviembre",
  "diciembre",
];

function rotularMes(mes: string): string {
  const [a, m] = mes.split("-").map(Number);
  return `${MESES[m - 1]} ${a}`;
}

/** El valor de titular de una línea: alcance, o visualizaciones si no hay (§9.6). */
function titular(linea: LineaCatastro) {
  const metrica = metricaTitular(linea.cuenta);
  return {
    etiqueta: metrica === "alcance" ? "Alcance" : "Visualizaciones",
    valor: linea.periodo[metrica],
    vsSuBase: linea.vsSuBase[metrica],
    vsCuenta: linea.vsPromedioCuenta[metrica],
  };
}

/* ------------------------------------------------------------------ */
/* Render a HTML                                                       */
/* ------------------------------------------------------------------ */

/**
 * El resumen del cliente, en líneas de KPI.
 *
 * El divisor va a la vista cuando no coincide con el total: es lo que evita
 * que un promedio se lea como si fuera sobre todas las publicaciones.
 */
function resumen(r: ReporteCliente): string {
  const { total } = r.informe;

  const conDivisor = (
    nombre: string,
    valor: number | null,
    texto: string,
    divisor: number,
  ) => {
    if (valor === null) return lineaSuelta(nombre, texto, true);
    const sobre =
      divisor < total.publicaciones
        ? ` <span class="sm">sobre ${divisor} de ${total.publicaciones} publicaciones</span>`
        : "";
    return `<tr><td class="k"><span class="lbl">${esc(
      nombre,
    )}:</span> <strong class="val">${texto}</strong>${sobre}</td></tr>`;
  };

  const filas = [
    conDivisor("Alcance", total.metricas.alcance, numero(total.metricas.alcance), total.denominadores.alcance),
    conDivisor(
      "Visualizaciones",
      total.metricas.visualizaciones,
      numero(total.metricas.visualizaciones),
      total.denominadores.visualizaciones,
    ),
    conDivisor(
      "Interacciones",
      total.metricas.interacciones,
      numero(total.metricas.interacciones),
      total.denominadores.interacciones,
    ),
    total.metricas.engagement === null && total.cuentas > 1
      ? lineaSuelta("Engagement", "no se puede sumar entre redes", true)
      : lineaSuelta("Engagement", porcentaje(total.metricas.engagement)),
    conDivisor(
      "Nuevos seguidores",
      total.metricas.nuevos_seguidores,
      numeroFino(total.metricas.nuevos_seguidores),
      total.denominadores.nuevos_seguidores,
    ),
  ].join("");

  return `<div class="card" style="margin:16px 0 0">
    <p class="tit">${esc(r.informe.cliente)} <span style="font-weight:400" class="g">· ${
      total.publicaciones
    } ${total.publicaciones === 1 ? "publicación" : "publicaciones"} · ${
      total.series
    } ${total.series === 1 ? "serie" : "series"} · ${total.cuentas} ${
      total.cuentas === 1 ? "cuenta" : "cuentas"
    }</span></p>
    <table role="presentation" cellpadding="0" cellspacing="0" class="t">${filas}</table>
  </div>`;
}

function tablaMeses(meses: MesInforme[]): string {
  if (meses.length < 2) return "";

  const filas = meses
    .map(
      (m) => `<tr><td class="c">${esc(rotularMes(m.mes))}</td><td class="c" align="right">${
        m.publicaciones
      }</td><td class="c" align="right">${numero(m.alcance)}</td><td class="c" align="right">${numero(
        m.visualizaciones,
      )}</td><td class="c" align="right">${numero(
        m.interacciones,
      )}</td><td class="c" align="right">${numeroFino(m.nuevos_seguidores)}</td></tr>`,
    )
    .join("");

  return `${H2("Mes a mes")}
  <p style="margin:0 0 10px;font-size:13px;color:#6e6e68">Promedios por publicación de todas las cuentas juntas. Sin engagement: YouTube lo calcula sobre visualizaciones y el resto sobre alcance, así que mezclarlo no significaría nada.</p>
  <table role="presentation" cellpadding="4" cellspacing="0" class="t">
    <tr>${TH("Mes")}${TH("Pub.", "right")}${TH("Alcance", "right")}${TH(
      "Visualiz.",
      "right",
    )}${TH("Interacc.", "right")}${TH("Seguidores", "right")}</tr>
    ${filas}
  </table>`;
}

function tablaSeries(series: SerieDelCliente[]): string {
  if (series.length === 0) return "";

  const filas = series
    .map(
      (s) => `<tr><td class="c"><strong class="val">${esc(`#${s.hashtag}`)}</strong></td><td class="c" align="right">${
        s.publicaciones
      }</td><td class="c" align="right">${s.cuentas}</td><td class="c" align="right">${numero(
        s.total.alcance,
      )}</td><td class="c" align="right">${numero(
        s.total.visualizaciones,
      )}</td><td class="c" align="right">${numero(
        s.total.interacciones,
      )}</td><td class="c" align="right">${numeroFino(s.total.nuevos_seguidores)}</td></tr>`,
    )
    .join("");

  return `${H2("Series del cliente")}
  <p style="margin:0 0 10px;font-size:13px;color:#6e6e68">Sumando todas las cuentas donde salió cada una. El detalle por cuenta va más abajo.</p>
  <table role="presentation" cellpadding="4" cellspacing="0" class="t">
    <tr>${TH("Serie")}${TH("Pub.", "right")}${TH("Cuentas", "right")}${TH(
      "Alcance",
      "right",
    )}${TH("Visualiz.", "right")}${TH("Interacc.", "right")}${TH("Seguidores", "right")}</tr>
    ${filas}
  </table>`;
}

/** El total del cliente en una cuenta, en líneas de KPI. */
function totalEnCuenta(linea: LineaCatastro, cliente: string): string {
  const conAlcance = tieneAlcanceRed(linea.cuenta.red);
  const contra = "que el promedio general de la cuenta";

  const filas = [
    conAlcance
      ? lineaKPI(
          "Alcance",
          linea.periodo.alcance,
          numero(linea.periodo.alcance),
          linea.vsSuBase.alcance,
          contra,
        )
      : `<tr><td class="km">Alcance: no lo entrega YouTube</td></tr>`,
    lineaKPI(
      "Visualizaciones",
      linea.periodo.visualizaciones,
      numero(linea.periodo.visualizaciones),
      linea.vsSuBase.visualizaciones,
      contra,
    ),
    lineaKPI(
      "Interacciones",
      linea.periodo.interacciones,
      numero(linea.periodo.interacciones),
      linea.vsSuBase.interacciones,
      contra,
    ),
    lineaKPI(
      "Engagement",
      linea.periodo.engagement,
      porcentaje(linea.periodo.engagement),
      linea.vsSuBase.engagement,
      contra,
    ),
    lineaKPI(
      "Seguidores nuevos",
      linea.periodo.nuevos_seguidores,
      numeroFino(linea.periodo.nuevos_seguidores),
      linea.vsSuBase.nuevos_seguidores,
      contra,
    ),
  ].join("");

  return `<p class="sm" style="margin:0 0 4px">Total de ${esc(cliente)} en esta cuenta</p>
  <table role="presentation" cellpadding="0" cellspacing="0" class="t">${filas}</table>`;
}

function bloqueCuenta(bloque: BloqueCatastro, cliente: string): string {
  const cabecera = tieneAlcanceRed(bloque.cuenta.red) ? "Alcance" : "Visualiz.";

  const filas = bloque.series
    .map((s) => {
      const t = titular(s);
      const nueva = s.serieNueva
        ? `<br><span class="sm">serie nueva: no está en la línea base</span>`
        : "";
      return `<tr><td class="c"><strong class="val">${esc(
        s.etiqueta,
      )}</strong>${nueva}</td><td class="c" align="right">${
        s.publicaciones
      }</td><td class="c" align="right">${numero(t.valor)}</td><td class="c" align="center">${pill(
        t.vsSuBase,
      )}</td><td class="c" align="center">${pill(
        t.vsCuenta,
      )}</td><td class="c" align="right">${porcentaje(s.periodo.engagement)}</td></tr>`;
    })
    .join("");

  return `<div class="card">
    <p class="tit">${esc(bloque.cuenta.nombre)} <span style="font-weight:400" class="g">· ${
      bloque.cuenta.red
    }${bloque.cuenta.es_influencer ? " · influencer" : ""} · ${
      bloque.total.publicaciones
    } ${
      bloque.total.publicaciones === 1 ? "publicación" : "publicaciones"
    }</span></p>
    ${totalEnCuenta(bloque.total, cliente)}
    <table role="presentation" cellpadding="4" cellspacing="0" class="t" style="margin-top:10px">
      <tr>${TH("Serie")}${TH("Pub.", "right")}${TH(cabecera, "right")}${TH(
        "vs la serie",
        "center",
      )}${TH("vs la cuenta", "center")}${TH("Engag.", "right")}</tr>
      ${filas}
    </table>
    ${
      tieneAlcanceRed(bloque.cuenta.red)
        ? ""
        : `<p class="sm" style="margin:8px 0 0">YouTube no entrega alcance: la columna es de visualizaciones y su engagement no es comparable con el de las otras redes.</p>`
    }
  </div>`;
}

export function htmlCliente(
  r: ReporteCliente,
  opciones: OpcionesCorreo = {},
): string {
  const { informe } = r;

  const referencia = r.nombreBase
    ? `Cada serie se compara contra su propio promedio en la línea base de ${esc(
        r.nombreBase,
      )} y contra el promedio general de la cuenta donde se publicó.`
    : "No hay línea base activa: las variaciones aparecen como guion.";

  const periodo = `${fechaCorta(informe.desde)} al ${fechaCorta(informe.hasta)}`;

  const sinDatos =
    informe.hashtagsSinDatos.length > 0
      ? `<p class="aviso">${
          informe.hashtagsSinDatos.length === 1
            ? "Un hashtag del cliente no tuvo"
            : `${informe.hashtagsSinDatos.length} hashtags del cliente no tuvieron`
        } ninguna publicación en este período: ${esc(
          informe.hashtagsSinDatos.map((h) => `#${h}`).join(" · "),
        )}.</p>`
      : "";

  const cuerpo = informe.hayDatos
    ? `
  ${resumen(r)}
  ${sinDatos}
  ${tablaMeses(informe.porMes)}
  ${tablaSeries(informe.series)}

  ${H2("Detalle por cuenta")}
  ${informe.bloques.map((b) => bloqueCuenta(b, informe.cliente)).join("")}
`
    : `<p style="margin:20px 0;padding:12px 14px;border:1px dashed #d3d2cc;border-radius:8px;font-size:14px;color:#6e6e68">No hay publicaciones de ${esc(
        informe.cliente,
      )} en este período.</p>${sinDatos}`;

  return envoltura({
    titulo: `Informe ${informe.cliente} · ${periodo}`,
    encabezado: `Informe de distribución · ${informe.cliente}`,
    bajada: periodo,
    referencia,
    aviso: r.baseSeSolapa
      ? "La línea base cae dentro del período del informe, así que esas publicaciones están incluidas en la referencia y sus variaciones se comparan en parte contra sí mismas."
      : undefined,
    cuerpo,
    pie: `Todos los valores son promedios por publicación, no sumas: una serie con 10 publicaciones no se ve mejor que una con 2 por haber salido más veces.<br>
    El total de cada cuenta es el total de ${esc(
      informe.cliente,
    )} en esa cuenta, no el de la cuenta completa. Las publicaciones sin hashtag no entran.`,
    opciones,
  });
}

/* ------------------------------------------------------------------ */
/* Render a texto plano                                                */
/* ------------------------------------------------------------------ */

export function textoCliente(r: ReporteCliente): string {
  const { informe } = r;
  const l: string[] = [];
  const periodo = `${fechaCorta(informe.desde)} al ${fechaCorta(informe.hasta)}`;

  l.push(`INFORME DE DISTRIBUCIÓN — ${informe.cliente.toUpperCase()}`);
  l.push(periodo);
  if (r.nombreBase) {
    l.push(
      `Cada serie se compara contra su propio promedio en la línea base de ${r.nombreBase} y contra el promedio general de la cuenta donde se publicó.`,
    );
  } else {
    l.push("No hay línea base activa: las variaciones aparecen como guion.");
  }
  if (r.baseSeSolapa) {
    l.push(
      "AVISO: la línea base cae dentro del período, así que la comparación es en parte contra sí misma.",
    );
  }
  l.push("");

  if (!informe.hayDatos) {
    l.push(`No hay publicaciones de ${informe.cliente} en este período.`);
    if (informe.hashtagsSinDatos.length > 0) {
      l.push(
        `Hashtags buscados: ${informe.hashtagsSinDatos.map((h) => `#${h}`).join(", ")}`,
      );
    }
    return l.join("\n");
  }

  const { total } = informe;
  l.push(
    `${total.publicaciones} publicaciones · ${total.series} series · ${total.cuentas} cuentas`,
  );

  const conDivisor = (nombre: string, valor: number | null, texto: string, divisor: number) => {
    if (valor === null) return `  ${nombre}: ${texto}`;
    const sobre =
      divisor < total.publicaciones
        ? ` (sobre ${divisor} de ${total.publicaciones} publicaciones)`
        : "";
    return `  ${nombre}: ${texto}${sobre}`;
  };

  l.push(conDivisor("Alcance", total.metricas.alcance, numero(total.metricas.alcance), total.denominadores.alcance));
  l.push(
    conDivisor(
      "Visualizaciones",
      total.metricas.visualizaciones,
      numero(total.metricas.visualizaciones),
      total.denominadores.visualizaciones,
    ),
  );
  l.push(
    conDivisor(
      "Interacciones",
      total.metricas.interacciones,
      numero(total.metricas.interacciones),
      total.denominadores.interacciones,
    ),
  );
  l.push(
    total.metricas.engagement === null && total.cuentas > 1
      ? "  Engagement: no se puede sumar entre redes"
      : `  Engagement: ${porcentaje(total.metricas.engagement)}`,
  );
  l.push(
    conDivisor(
      "Nuevos seguidores",
      total.metricas.nuevos_seguidores,
      numeroFino(total.metricas.nuevos_seguidores),
      total.denominadores.nuevos_seguidores,
    ),
  );
  l.push("");

  if (informe.hashtagsSinDatos.length > 0) {
    l.push(
      `SIN PUBLICACIONES EN EL PERÍODO: ${informe.hashtagsSinDatos
        .map((h) => `#${h}`)
        .join(", ")}`,
    );
    l.push("");
  }

  if (informe.porMes.length > 1) {
    l.push("MES A MES");
    for (const m of informe.porMes) {
      l.push(
        `  ${rotularMes(m.mes)}: ${m.publicaciones} pub · alcance ${numero(
          m.alcance,
        )} · visualiz ${numero(m.visualizaciones)} · interacc ${numero(m.interacciones)}`,
      );
    }
    l.push("");
  }

  l.push("SERIES DEL CLIENTE");
  for (const s of informe.series) {
    l.push(
      `  #${s.hashtag} · ${s.publicaciones} pub en ${s.cuentas} ${
        s.cuentas === 1 ? "cuenta" : "cuentas"
      } · alcance ${numero(s.total.alcance)} · interacc ${numero(s.total.interacciones)}`,
    );
  }
  l.push("");

  l.push("DETALLE POR CUENTA");
  for (const b of informe.bloques) {
    l.push(
      `  ${b.cuenta.nombre} (${b.cuenta.red}) — ${b.total.publicaciones} publicaciones de ${informe.cliente}`,
    );

    const kpi = (n: string, crudo: number | null, v: string, d: number | null) => {
      if (crudo === null) return `    ${n}: ${v} (no se midió)`;
      const comp =
        d === null
          ? "sin línea base"
          : `${porcentajeDelta(d)} que el promedio general de la cuenta`;
      return `    ${n}: ${v} (${comp})`;
    };

    if (tieneAlcanceRed(b.cuenta.red)) {
      l.push(
        kpi("Alcance", b.total.periodo.alcance, numero(b.total.periodo.alcance), b.total.vsSuBase.alcance),
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
    `Todos los valores son promedios por publicación, no sumas. El total de cada cuenta es el total de ${informe.cliente} en esa cuenta, no el de la cuenta completa. Las publicaciones sin hashtag no entran.`,
  );

  return l.join("\n");
}
