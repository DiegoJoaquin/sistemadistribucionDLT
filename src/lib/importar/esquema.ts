/**
 * Validación de lo que manda el navegador después de leer el archivo.
 *
 * El archivo se lee en el navegador para no subir siete megas a una acción de
 * servidor, así que lo que llega ya no es un archivo sino un JSON armado por el
 * cliente. Eso NO es más peligroso —quien lo manda es alguien del equipo, que
 * ya puede cargar registros a mano— pero sí es menos confiable: un payload
 * malformado por un error de la propia aplicación, o por una pestaña con una
 * versión vieja, no debería llegar a la base ni tumbar la acción.
 *
 * Así que se valida la forma completa antes de tocar nada. Las reglas de §9
 * (nulo no es cero, alcance de YouTube) se siguen aplicando después, sobre los
 * datos ya validados.
 */

import { z } from "zod";
import { CATEGORIAS } from "@/lib/dominio/categorias";
import { REDES } from "@/lib/dominio/redes";

/**
 * Entero o nulo. §9.4: lo que no viene es null, nunca 0.
 *
 * Sin `.safe()`: eso exige un entero y las exportaciones traen decimales en
 * algunas columnas. Se redondea, que es lo que hacía el lector.
 *
 * `.catch(null)` en vez de rechazar: una métrica ilegible en una publicación no
 * debería tumbar la importación de las otras mil.
 */
const entero = z
  .number()
  .finite()
  .nullable()
  .catch(null)
  .transform((v) => (v === null ? null : Math.round(v)));

/**
 * Texto acotado, RECORTADO en vez de descartado.
 *
 * Nulo si es demasiado largo sería peor que recortarlo: el caption es lo que
 * usa el cruce entre las dos exportaciones de Instagram para emparejar
 * publicaciones, así que vaciarlo rompe ese cruce en silencio.
 */
const textoNulable = (max: number) =>
  z
    .string()
    .nullable()
    .catch(null)
    .transform((v) => (v === null ? null : v.slice(0, max)));

const categoria = z.enum(CATEGORIAS).nullable().catch(null);

export const FUENTES_IMPORT = [
  "meta",
  "iconosquare",
  "tiktok",
  "youtube",
  "manual",
] as const;

/**
 * Naive local "YYYY-MM-DDTHH:mm:ss", sin zona.
 *
 * Se valida la forma porque de acá sale la fecha de cada publicación: un texto
 * cualquiera produciría filas en fechas inventadas.
 */
const naive = z
  .string()
  .regex(
    /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}$/,
    "La hora de publicación no tiene el formato esperado.",
  )
  .nullable();

export const esquemaPublicacion = z.object({
  publicado_en: naive,
  formato: categoria,
  tipo: categoria,
  tipo_auto: categoria,
  serie_hashtag: textoNulable(200),
  /*
   * El caption va completo y no recortado: la línea base lo guarda entero
   * porque el cruce entre las dos exportaciones de Instagram calza por texto.
   * El recorte a 300 se hace recién al armar la fila del registro.
   */
  caption: textoNulable(10_000),
  duracion_s: entero,
  visualizaciones: entero,
  alcance: entero,
  me_gusta: entero,
  comentarios: entero,
  compartidos: entero,
  guardados: entero,
  favoritos: entero,
  nuevos_seguidores: entero,
  interacciones: entero,
  enlace: textoNulable(2_000),
  id_externo: textoNulable(500),
  fuente: z.enum(FUENTES_IMPORT),
});

/**
 * Tope de publicaciones por importación.
 *
 * Nueve meses de la cuenta más activa son unas 3.000, así que 20.000 deja
 * muchísimo margen. Existe para que un payload absurdo no deje al servidor
 * armando filas hasta que se caiga por memoria.
 */
export const MAXIMO_PUBLICACIONES = 20_000;

export const esquemaResultadoImport = z.object({
  detectada: z.object({
    usuario: z.string().max(200).nullable(),
    red: z.enum(REDES),
  }),
  fuente: z.enum(FUENTES_IMPORT),
  cuenta: z.string().max(200).nullable(),
  publicaciones: z
    .array(esquemaPublicacion)
    .max(
      MAXIMO_PUBLICACIONES,
      `El archivo trae más de ${MAXIMO_PUBLICACIONES} publicaciones. Divídelo por trimestre.`,
    ),
  meses: z.array(z.string().regex(/^\d{4}-\d{2}$/)).max(240),
  advertencias: z.array(z.string().max(2_000)).max(50),
});

export type ResultadoImportValidado = z.output<typeof esquemaResultadoImport>;

/**
 * Lee el JSON que mandó el navegador.
 *
 * Devuelve el error en vez de lanzarlo: quien llama es una acción de servidor
 * que tiene que poder mostrarlo en pantalla, no caerse con un 500 — que es
 * justamente lo que dejaba la página en blanco.
 */
export function leerResultadoImport(
  crudo: unknown,
): { ok: true; datos: ResultadoImportValidado } | { ok: false; mensaje: string } {
  const parseado = esquemaResultadoImport.safeParse(crudo);
  if (parseado.success) return { ok: true, datos: parseado.data };

  const primero = parseado.error.issues[0];
  const donde = primero?.path.join(".") ?? "";
  return {
    ok: false,
    mensaje: `No pude leer los datos del archivo${
      donde ? ` (${donde})` : ""
    }: ${primero?.message ?? "formato inesperado"}. Recarga la página y vuelve a intentarlo.`,
  };
}
