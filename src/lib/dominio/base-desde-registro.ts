/**
 * Armar la línea base de un mes con lo que ya está cargado en el registro.
 *
 * Hasta acá la única forma de crear una línea base era volver a subir las
 * exportaciones del mes. Eso tenía sentido cuando el registro guardaba filas
 * agrupadas y la línea base guardaba publicaciones sueltas: eran dos formas
 * distintas del mismo dato, y solo el archivo tenía la fina.
 *
 * Dejó de tenerlo. Desde que el registro guarda una fila por publicación y con
 * el desglose de interacciones, tiene exactamente las mismas columnas que
 * `publicaciones_base`. Volver a subir los mismos archivos para obtener los
 * mismos números es trabajo que no cambia nada — y encima es el camino más
 * fácil de equivocarse, porque hay que acordarse de cuáles eran los archivos de
 * ese mes.
 *
 * Lo único que no se puede traducir son las filas cargadas a mano que
 * representan varias publicaciones (§9.5): la línea base cuenta una fila como
 * una publicación, así que meter ahí una que vale por tres diría que una sola
 * publicación tuvo el alcance de las tres, y todos los promedios del mes
 * saldrían inflados. Esas se dejan fuera y se cuentan.
 */

import type { FuenteImport } from "@/lib/importar/tipos";
import type { Categoria } from "./categorias";

/** Lo que una fila del registro necesita tener para poder copiarse. */
export interface RegistroParaBase {
  id: string;
  cuenta_id: string;
  /** "YYYY-MM-DD" */
  fecha: string;
  /** Naive local, "YYYY-MM-DDTHH:mm:ss". Las cargadas a mano no lo traen. */
  publicado_en: string | null;
  categoria: Categoria | null;
  tipo: Categoria | null;
  hashtag: string | null;
  titulo_contenido: string | null;
  enlace: string | null;
  id_externo: string | null;
  fuente: FuenteImport;
  /** §9.5 — cuántas publicaciones representa la fila. */
  publicaciones: number;
  alcance: number | null;
  visualizaciones: number | null;
  interacciones: number | null;
  nuevos_seguidores: number | null;
  me_gusta: number | null;
  comentarios: number | null;
  compartidos: number | null;
  guardados: number | null;
  favoritos: number | null;
  duracion_s: number | null;
}

/**
 * Una fila de `publicaciones_base`.
 *
 * `plataforma` no se escribe: la llena el trigger de sincronización a partir de
 * `cuenta_id`, y solo cuando la cuenta es una de las cinco originales. Ponerla
 * acá obligaría a inventar un valor para la cuenta de un influencer.
 */
export interface FilaBaseDesdeRegistro {
  linea_base_id: string;
  cuenta_id: string;
  publicado_en: string | null;
  formato: Categoria | null;
  tipo: Categoria | null;
  tipo_auto: Categoria | null;
  serie_hashtag: string | null;
  caption: string | null;
  duracion_s: number | null;
  visualizaciones: number | null;
  alcance: number | null;
  me_gusta: number | null;
  comentarios: number | null;
  compartidos: number | null;
  guardados: number | null;
  favoritos: number | null;
  nuevos_seguidores: number | null;
  interacciones: number | null;
  enlace: string | null;
  id_externo: string | null;
  fuente: FuenteImport;
}

export interface ConversionABase {
  filas: FilaBaseDesdeRegistro[];
  /** §9.5 — filas que representan varias publicaciones y no se pueden partir. */
  agrupadas: number;
  /** Cuántas publicaciones representaban esas filas entre todas. */
  publicacionesAgrupadas: number;
  /** Cuántas filas no traían la hora de publicación y se fecharon al día. */
  sinHora: number;
}

/**
 * Convierte las filas del registro de un mes en publicaciones de la línea base.
 *
 * El mapeo es directo salvo en tres puntos, y los tres están acá porque los
 * tres mienten si se hacen mal:
 *
 *  - **§9.5** — una fila que vale por varias publicaciones queda fuera. En la
 *    línea base una fila ES una publicación, así que copiarla diría que una
 *    sola publicación tuvo el alcance de las tres, y eso sube el promedio del
 *    mes contra el que se va a comparar todo lo que venga después.
 *  - **La hora**. Las filas cargadas a mano no la traen y la línea base no
 *    tiene una columna de fecha suelta, solo `publicado_en`. Se usa la medianoche
 *    de su día: la alternativa era dejarla en nulo y perder el día entero, que
 *    es lo único que esa fila sí sabe. Se cuenta cuántas fueron.
 *  - **`tipo_auto`**. En la importación guarda la clasificación que hizo el
 *    lector, para poder ver después qué se corrigió a mano (§5.2). Acá lo que
 *    viene del registro YA puede estar corregido, así que se copia el mismo
 *    valor en los dos y `clasificado_a_mano` queda en false: decir que la
 *    clasificación es automática sería mentir, y decir que es manual también.
 *    Lo honesto es que el origen quede trazable por `fuente`.
 */
export function aPublicacionesBase(
  registros: readonly RegistroParaBase[],
  lineaBaseId: string,
): ConversionABase {
  const filas: FilaBaseDesdeRegistro[] = [];
  let agrupadas = 0;
  let publicacionesAgrupadas = 0;
  let sinHora = 0;

  for (const r of registros) {
    if (r.publicaciones !== 1) {
      agrupadas += 1;
      publicacionesAgrupadas += Number.isFinite(r.publicaciones) ? r.publicaciones : 0;
      continue;
    }

    if (r.publicado_en === null) sinHora += 1;

    filas.push({
      linea_base_id: lineaBaseId,
      cuenta_id: r.cuenta_id,
      publicado_en: r.publicado_en ?? `${r.fecha}T00:00:00`,
      formato: r.categoria,
      tipo: r.tipo,
      tipo_auto: r.tipo,
      serie_hashtag: r.hashtag,
      /*
       * El registro guarda el caption ya recortado a 300 grafemas, que es lo
       * que hace falta para reconocer la publicación. El texto completo solo
       * existía para cruzar las dos exportaciones de Instagram entre sí, y ese
       * cruce ya ocurrió antes de que la fila llegara al registro.
       */
      caption: r.titulo_contenido,
      duracion_s: r.duracion_s,
      visualizaciones: r.visualizaciones,
      alcance: r.alcance,
      me_gusta: r.me_gusta,
      comentarios: r.comentarios,
      compartidos: r.compartidos,
      guardados: r.guardados,
      favoritos: r.favoritos,
      nuevos_seguidores: r.nuevos_seguidores,
      interacciones: r.interacciones,
      enlace: r.enlace,
      id_externo: r.id_externo,
      fuente: r.fuente,
    });
  }

  return { filas, agrupadas, publicacionesAgrupadas, sinHora };
}

/** Primer y último día de un mes "YYYY-MM". */
export function rangoDelMes(mes: string): { desde: string; hasta: string } {
  const [anio, m] = mes.split("-").map(Number);
  // El día 0 del mes siguiente es el último del mes pedido, incluidos los
  // bisiestos, sin tener que acordarse de cuántos días tiene cada uno.
  const ultimo = new Date(Date.UTC(anio, m, 0)).getUTCDate();
  return { desde: `${mes}-01`, hasta: `${mes}-${String(ultimo).padStart(2, "0")}` };
}

/** true si el texto tiene la forma "YYYY-MM". */
export function esMesValido(v: unknown): v is string {
  if (typeof v !== "string" || !/^\d{4}-(0[1-9]|1[0-2])$/.test(v)) return false;
  const anio = Number(v.slice(0, 4));
  // Un año fuera de rango no es un mes que alguien quiso escribir.
  return anio >= 2000 && anio <= 2100;
}
