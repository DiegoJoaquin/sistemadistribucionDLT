/**
 * Publicaciones espejo: el mismo video subido a Instagram, TikTok y YouTube.
 *
 * La pregunta de la jefatura es cuánto cambia el rendimiento de un mismo
 * contenido según la red, y que se note cuando la diferencia es grande. Eso
 * tiene dos partes que este módulo resuelve por separado:
 *
 *  1. Reconocer el espejo. No hay un identificador común entre redes, así que
 *     se empareja por lo que sí se repite: el titular (DLT copia la primera
 *     línea del caption, y en YouTube es el título del video), la fecha (se
 *     suben con horas o un par de días de diferencia) y la duración, cuando las
 *     dos versiones la traen. Una duración muy distinta descarta el par aunque
 *     el titular se parezca: es otro corte del mismo tema.
 *
 *  2. Comparar el rendimiento. Las visualizaciones de cada red no son
 *     comparables entre sí —20 mil en YouTube no son 20 mil en Instagram—, así
 *     que cada versión se compara contra lo HABITUAL de su propia cuenta: la
 *     mediana de visualizaciones de sus videos de las semanas anteriores. Un
 *     espejo es dispar cuando una versión rinde, respecto de lo suyo, varias
 *     veces lo que rinde otra.
 *
 * Todo es puro, sin base de datos, para poder testearlo.
 */

import type { Red } from "./redes";

/** Los formatos de video, que son los que se suben en espejo. */
export const FORMATOS_VIDEO = ["Reel", "Video", "Short"] as const;

/** Una versión es dispar cuando rinde esta cantidad de veces lo que otra, cada una contra lo suyo. */
export const UMBRAL_DISPAR = 3;

/** Cuántos días pueden separar dos versiones del mismo video. */
const DIAS_MAXIMOS = 3;

/** Lo habitual de una cuenta necesita al menos esta cantidad de videos para ser confiable. */
export const MINIMO_HABITUAL = 5;

export interface PublicacionVideo {
  id: string;
  /** "YYYY-MM-DD" */
  fecha: string;
  /** "YYYY-MM-DDTHH:mm:ss", la hora que muestra la plataforma. Null en lo cargado a mano. */
  publicadoEn: string | null;
  cuentaId: string;
  cuenta: string;
  red: Red;
  categoria: string | null;
  duracion: number | null;
  /** El caption completo, o el título en YouTube. */
  texto: string | null;
  visualizaciones: number | null;
  enlace: string | null;
}

export interface Habitual {
  /** Mediana de visualizaciones de los videos de la cuenta en el período de referencia. */
  mediana: number;
  videos: number;
}

/* ------------------------------------------------------------------ */
/* El titular y sus palabras                                           */
/* ------------------------------------------------------------------ */

/**
 * La primera línea con contenido, sin el «#SERIE |» del principio ni los
 * emojis. Es lo que DLT repite entre redes.
 */
export function titularDe(texto: string | null): string {
  if (!texto) return "";
  const linea = texto.split(/\r?\n/).map((l) => l.trim()).find((l) => /[\p{L}\p{N}]/u.test(l)) ?? "";
  return linea
    .replace(/^[^|]*#[^|]*[|]\s*/u, "")
    .replace(/[\p{Extended_Pictographic}\u{FE0F}\u{200D}\u{1F1E6}-\u{1F1FF}]/gu, "")
    .replace(/\s+/g, " ")
    .trim();
}

/**
 * El titular para mostrar: cortado en el fin de la primera oración y con tope de
 * largo. En TikTok el caption viene en una sola línea, titular y bajada juntos.
 */
export function tituloCorto(texto: string | null, largo = 90): string {
  let t = titularDe(texto);
  const m = t.match(/^(.{12,}?[.!?…])\s/u);
  if (m) t = m[1];
  return t.length <= largo ? t : `${t.slice(0, largo - 1).trimEnd()}…`;
}

const VACIAS = new Set(
  (
    "de la el los las y en que a un una unos unas por con para del al se es lo su sus no si mas ya le les nos " +
    "este esta estos estas ese esa eso como pero o u e fue son ser hay muy tan todo toda todos todas hoy ayer " +
    "sobris sobrinos sobrino the and"
  ).split(" "),
);

/** Las palabras que cuentan para comparar dos titulares: sin tildes, sin hashtags ni palabras vacías. */
export function palabrasDe(texto: string | null): Set<string> {
  const titular = titularDe(texto)
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/#[\p{L}\p{N}_]+/gu, " ")
    .replace(/@[\p{L}\p{N}_.]+/gu, " ");
  const palabras = new Set<string>();
  for (const p of titular.split(/[^\p{L}\p{N}]+/u)) {
    if (p.length >= 3 && !VACIAS.has(p)) palabras.add(p);
    else if (/^\d+$/.test(p)) palabras.add(p);
  }
  return palabras;
}

/**
 * Qué tanto se parecen dos titulares: la proporción de palabras del más corto
 * que están en el otro. El título de YouTube suele ser una versión corta del
 * caption, así que dividir por el total castigaría justo los pares buenos.
 */
export function parecido(a: Set<string>, b: Set<string>): { comunes: number; indice: number } {
  if (a.size === 0 || b.size === 0) return { comunes: 0, indice: 0 };
  let comunes = 0;
  for (const p of a) if (b.has(p)) comunes += 1;
  return { comunes, indice: comunes / Math.min(a.size, b.size) };
}

function diasEntre(a: string, b: string): number {
  return Math.abs(Date.parse(`${a}T00:00:00Z`) - Date.parse(`${b}T00:00:00Z`)) / 864e5;
}

/** Horas entre dos publicaciones; si alguna no tiene hora, se cuenta por días. */
function horasEntre(p: PublicacionVideo, q: PublicacionVideo): number {
  if (p.publicadoEn && q.publicadoEn) {
    return Math.abs(Date.parse(`${p.publicadoEn.slice(0, 19)}Z`) - Date.parse(`${q.publicadoEn.slice(0, 19)}Z`)) / 36e5;
  }
  return diasEntre(p.fecha, q.fecha) * 24;
}

/**
 * Sin título no hay con qué comparar el texto: el export de YouTube de
 * Iconosquare no trae el título de los Shorts. Ahí el par se reconoce por la
 * duración —la misma, al segundo— y la cercanía en la hora de subida.
 */
const HORAS_MAXIMAS_SIN_TITULO = 36;

/**
 * Qué tan probable es que dos publicaciones sean el mismo video, o null si no
 * pueden serlo.
 */
export function puntajeEspejo(p: PublicacionVideo, q: PublicacionVideo): number | null {
  if (p.red === q.red) return null;
  const dias = diasEntre(p.fecha, q.fecha);
  if (dias > DIAS_MAXIMOS) return null;

  const conDuracion = p.duracion !== null && q.duracion !== null;
  const diferencia = conDuracion ? Math.abs(p.duracion! - q.duracion!) : null;
  // Mismo tema, distinto corte: no es el mismo video.
  if (diferencia !== null && diferencia > 5) return null;

  const pa = palabrasDe(p.texto);
  const pb = palabrasDe(q.texto);
  if (pa.size < 2 || pb.size < 2) {
    if (diferencia === null || diferencia > 1) return null;
    const horas = horasEntre(p, q);
    if (horas > HORAS_MAXIMAS_SIN_TITULO) return null;
    // Debajo de cualquier par con titular: si hay uno, gana ese.
    return 0.35 - horas / 200;
  }

  const { comunes, indice } = parecido(pa, pb);
  if (comunes < 2) return null;
  const mismaDuracion = diferencia !== null && diferencia <= 2;
  if (indice < (mismaDuracion ? 0.4 : 0.6)) return null;

  return indice + (mismaDuracion ? 0.3 : 0) - dias * 0.05;
}

/**
 * Agrupa las publicaciones en espejos: a lo más una versión por red, y de a
 * pares, del más parecido al menos. Una publicación sin pareja no es espejo.
 */
export function agruparEspejos(pubs: readonly PublicacionVideo[]): PublicacionVideo[][] {
  const videos = pubs.filter((p) => p.categoria !== null && (FORMATOS_VIDEO as readonly string[]).includes(p.categoria));

  const pares: { a: number; b: number; puntaje: number }[] = [];
  for (let i = 0; i < videos.length; i++) {
    for (let j = i + 1; j < videos.length; j++) {
      const puntaje = puntajeEspejo(videos[i], videos[j]);
      if (puntaje !== null) pares.push({ a: i, b: j, puntaje });
    }
  }
  pares.sort((x, y) => y.puntaje - x.puntaje);

  const grupoDe = new Map<number, number[]>();
  for (const { a, b } of pares) {
    const ga = grupoDe.get(a) ?? [a];
    const gb = grupoDe.get(b) ?? [b];
    if (ga === gb) continue;
    // Dos versiones de la misma red en un espejo serían dos videos distintos.
    const redes = new Set(ga.map((k) => videos[k].red));
    if (gb.some((k) => redes.has(videos[k].red))) continue;
    const unido = [...ga, ...gb];
    for (const k of unido) grupoDe.set(k, unido);
  }

  const vistos = new Set<number[]>();
  const grupos: PublicacionVideo[][] = [];
  for (const g of grupoDe.values()) {
    if (vistos.has(g) || g.length < 2) continue;
    vistos.add(g);
    grupos.push(g.map((k) => videos[k]));
  }
  return grupos;
}

/* ------------------------------------------------------------------ */
/* Rendimiento                                                         */
/* ------------------------------------------------------------------ */

/** La mediana de visualizaciones de los videos de cada cuenta. */
export function habitualPorCuenta(pubs: readonly PublicacionVideo[]): Map<string, Habitual> {
  const porCuenta = new Map<string, number[]>();
  for (const p of pubs) {
    if (p.visualizaciones === null || p.categoria === null) continue;
    if (!(FORMATOS_VIDEO as readonly string[]).includes(p.categoria)) continue;
    const lista = porCuenta.get(p.cuentaId) ?? [];
    lista.push(p.visualizaciones);
    porCuenta.set(p.cuentaId, lista);
  }
  const salida = new Map<string, Habitual>();
  for (const [cuentaId, vs] of porCuenta) {
    const o = [...vs].sort((a, b) => a - b);
    const m = o.length % 2 ? o[(o.length - 1) / 2] : (o[o.length / 2 - 1] + o[o.length / 2]) / 2;
    salida.set(cuentaId, { mediana: m, videos: o.length });
  }
  return salida;
}

/** El orden fijo de las columnas: siempre igual, para que el ojo no tenga que buscar. */
export const REDES_ESPEJO: readonly Red[] = ["Instagram", "TikTok", "YouTube"];

export interface VersionEspejo {
  id: string;
  red: Red;
  cuenta: string;
  fecha: string;
  visualizaciones: number | null;
  /** La mediana de la cuenta, o null si no hay suficientes videos para tenerla. */
  habitual: number | null;
  /** Visualizaciones sobre lo habitual: 1,5 es 50 % más de lo normal. */
  indice: number | null;
  enlace: string | null;
  /** Sin título propio: se reconoció por la duración y la hora, y conviene revisarla. */
  porDuracion: boolean;
}

export interface Espejo {
  id: string;
  titulo: string;
  fecha: string;
  versiones: VersionEspejo[];
  /** Cuántas veces rinde la mejor versión lo que rinde la peor, cada una contra lo suyo. */
  disparidad: number | null;
  dispar: boolean;
  mejor: Red | null;
  peor: Red | null;
}

/**
 * Los espejos de la semana con su rendimiento: primero los dispares, de mayor a
 * menor diferencia; después el resto, del más reciente al más antiguo.
 *
 * Se pasan las publicaciones de unos días antes y después de la semana para no
 * perder un espejo que cruzó el lunes o el domingo; cuenta para la semana si al
 * menos una versión salió en ella.
 */
export function espejosDeLaSemana(
  pubs: readonly PublicacionVideo[],
  habitual: Map<string, Habitual>,
  desde: string,
  hasta: string,
  umbral = UMBRAL_DISPAR,
): Espejo[] {
  const espejos: Espejo[] = [];

  for (const grupo of agruparEspejos(pubs)) {
    if (!grupo.some((p) => p.fecha >= desde && p.fecha <= hasta)) continue;

    const versiones: VersionEspejo[] = grupo
      .map((p) => {
        const h = habitual.get(p.cuentaId);
        const confiable = h && h.videos >= MINIMO_HABITUAL && h.mediana > 0 ? h.mediana : null;
        return {
          id: p.id,
          red: p.red,
          cuenta: p.cuenta,
          fecha: p.fecha,
          visualizaciones: p.visualizaciones,
          habitual: confiable,
          indice: confiable !== null && p.visualizaciones !== null ? p.visualizaciones / confiable : null,
          enlace: p.enlace,
          porDuracion: palabrasDe(p.texto).size < 2,
        };
      })
      .sort((a, b) => REDES_ESPEJO.indexOf(a.red) - REDES_ESPEJO.indexOf(b.red));

    const medidas = versiones.filter((v) => v.indice !== null);
    let disparidad: number | null = null;
    let mejor: Red | null = null;
    let peor: Red | null = null;
    if (medidas.length >= 2) {
      const alta = medidas.reduce((x, y) => (y.indice! > x.indice! ? y : x));
      const baja = medidas.reduce((x, y) => (y.indice! < x.indice! ? y : x));
      disparidad = baja.indice! > 0 ? alta.indice! / baja.indice! : null;
      mejor = alta.red;
      peor = baja.red;
    }

    // El titular de Instagram primero: es el único caption que separa titular y bajada en líneas.
    const titulo =
      [...grupo]
        .sort((a, b) => REDES_ESPEJO.indexOf(a.red) - REDES_ESPEJO.indexOf(b.red))
        .map((p) => tituloCorto(p.texto))
        .find((t) => t !== "") ?? "Sin título";

    espejos.push({
      id: versiones.map((v) => v.id).sort().join("+"),
      titulo,
      fecha: versiones.map((v) => v.fecha).sort()[0],
      versiones,
      disparidad,
      dispar: disparidad !== null && disparidad >= umbral,
      mejor,
      peor,
    });
  }

  return espejos.sort(
    (a, b) =>
      Number(b.dispar) - Number(a.dispar) ||
      (b.dispar ? (b.disparidad ?? 0) - (a.disparidad ?? 0) : 0) ||
      b.fecha.localeCompare(a.fecha),
  );
}
