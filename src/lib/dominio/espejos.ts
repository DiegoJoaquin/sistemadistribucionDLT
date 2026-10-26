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
  /**
   * Cuándo se tomaron sus números: la última vez que se importó (ISO con zona).
   * Un video medido al día siguiente de subirse todavía no juntó sus vistas.
   */
  medidoEn: string | null;
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
 * Si `copia` es el mismo video que la cuenta ya había subido en `original`: la
 * misma red y cuenta, el mismo titular y la misma duración, a pocos días. Pasa
 * cuando se vuelve a subir un reel; la segunda subida rinde poco porque ese
 * público ya lo vio, y compararla con otra red no dice nada del contenido.
 */
export function esResubida(original: PublicacionVideo, copia: PublicacionVideo): boolean {
  if (original.id === copia.id || original.red !== copia.red || original.cuentaId !== copia.cuentaId) return false;
  if (diasEntre(original.fecha, copia.fecha) > DIAS_MAXIMOS) return false;
  if (original.duracion === null || copia.duracion === null || Math.abs(original.duracion - copia.duracion) > 2) return false;
  const { comunes, indice } = parecido(palabrasDe(original.texto), palabrasDe(copia.texto));
  return comunes >= 2 && indice >= 0.8;
}

/** Un video de una cuenta: la primera vez que se subió y las veces que se volvió a subir. */
export interface Subida {
  original: PublicacionVideo;
  resubidas: PublicacionVideo[];
}

const momento = (p: PublicacionVideo) => p.publicadoEn ?? `${p.fecha}T00:00:00`;

function juntarResubidas(videos: readonly PublicacionVideo[]): Subida[] {
  const subidas: Subida[] = [];
  for (const p of [...videos].sort((a, b) => momento(a).localeCompare(momento(b)))) {
    const de = subidas.find((s) => esResubida(s.original, p));
    if (de) de.resubidas.push(p);
    else subidas.push({ original: p, resubidas: [] });
  }
  return subidas;
}

/** El mejor puntaje entre dos videos contando todas sus subidas: el de otra red pudo copiar cualquiera. */
function puntajeSubidas(a: Subida, b: Subida): number | null {
  let mejor: number | null = null;
  for (const p of [a.original, ...a.resubidas]) {
    for (const q of [b.original, ...b.resubidas]) {
      const x = puntajeEspejo(p, q);
      if (x !== null && (mejor === null || x > mejor)) mejor = x;
    }
  }
  return mejor;
}

/**
 * Agrupa las publicaciones en espejos: a lo más un video por red, y de a pares,
 * del más parecido al menos. Una publicación sin pareja no es espejo. Las
 * resubidas van con su original, que es el que representa a esa red.
 */
export function agruparSubidas(pubs: readonly PublicacionVideo[]): Subida[][] {
  const videos = juntarResubidas(
    pubs.filter((p) => p.categoria !== null && (FORMATOS_VIDEO as readonly string[]).includes(p.categoria)),
  );

  const pares: { a: number; b: number; puntaje: number }[] = [];
  for (let i = 0; i < videos.length; i++) {
    for (let j = i + 1; j < videos.length; j++) {
      const puntaje = puntajeSubidas(videos[i], videos[j]);
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
    const redes = new Set(ga.map((k) => videos[k].original.red));
    if (gb.some((k) => redes.has(videos[k].original.red))) continue;
    const unido = [...ga, ...gb];
    for (const k of unido) grupoDe.set(k, unido);
  }

  const vistos = new Set<number[]>();
  const grupos: Subida[][] = [];
  for (const g of grupoDe.values()) {
    if (vistos.has(g) || g.length < 2) continue;
    vistos.add(g);
    grupos.push(g.map((k) => videos[k]));
  }
  return grupos;
}

/** Los espejos como publicaciones: el original de cada red. */
export function agruparEspejos(pubs: readonly PublicacionVideo[]): PublicacionVideo[][] {
  return agruparSubidas(pubs).map((g) => g.map((s) => s.original));
}

/* ------------------------------------------------------------------ */
/* Rendimiento                                                         */
/* ------------------------------------------------------------------ */

/**
 * Con menos de esto entre la subida y la medición, el video todavía no juntó sus
 * vistas: un reel medido a las pocas horas parece un fracaso y no lo es.
 */
export const HORAS_MINIMAS_MEDICION = 48;

/**
 * Horas entre que se subió el video y que se tomaron sus números, o null si no
 * se sabe. La hora de publicación es la que muestra la plataforma, en Chile
 * (UTC−3 en la temporada en que se usa esto); la de medición trae su zona.
 */
export function horasMedido(p: Pick<PublicacionVideo, "publicadoEn" | "medidoEn">): number | null {
  if (!p.publicadoEn || !p.medidoEn) return null;
  const subida = Date.parse(`${p.publicadoEn.slice(0, 19)}-03:00`);
  const medida = Date.parse(p.medidoEn);
  if (Number.isNaN(subida) || Number.isNaN(medida)) return null;
  return (medida - subida) / 36e5;
}

export function esTemprano(p: Pick<PublicacionVideo, "publicadoEn" | "medidoEn">): boolean {
  const h = horasMedido(p);
  return h !== null && h < HORAS_MINIMAS_MEDICION;
}

function mediana(vs: readonly number[]): number {
  const o = [...vs].sort((a, b) => a - b);
  return o.length % 2 ? o[(o.length - 1) / 2] : (o[o.length / 2 - 1] + o[o.length / 2]) / 2;
}

/** Clave de lo habitual de una cuenta en un formato: los Shorts con los Shorts. */
export const claveHabitual = (cuentaId: string, categoria: string | null) => `${cuentaId}|${categoria ?? ""}`;

/**
 * Lo habitual de cada cuenta: la mediana de visualizaciones de sus videos, por
 * cuenta y también por cuenta y formato. Los medidos demasiado pronto no
 * cuentan: bajarían lo habitual y todo lo demás parecería un éxito.
 */
export function habitualPorCuenta(pubs: readonly PublicacionVideo[]): Map<string, Habitual> {
  const grupos = new Map<string, number[]>();
  const sumar = (clave: string, v: number) => {
    const lista = grupos.get(clave) ?? [];
    lista.push(v);
    grupos.set(clave, lista);
  };
  for (const p of pubs) {
    if (p.visualizaciones === null || p.categoria === null) continue;
    if (!(FORMATOS_VIDEO as readonly string[]).includes(p.categoria)) continue;
    if (esTemprano(p)) continue;
    sumar(p.cuentaId, p.visualizaciones);
    sumar(claveHabitual(p.cuentaId, p.categoria), p.visualizaciones);
  }
  const salida = new Map<string, Habitual>();
  for (const [clave, vs] of grupos) salida.set(clave, { mediana: mediana(vs), videos: vs.length });
  return salida;
}

/** Lo habitual para un video: el de su formato si hay suficientes, si no el de la cuenta. */
function habitualDe(habitual: Map<string, Habitual>, p: PublicacionVideo): number | null {
  for (const clave of [claveHabitual(p.cuentaId, p.categoria), p.cuentaId]) {
    const h = habitual.get(clave);
    if (h && h.videos >= MINIMO_HABITUAL && h.mediana > 0) return h.mediana;
  }
  return null;
}

/** El orden fijo de las columnas: siempre igual, para que el ojo no tenga que buscar. */
export const REDES_ESPEJO: readonly Red[] = ["Instagram", "TikTok", "YouTube"];

export interface VersionEspejo {
  id: string;
  red: Red;
  cuenta: string;
  fecha: string;
  visualizaciones: number | null;
  /** La mediana de la cuenta en ese formato, o null si no hay suficientes videos para tenerla. */
  habitual: number | null;
  /** Veces lo habitual: 2 es el doble de lo normal de esa cuenta, 0,5 la mitad. */
  indice: number | null;
  enlace: string | null;
  /** Sin título propio: se reconoció por la duración y la hora, y conviene revisarla. */
  porDuracion: boolean;
  /** Se midió muy poco después de subirse: no entra en la comparación entre redes. */
  temprano: boolean;
  /** Las veces que la cuenta volvió a subir este video; no cuentan en la comparación. */
  resubidas: { fecha: string; visualizaciones: number | null }[];
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
 *
 * Las versiones medidas demasiado pronto se muestran, pero no entran a la
 * comparación: hasta que se vuelva a subir el export con números maduros, ese
 * espejo no se puede declarar dispar por esa versión.
 */
export function espejosDeLaSemana(
  pubs: readonly PublicacionVideo[],
  habitual: Map<string, Habitual>,
  desde: string,
  hasta: string,
  umbral = UMBRAL_DISPAR,
): Espejo[] {
  const espejos: Espejo[] = [];

  for (const subidas of agruparSubidas(pubs)) {
    const todas = subidas.flatMap((s) => [s.original, ...s.resubidas]);
    if (!todas.some((p) => p.fecha >= desde && p.fecha <= hasta)) continue;
    const grupo = subidas.map((s) => s.original);

    const versiones: VersionEspejo[] = subidas
      .map(({ original: p, resubidas }) => {
        const h = habitualDe(habitual, p);
        return {
          id: p.id,
          red: p.red,
          cuenta: p.cuenta,
          fecha: p.fecha,
          visualizaciones: p.visualizaciones,
          habitual: h,
          indice: h !== null && p.visualizaciones !== null ? p.visualizaciones / h : null,
          enlace: p.enlace,
          porDuracion: palabrasDe(p.texto).size < 2,
          temprano: esTemprano(p),
          resubidas: resubidas.map((r) => ({ fecha: r.fecha, visualizaciones: r.visualizaciones })),
        };
      })
      .sort((a, b) => REDES_ESPEJO.indexOf(a.red) - REDES_ESPEJO.indexOf(b.red));

    const medidas = versiones.filter((v) => v.indice !== null && !v.temprano);
    let disparidad: number | null = null;
    let mejor: Red | null = null;
    let peor: Red | null = null;
    if (medidas.length >= 2) {
      const alta = medidas.reduce((x, y) => (y.indice! > x.indice! ? y : x));
      const baja = medidas.reduce((x, y) => (y.indice! < x.indice! ? y : x));
      // Con los valores redondeados, los mismos que se muestran: así la cuenta
      // «1,8× ÷ 0,19×» da lo que dice el mensaje.
      const a = redondearVeces(alta.indice!);
      const b = redondearVeces(baja.indice!);
      disparidad = b > 0 ? a / b : a > 0 ? Number.POSITIVE_INFINITY : null;
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

/**
 * Las veces lo habitual con la precisión con que se muestran: sin decimales
 * desde 10, uno entre 1 y 10, dos bajo 1 y dos cifras significativas bajo 0,1.
 * Bajo 1 un solo decimal no alcanza: 0,15 y 0,24 saldrían iguales y «0,0×» no
 * dice nada.
 */
export function redondearVeces(x: number): number {
  if (x >= 9.95) return Math.round(x);
  if (x >= 0.995) return Math.round(x * 10) / 10;
  if (x >= 0.1) return Math.round(x * 100) / 100;
  return x > 0 ? Number(x.toPrecision(2)) : 0;
}

/** «2,6×», «0,93×», «14×». */
export function vecesTexto(x: number): string {
  const r = redondearVeces(x);
  const formato: Intl.NumberFormatOptions =
    r >= 10
      ? { maximumFractionDigits: 0 }
      : r >= 1
        ? { minimumFractionDigits: 1, maximumFractionDigits: 1 }
        : r >= 0.1
          ? { minimumFractionDigits: 2, maximumFractionDigits: 2 }
          : { maximumSignificantDigits: 2 };
  return `${r.toLocaleString("es-CL", formato)}×`;
}

/** Sobre o bajo lo habitual, según el número que se muestra: «1,0×» no puede salir en rojo. */
export const sobreLoHabitual = (indice: number) => redondearVeces(indice) >= 1;

/** Más allá de 10, el número exacto no agrega nada y distrae: «más de 10 veces». */
export const TOPE_VECES = 10;

/** Cómo se dice la diferencia entre la mejor y la peor versión. */
export function diferenciaTexto(e: Espejo): string | null {
  if (e.disparidad === null || !e.mejor || !e.peor) return null;
  const cuanto =
    e.disparidad > TOPE_VECES
      ? `más de ${TOPE_VECES} veces`
      : `${e.disparidad.toLocaleString("es-CL", { maximumFractionDigits: 1, minimumFractionDigits: 1 })} veces`;
  const medidas = e.versiones.filter((v) => v.indice !== null && !v.temprano);
  const ningunaLlego = medidas.length > 0 && medidas.every((v) => !sobreLoHabitual(v.indice!));
  return `${e.mejor} rinde ${cuanto} lo que ${e.peor}${
    ningunaLlego ? `, aunque ${medidas.length > 2 ? "ninguna" : "ninguna de las dos"} llegó a su habitual` : ""
  }`;
}
