/**
 * Lector del export de YouTube Studio («Datos de la tabla»).
 *
 * Existe por una razón concreta: el export de YouTube que entrega Iconosquare
 * no trae el título de los videos (la columna de texto viene vacía en los
 * Shorts), y sin título no hay forma de reconocer que un Short es el mismo
 * video que se subió a Instagram y a TikTok. YouTube Studio sí trae el título,
 * además del ID, la duración y las visualizaciones.
 *
 * Una advertencia que se repite en la importación: las métricas de Studio son
 * las del PERÍODO que se eligió al exportar, no las del total del video. Por eso
 * a un video que ya estaba cargado solo se le completa el título
 * (`soloCompletaTexto`), y sus números de Iconosquare quedan como estaban.
 */

import type { WorkBook } from "xlsx";
import * as XLSX from "xlsx";
import type { Categoria } from "@/lib/dominio/categorias";
import type { PublicacionImportada, ResultadoImport } from "./tipos";
import { mesDe, naive, num, primerHashtag, texto } from "./util";

const HOJA = "Datos de la tabla";

/** Un Short dura a lo más 3 minutos. Studio no dice el tipo; se deduce de esto. */
const DURACION_MAXIMA_SHORT = 180;

type Fila = Record<string, unknown>;

/** ¿Es este libro un export de YouTube Studio? */
export function esYouTubeStudio(libro: WorkBook): boolean {
  const hoja = libro.Sheets[HOJA];
  if (!hoja) return false;
  const encabezado = XLSX.utils.sheet_to_json<unknown[]>(hoja, { header: 1, defval: "" })[0] ?? [];
  const nombres = encabezado.map((v) => String(v).trim());
  return nombres.includes("Contenido") && nombres.some((n) => /^T[ií]tulo del v[ií]deo$/i.test(n));
}

const MESES: Record<string, number> = {
  jan: 1, ene: 1, feb: 2, mar: 3, apr: 4, abr: 4, may: 5, jun: 6, jul: 7,
  aug: 8, ago: 8, sep: 9, set: 9, oct: 10, nov: 11, dec: 12, dic: 12,
};

/**
 * La fecha de publicación de Studio: "Jun 9, 2026" (en inglés aunque la
 * interfaz esté en castellano), "9 jun 2026" o una fecha de Excel. Solo trae el
 * día, sin hora.
 */
export function fechaStudio(v: unknown): string | null {
  if (v instanceof Date && !Number.isNaN(v.getTime())) {
    return naive(v.getFullYear(), v.getMonth() + 1, v.getDate());
  }
  if (typeof v !== "string") return null;
  const t = v.trim().toLowerCase().replace(/\./g, "");
  let m = t.match(/^([a-z]{3})[a-z]*\s+(\d{1,2}),?\s+(\d{4})$/);
  if (m && MESES[m[1]]) return naive(Number(m[3]), MESES[m[1]], Number(m[2]));
  m = t.match(/^(\d{1,2})\s+(?:de\s+)?([a-z]{3})[a-z]*\s+(?:de\s+)?(\d{4})$/);
  if (m && MESES[m[2]]) return naive(Number(m[3]), MESES[m[2]], Number(m[1]));
  return null;
}

/** El enlace público del video, con la forma que usa Iconosquare para cada tipo. */
export function enlaceYouTube(id: string, formato: Categoria): string {
  return formato === "Short" ? `https://www.youtube.com/shorts/${id}` : `https://www.youtube.com/watch?v=${id}`;
}

export function leerYouTubeStudio(libro: WorkBook): ResultadoImport {
  const filas = XLSX.utils.sheet_to_json<Fila>(libro.Sheets[HOJA], { defval: null });
  const publicaciones: PublicacionImportada[] = [];
  const meses = new Set<string>();

  for (const f of filas) {
    const id = texto(f["Contenido"]);
    // La primera fila es el total del canal.
    if (!id || id.toLowerCase() === "total") continue;
    const publicado_en = fechaStudio(f["Hora de publicación del vídeo"] ?? f["Hora de publicación del video"]);
    if (!publicado_en) continue;

    const titulo = texto(f["Título del vídeo"] ?? f["Título del video"]);
    const duracion = num(f["Duración"]);
    const formato: Categoria = duracion !== null && duracion <= DURACION_MAXIMA_SHORT ? "Short" : "Video";
    const enlace = enlaceYouTube(id, formato);
    meses.add(mesDe(publicado_en));

    publicaciones.push({
      publicado_en,
      formato,
      tipo: null,
      tipo_auto: null,
      serie_hashtag: primerHashtag(titulo),
      caption: titulo,
      duracion_s: duracion,
      visualizaciones: num(f["Visualizaciones"]),
      alcance: null, // §9.6: YouTube no entrega alcance
      me_gusta: num(f["Me gusta"]),
      // Studio no trae comentarios en esta tabla: sumar likes y compartidos daría
      // un total de interacciones más bajo que el de Iconosquare.
      comentarios: null,
      compartidos: num(f["Compartido"]),
      guardados: null,
      favoritos: null,
      nuevos_seguidores: num(f["Suscriptores ganados"]),
      interacciones: null,
      enlace,
      id_externo: enlace,
      fuente: "youtube",
      campanas: null,
    });
  }

  return {
    // Studio no dice de qué canal es: si hay una sola cuenta de YouTube, es esa.
    detectada: { usuario: null, red: "YouTube" },
    fuente: "youtube",
    cuenta: "YouTube Studio",
    publicaciones,
    meses: [...meses].sort(),
    soloCompletaTexto: true,
    advertencias: [
      "Es un export de YouTube Studio: sus visualizaciones son las del período que elegiste al exportar. A los videos que ya estaban cargados solo se les completa el título; los que no estaban se cargan con esas cifras.",
    ],
  };
}

/** El ID de un video de YouTube a partir de su enlace, sea Short, watch o youtu.be. */
export function idYouTube(enlace: string | null): string | null {
  if (!enlace) return null;
  const m = enlace.match(/(?:shorts\/|[?&]v=|youtu\.be\/)([\w-]{6,})/);
  return m ? m[1] : null;
}

/** Las dos formas en que puede estar guardado el mismo video. */
export function variantesYouTube(enlace: string): string[] {
  const id = idYouTube(enlace);
  if (!id) return [enlace];
  return [enlaceYouTube(id, "Short"), enlaceYouTube(id, "Video")];
}
