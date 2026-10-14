/**
 * Seguimiento de hashtags: buscar uno (#AGENDADLT, por ejemplo) y ver cómo
 * evoluciona en el tiempo — cuánto se usa, en qué cuentas y cómo rinde.
 *
 * El catastro ya agrupa por serie, pero mira UNA semana y solo el primer
 * hashtag de cada publicación. Acá la pregunta es otra: "¿cómo le fue a esta
 * etiqueta a lo largo de los meses?", y una etiqueta como #AGENDADLT casi nunca
 * va primera en el caption. Por eso una publicación cuenta para TODOS los
 * hashtags que lleva: su serie más los que aparecen en el texto guardado.
 *
 * Las reglas de §9 valen igual que en analítica:
 *
 *  - §9.1 — cada valor es un promedio POR PUBLICACIÓN, no una suma.
 *  - §9.4 — un período sin publicaciones con el hashtag es un HUECO en la
 *    línea, no un cero. La única excepción es contar publicaciones, donde
 *    cero sí es el dato: ese mes no se usó.
 *  - §9.6 — el engagement no se mezcla entre redes con denominadores
 *    distintos; si se mezclan, el valor queda en null.
 *
 * Todo es puro, sin base de datos, para poder testearlo.
 */

import {
  type FilaAnalitica,
  METRICAS_GRAFICO,
  type MetricaGrafico,
  NOMBRE_METRICA,
  semanasDelRango,
  type SerieCuenta,
  valorDe,
} from "./analitica";
import {
  engagement,
  promedioPorPublicacion,
  publicacionesConMetrica,
  totalPublicaciones,
} from "./calculo";
import { normalizarHashtag } from "./hashtag";
import { denominadorEngagementRed } from "./redes";

/** Una publicación del registro, con todos sus hashtags ya normalizados. */
export interface PublicacionHashtag extends FilaAnalitica {
  id: string;
  /** Nombre de la cuenta, para tablas y tooltips. */
  cuenta: string;
  /** Sin repetir, en el orden en que aparecen: primero la serie. */
  hashtags: string[];
  titulo: string | null;
  enlace: string | null;
}

/** Cuántos hashtags se pueden comparar a la vez: uno por color, con aire. */
export const MAXIMO_HASHTAGS = 4;

/* ------------------------------------------------------------------ */
/* Qué hashtags lleva una publicación                                  */
/* ------------------------------------------------------------------ */

const PATRON_HASHTAG = /#([\p{L}\p{N}_]+)/gu;

/**
 * La serie de la fila más todos los hashtags del texto, normalizados y sin
 * repetir.
 *
 * Se normalizan con la misma regla que la serie (`normalizarHashtag`), para que
 * #AgendaDLT en el texto y AGENDADLT en la serie sean la misma etiqueta.
 */
export function hashtagsDe(serie: string | null, texto: string | null): string[] {
  const vistos = new Set<string>();
  const primero = normalizarHashtag(serie);
  if (primero) vistos.add(primero);
  if (texto) {
    for (const m of texto.matchAll(PATRON_HASHTAG)) {
      const h = normalizarHashtag(m[1]);
      if (h) vistos.add(h);
    }
  }
  return [...vistos];
}

/** Lo que escribe el usuario, llevado a la forma en que se guardan. */
export function normalizarBusqueda(consulta: string): string {
  return normalizarHashtag(consulta)?.replace(/\s+/g, "") ?? "";
}

/* ------------------------------------------------------------------ */
/* Catálogo: qué hashtags existen en el período                        */
/* ------------------------------------------------------------------ */

export interface EntradaCatalogo {
  hashtag: string;
  publicaciones: number;
  cuentas: number;
  /** "YYYY-MM-DD" de la última vez que se usó. */
  ultima: string;
}

/** Todos los hashtags del período, del más usado al menos usado. */
export function catalogo(pubs: readonly PublicacionHashtag[]): EntradaCatalogo[] {
  const acumulado = new Map<string, { n: number; cuentas: Set<string>; ultima: string }>();
  for (const p of pubs) {
    for (const h of p.hashtags) {
      const a = acumulado.get(h) ?? { n: 0, cuentas: new Set<string>(), ultima: p.fecha };
      a.n += p.publicaciones;
      a.cuentas.add(p.cuentaId);
      if (p.fecha > a.ultima) a.ultima = p.fecha;
      acumulado.set(h, a);
    }
  }
  return [...acumulado]
    .map(([hashtag, a]) => ({
      hashtag,
      publicaciones: a.n,
      cuentas: a.cuentas.size,
      ultima: a.ultima,
    }))
    .sort((a, b) => b.publicaciones - a.publicaciones || a.hashtag.localeCompare(b.hashtag, "es"));
}

/**
 * Las entradas que calzan con lo escrito.
 *
 * Primero las que EMPIEZAN con la búsqueda —escribir "agenda" tiene que dar
 * #AGENDADLT antes que #LAAGENDADELFINDE—, y dentro de cada grupo, las más
 * usadas.
 */
export function buscarEnCatalogo(
  cat: readonly EntradaCatalogo[],
  consulta: string,
  limite = 12,
): EntradaCatalogo[] {
  const q = normalizarBusqueda(consulta);
  if (q === "") return cat.slice(0, limite);
  const empiezan: EntradaCatalogo[] = [];
  const contienen: EntradaCatalogo[] = [];
  for (const e of cat) {
    if (e.hashtag.startsWith(q)) empiezan.push(e);
    else if (e.hashtag.includes(q)) contienen.push(e);
  }
  // El catálogo ya viene de más a menos usado, así que cada grupo también.
  return [...empiezan, ...contienen].slice(0, limite);
}

/* ------------------------------------------------------------------ */
/* Períodos                                                            */
/* ------------------------------------------------------------------ */

export const GRANULARIDADES = ["semana", "mes"] as const;
export type Granularidad = (typeof GRANULARIDADES)[number];

export interface Periodo {
  desde: string;
  hasta: string;
}

function ultimoDiaDelMes(anio: number, mes: number): string {
  const d = new Date(Date.UTC(anio, mes, 0)).getUTCDate();
  return `${anio}-${String(mes).padStart(2, "0")}-${String(d).padStart(2, "0")}`;
}

/** Los meses calendario que toca el rango, del más antiguo al más reciente. */
export function mesesDelRango(desde: string, hasta: string): Periodo[] {
  const meses: Periodo[] = [];
  let [a, m] = desde.split("-").map(Number);
  const [aFin, mFin] = hasta.split("-").map(Number);
  // Tope de seguridad: diez años de meses.
  for (let i = 0; (a < aFin || (a === aFin && m <= mFin)) && i < 120; i++) {
    meses.push({ desde: `${a}-${String(m).padStart(2, "0")}-01`, hasta: ultimoDiaDelMes(a, m) });
    m += 1;
    if (m === 13) {
      m = 1;
      a += 1;
    }
  }
  return meses;
}

export function periodosDelRango(desde: string, hasta: string, g: Granularidad): Periodo[] {
  return g === "mes" ? mesesDelRango(desde, hasta) : semanasDelRango(desde, hasta);
}

/**
 * Semana o mes, según el largo del rango.
 *
 * Más de ~4 meses de semanas son demasiados puntos: las etiquetas se enciman y
 * la línea se vuelve ruido. Con menos de dos meses, en cambio, los meses son
 * uno o dos puntos y no hay evolución que ver.
 */
export function granularidadSugerida(desde: string, hasta: string): Granularidad {
  return semanasDelRango(desde, hasta).length > 18 ? "mes" : "semana";
}

/* ------------------------------------------------------------------ */
/* Métricas                                                            */
/* ------------------------------------------------------------------ */

/** Las métricas de analítica, más contar cuántas veces se usó. */
export type MetricaHashtag = MetricaGrafico | "publicaciones";

export const METRICAS_HASHTAG: readonly MetricaHashtag[] = ["publicaciones", ...METRICAS_GRAFICO];

export function nombreMetricaHashtag(m: MetricaHashtag): string {
  return m === "publicaciones" ? "Publicaciones" : NOMBRE_METRICA[m];
}

export function esMetricaHashtag(v: unknown): v is MetricaHashtag {
  return typeof v === "string" && (METRICAS_HASHTAG as readonly string[]).includes(v);
}

/** Las publicaciones que llevan ese hashtag. */
export function conHashtag(
  pubs: readonly PublicacionHashtag[],
  hashtag: string,
): PublicacionHashtag[] {
  return pubs.filter((p) => p.hashtags.includes(hashtag));
}

function valorDelConjunto(filas: readonly PublicacionHashtag[], metrica: MetricaHashtag) {
  if (metrica === "publicaciones") return totalPublicaciones(filas);
  return filas.length === 0 ? null : valorDe(filas, metrica);
}

/* ------------------------------------------------------------------ */
/* Evolución                                                           */
/* ------------------------------------------------------------------ */

export interface EvolucionHashtags {
  semanas: Periodo[];
  /** `cuentaId` lleva el hashtag: es la clave de la serie en el gráfico. */
  series: SerieCuenta[];
  metrica: MetricaHashtag;
}

/** Una línea por hashtag, un punto por período. */
export function evolucionHashtags(
  pubs: readonly PublicacionHashtag[],
  elegidos: readonly string[],
  metrica: MetricaHashtag,
  periodos: readonly Periodo[],
): EvolucionHashtags {
  const series = elegidos.map((h) => {
    const suyas = conHashtag(pubs, h);
    const puntos: (number | null)[] = [];
    const publicaciones: number[] = [];
    for (const per of periodos) {
      const delPeriodo = suyas.filter((p) => p.fecha >= per.desde && p.fecha <= per.hasta);
      // Contar: cero es el dato. Promediar: sin publicaciones no hay promedio (§9.4).
      puntos.push(
        metrica === "publicaciones" || delPeriodo.length > 0
          ? valorDelConjunto(delPeriodo, metrica)
          : null,
      );
      publicaciones.push(totalPublicaciones(delPeriodo));
    }
    return {
      cuentaId: h,
      nombre: `#${h}`,
      puntos,
      publicaciones,
      total: totalPublicaciones(suyas),
    };
  });
  return { semanas: [...periodos], series, metrica };
}

/* ------------------------------------------------------------------ */
/* Contra el resto de la cuenta                                        */
/* ------------------------------------------------------------------ */

/**
 * Cuánto rinden las publicaciones con el hashtag contra el RESTO de las
 * publicaciones de las mismas cuentas, en el mismo período.
 *
 * Se compara cuenta por cuenta y después se junta, ponderando por cuántas
 * publicaciones puso cada una. Comparar contra el promedio de todas las cuentas
 * juntas sería injusto: un hashtag que solo usa una cuenta chica se vería mal
 * aunque a esa cuenta le rinda el doble que lo habitual.
 *
 * El resto y no el total: si casi todo lo que publica una cuenta lleva el
 * hashtag, compararlo contra un promedio que lo incluye lo compara contra sí
 * mismo y siempre daría cerca de cero.
 *
 * Devuelve la razón real / esperado − 1. null si no hay contra qué comparar.
 */
export function contraElResto(
  conElHashtag: readonly PublicacionHashtag[],
  todas: readonly PublicacionHashtag[],
  metrica: MetricaHashtag,
): number | null {
  if (metrica === "publicaciones") return null;
  const ids = new Set(conElHashtag.map((p) => p.id));
  const cuentas = [...new Set(conElHashtag.map((p) => p.cuentaId))];

  let real = 0;
  let esperado = 0;
  for (const c of cuentas) {
    const suyas = conElHashtag.filter((p) => p.cuentaId === c);
    const resto = todas.filter((p) => p.cuentaId === c && !ids.has(p.id));
    if (resto.length === 0) continue;

    if (metrica === "engagement") {
      /*
       * Razón de sumas, como en todo el resto (§9.6): las interacciones que
       * tuvo el hashtag contra las que habría tenido con el engagement normal
       * de la cuenta, sobre el mismo denominador. Así sí se puede juntar entre
       * redes: cada cuenta se mide contra su propia vara.
       */
      const red = suyas[0].red;
      const clave = denominadorEngagementRed(red);
      const engResto = engagement(resto, red);
      if (engResto === null) continue;
      for (const p of suyas) {
        const d = p[clave];
        if (d === null || p.interacciones === null) continue;
        real += p.interacciones;
        esperado += d * engResto;
      }
      continue;
    }

    const promedioResto = promedioPorPublicacion(resto, metrica);
    const n = publicacionesConMetrica(suyas, metrica);
    if (promedioResto === null || n === 0) continue;
    real += suyas.reduce((acc, p) => acc + (p[metrica] ?? 0), 0);
    esperado += n * promedioResto;
  }
  return esperado > 0 ? real / esperado - 1 : null;
}

/* ------------------------------------------------------------------ */
/* Resumen y detalle por cuenta                                        */
/* ------------------------------------------------------------------ */

export interface DetalleCuenta {
  cuentaId: string;
  nombre: string;
  publicaciones: number;
  valor: number | null;
  vsResto: number | null;
}

export interface ResumenHashtag {
  hashtag: string;
  publicaciones: number;
  primera: string | null;
  ultima: string | null;
  valor: number | null;
  vsResto: number | null;
  /** De la que más lo usó a la que menos. */
  cuentas: DetalleCuenta[];
}

export function resumenHashtag(
  pubs: readonly PublicacionHashtag[],
  hashtag: string,
  metrica: MetricaHashtag,
): ResumenHashtag {
  const suyas = conHashtag(pubs, hashtag);
  const fechas = suyas.map((p) => p.fecha).sort();

  const porCuenta = new Map<string, PublicacionHashtag[]>();
  for (const p of suyas) porCuenta.set(p.cuentaId, [...(porCuenta.get(p.cuentaId) ?? []), p]);

  const cuentas = [...porCuenta.values()]
    .map((filas) => ({
      cuentaId: filas[0].cuentaId,
      nombre: filas[0].cuenta,
      publicaciones: totalPublicaciones(filas),
      valor: valorDelConjunto(filas, metrica),
      vsResto: contraElResto(filas, pubs, metrica),
    }))
    .sort((a, b) => b.publicaciones - a.publicaciones || a.nombre.localeCompare(b.nombre, "es"));

  return {
    hashtag,
    publicaciones: totalPublicaciones(suyas),
    primera: fechas[0] ?? null,
    ultima: fechas.at(-1) ?? null,
    valor: valorDelConjunto(suyas, metrica),
    vsResto: contraElResto(suyas, pubs, metrica),
    cuentas,
  };
}

/** Los hashtags válidos de la URL: normalizados, sin repetir y con tope. */
export function elegidosDeLaUrl(v: string | string[] | undefined): string[] {
  const lista = (Array.isArray(v) ? v : v ? [v] : []).flatMap((s) => s.split(","));
  const limpios = lista.map(normalizarBusqueda).filter((h) => h !== "");
  return [...new Set(limpios)].slice(0, MAXIMO_HASHTAGS);
}

/* ------------------------------------------------------------------ */
/* La vista va entera en la URL                                        */
/* ------------------------------------------------------------------ */

export interface ParametrosHashtags {
  h: string[];
  desde: string;
  hasta: string;
  /** null = todas las cuentas. */
  cuenta: string | null;
  metrica: MetricaHashtag;
  por: Granularidad;
}

/**
 * El enlace de una vista. Va todo en la URL para que se pueda mandar: «mira
 * cómo viene #AGENDADLT» es un enlace, no una explicación de qué apretar.
 */
export function urlHashtags(p: ParametrosHashtags): string {
  const q = new URLSearchParams();
  for (const h of p.h) q.append("h", h);
  q.set("desde", p.desde);
  q.set("hasta", p.hasta);
  if (p.cuenta) q.set("cuenta", p.cuenta);
  q.set("metrica", p.metrica);
  q.set("por", p.por);
  return `/hashtags?${q.toString()}`;
}
