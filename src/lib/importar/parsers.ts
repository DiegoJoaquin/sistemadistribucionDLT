/**
 * §5.1 — Lectores de los archivos que exporta cada plataforma.
 *
 * Corren en el NAVEGADOR, no en el servidor, y eso es un cambio deliberado.
 *
 * Antes el archivo se subía completo a una acción de servidor. Con un export
 * de nueve meses —el de Voz del Cacique pesa 7 MB— la página se ponía en
 * blanco: las acciones de servidor de Next rechazan los cuerpos de más de 1 MB
 * ANTES de que corra el código de la acción, así que ni el try/catch ni el
 * mensaje de error alcanzaban a ejecutarse. Y subir el límite no bastaba,
 * porque la plataforma donde está desplegado tiene su propio tope, más bajo que
 * el tamaño de estos archivos.
 *
 * Leyendo acá, al servidor solo viajan las filas extraídas, que pesan una
 * fracción. El megabyte de `xlsx` se carga con un import dinámico y solo cuando
 * alguien elige un archivo, así que no lo paga quien no importa nada.
 *
 * Cada lector devuelve el mismo `ResultadoImport`, con advertencias explícitas
 * sobre los campos que esa fuente no entrega.
 */

import Papa from "papaparse";
import * as XLSX from "xlsx";
import type { Categoria } from "@/lib/dominio/categorias";
import { clasificarSiSePuede } from "./clasificar";
import { columnasDe, formatoDePublicacion, META } from "./columnas";
import type { PublicacionImportada, ResultadoImport } from "./tipos";
import {
  detectarOrdenFecha,
  fechaDeCelda,
  mesDe,
  num,
  type OrdenFecha,
  primerHashtag,
  sumaOpcional,
  texto,
} from "./util";

type Fila = Record<string, unknown>;

/* ------------------------------------------------------------------ */
/* Meta Business Suite — CSV (Instagram DLT y DBF)                     */
/* ------------------------------------------------------------------ */

export function leerMetaCSV(contenido: string): ResultadoImport {
  const sinBOM = contenido.replace(/^﻿/, "");
  const { data } = Papa.parse<Fila>(sinBOM, {
    header: true,
    skipEmptyLines: true,
  });

  const col = columnasDe(data);

  const cuenta = texto(
    data.find((f) => texto(col.valor(f, ...META.cuenta)))?.[
      col.clave(...META.cuenta) ?? ""
    ],
  );

  if (!cuenta) {
    /*
     * Listar los encabezados que SÍ vino es lo que convierte esto en algo
     * diagnosticable. Antes decía solo que faltaba la columna, y con un
     * archivo en otro idioma no había forma de avanzar sin abrir el CSV.
     */
    const vistos = col.encabezados.slice(0, 12).join(", ");
    throw new Error(
      `El CSV no trae una columna con el usuario de la cuenta (${META.cuenta.join(
        " o ",
      )}), así que no puedo saber de qué cuenta es. Los encabezados que trae son: ${
        vistos || "ninguno"
      }. ¿Es la exportación de publicaciones de Meta Business Suite?`,
    );
  }

  /*
   * El orden de la fecha se deduce de los datos en vez de darlo por sentado.
   * Estaba fijo en MM/DD porque así venían los archivos en castellano, pero
   * Meta también exporta en inglés y no hay nada que garantice que el orden no
   * cambie con el idioma.
   */
  const claveFecha = col.clave(...META.publicado);
  const orden = detectarOrdenFecha(
    claveFecha === null ? [] : data.map((f) => f[claveFecha]),
    "MDY",
  );

  const publicaciones: PublicacionImportada[] = [];
  for (const f of data) {
    const publicado_en = fechaDeCelda(col.valor(f, ...META.publicado), orden.orden);
    if (!publicado_en) continue;

    const caption = texto(col.valor(f, ...META.caption));
    const clas = clasificarSiSePuede(cuenta, caption);

    const me_gusta = num(col.valor(f, ...META.meGusta));
    const comentarios = num(col.valor(f, ...META.comentarios));
    const compartidos = num(col.valor(f, ...META.compartidos));
    const guardados = num(col.valor(f, ...META.guardados));

    publicaciones.push({
      publicado_en,
      formato: formatoDePublicacion(col.valor(f, ...META.tipo)),
      tipo: clas?.tipo ?? null,
      tipo_auto: clas?.tipo ?? null,
      serie_hashtag: clas?.serie ?? primerHashtag(caption),
      caption,
      duracion_s: num(col.valor(f, ...META.duracion)),
      visualizaciones: num(col.valor(f, ...META.visualizaciones)),
      alcance: num(col.valor(f, ...META.alcance)),
      me_gusta,
      comentarios,
      compartidos,
      guardados,
      favoritos: null,
      nuevos_seguidores: num(col.valor(f, ...META.seguidores)),
      interacciones: sumaOpcional(me_gusta, comentarios, compartidos, guardados),
      enlace: texto(col.valor(f, ...META.enlace)),
      id_externo: texto(col.valor(f, ...META.id)),
      fuente: "meta",
    });
  }

  return {
    detectada: { usuario: cuenta, red: "Instagram" },
    fuente: "meta",
    cuenta,
    publicaciones,
    meses: mesesDe(publicaciones),
    advertencias: orden.seguro
      ? []
      : [
          `Ninguna fecha del archivo tiene el día mayor que 12, así que no pude deducir si el formato es día/mes o mes/día; asumí ${
            orden.orden === "MDY" ? "mes/día" : "día/mes"
          }, que es lo que usa Meta. Revisa que las fechas de las publicaciones sean las correctas.`,
        ],
  };
}

/* ------------------------------------------------------------------ */
/* Exportaciones con encabezado en la fila 4 (Iconosquare y similares) */
/* ------------------------------------------------------------------ */

interface CabeceraXLSX {
  perfil: string | null;
  red: string | null;
  filas: Fila[];
}

/**
 * Estos archivos traen tres líneas de metadatos y el encabezado real en la
 * fila 4:
 *   A1 Profile / B1 <cuenta>
 *   A2 Social network / B2 Instagram | TikTok | Youtube
 *   A3 Sort by / B3 ...
 *   A4 encabezados
 */
function leerXLSXFila4(buffer: ArrayBuffer): CabeceraXLSX {
  const libro = XLSX.read(buffer, { type: "array", cellDates: true });
  const hoja = libro.Sheets[libro.SheetNames[0]];
  if (!hoja) throw new Error("El archivo Excel no tiene ninguna hoja.");

  const crudo = XLSX.utils.sheet_to_json<unknown[]>(hoja, {
    header: 1,
    blankrows: false,
    defval: null,
  });

  const perfil = texto(crudo[0]?.[1]);
  const red = texto(crudo[1]?.[1]);

  const filas = XLSX.utils.sheet_to_json<Fila>(hoja, {
    range: 3, // fila 4, base 0
    defval: null,
  });

  return { perfil, red, filas };
}

function detectarRed(red: string | null): "instagram" | "tiktok" | "youtube" | null {
  const r = (red ?? "").toLowerCase();
  if (r.includes("instagram")) return "instagram";
  if (r.includes("tiktok")) return "tiktok";
  if (r.includes("youtube")) return "youtube";
  return null;
}

/* ---- Instagram (Iconosquare) ---- */

const FORMATO_ICONOSQUARE: Record<string, Categoria> = {
  photo: "Imagen",
  image: "Imagen",
  reel: "Reel",
  video: "Reel",
  carousel: "Carrusel",
};

function leerInstagramXLSX(cab: CabeceraXLSX): ResultadoImport {
  const cuenta = texto((cab.perfil ?? "").replace(/^@/, ""));
  if (!cuenta) {
    throw new Error(
      'El Excel no trae el perfil en la celda B1, así que no puedo saber de qué cuenta es.',
    );
  }
  const publicaciones: PublicacionImportada[] = [];
  for (const f of cab.filas) {
    const publicado_en = fechaDeCelda(f["Date"], "DMY");
    if (!publicado_en) continue;

    const caption = texto(f["Caption"]);
    const clas = clasificarSiSePuede(cuenta, caption);

    const me_gusta = num(f["Likes"]);
    const comentarios = num(f["Comments"]);
    const guardados = num(f["Saves"]);
    const compartidos = num(f["Shares"]);

    publicaciones.push({
      publicado_en,
      formato:
        FORMATO_ICONOSQUARE[String(f["Type"] ?? "").trim().toLowerCase()] ?? null,
      tipo: clas?.tipo ?? null,
      tipo_auto: clas?.tipo ?? null,
      serie_hashtag: clas?.serie ?? primerHashtag(caption),
      caption,
      duracion_s: null, // esta exportación no trae duración
      visualizaciones: num(f["Total Views / Impressions"]),
      alcance: num(f["Reach"]),
      me_gusta,
      comentarios,
      compartidos,
      guardados,
      favoritos: null,
      nuevos_seguidores: null, // esta exportación no trae seguidores nuevos
      interacciones:
        num(f["Post engagement"]) ??
        sumaOpcional(me_gusta, comentarios, compartidos, guardados),
      enlace: texto(f["Instagram URL"]),
      id_externo: texto(f["Instagram URL"]),
      fuente: "iconosquare",
    });
  }

  return {
    detectada: { usuario: cuenta, red: "Instagram" },
    fuente: "iconosquare",
    cuenta,
    publicaciones,
    meses: mesesDe(publicaciones),
    advertencias: [
      "Esta exportación no incluye nuevos seguidores ni duración. Súbelas también desde el CSV de Meta Business Suite para completar esos campos.",
    ],
  };
}

/* ---- TikTok ---- */

function leerTikTokXLSX(cab: CabeceraXLSX): ResultadoImport {
  const publicaciones: PublicacionImportada[] = [];
  for (const f of cab.filas) {
    const publicado_en = fechaDeCelda(f["Date and time"], "DMY");
    if (!publicado_en) continue;

    const me_gusta = num(f["Likes"]);
    const comentarios = num(f["Comments"]);
    const favoritos = num(f["Favorites"]);
    const compartidos = num(f["Shares"]);
    const caption = texto(f["Caption"]);

    publicaciones.push({
      publicado_en,
      formato: "Video", // única categoría de TikTok
      // Reactivo/Normal es una clasificación de Instagram (§3.2).
      tipo: null,
      tipo_auto: null,
      // El hashtag sí: es el corte del catastro semanal y existe en toda red.
      serie_hashtag: primerHashtag(caption),
      caption,
      duracion_s: num(f["Video duration (seconds)"]),
      visualizaciones: num(f["Video Views"]),
      alcance: num(f["Reach"]),
      me_gusta,
      comentarios,
      compartidos,
      guardados: null,
      favoritos,
      nuevos_seguidores: null,
      interacciones: sumaOpcional(me_gusta, comentarios, favoritos, compartidos),
      enlace: texto(f["Tiktok video URL"]),
      id_externo: texto(f["Tiktok video URL"]),
      fuente: "tiktok",
    });
  }

  return {
    detectada: { usuario: cab.perfil, red: "TikTok" },
    fuente: "tiktok",
    cuenta: cab.perfil,
    publicaciones,
    meses: mesesDe(publicaciones),
    advertencias: [
      "TikTok no entrega nuevos seguidores por publicación: ese campo queda vacío.",
    ],
  };
}

/* ---- YouTube ---- */

const FORMATO_YOUTUBE: Record<string, Categoria> = {
  short: "Short",
  shorts: "Short",
  video: "Video",
};

function leerYouTubeXLSX(cab: CabeceraXLSX): ResultadoImport {
  const publicaciones: PublicacionImportada[] = [];
  for (const f of cab.filas) {
    // YouTube exporta DD/MM/YYYY como texto, no como fecha de Excel.
    const publicado_en = fechaDeCelda(f["Date and time"], "DMY");
    if (!publicado_en) continue;

    const me_gusta = num(f["Likes"]);
    const comentarios = num(f["Comments"]);
    const compartidos = num(f["Shares"]);
    const caption = texto(f["Caption"]);

    publicaciones.push({
      publicado_en,
      formato: FORMATO_YOUTUBE[String(f["Type"] ?? "").trim().toLowerCase()] ?? null,
      tipo: null,
      tipo_auto: null,
      serie_hashtag: primerHashtag(caption),
      caption,
      duracion_s: num(f["Video duration (seconds)"]),
      visualizaciones: num(f["Views"]),
      alcance: null, // §9.6: YouTube no entrega alcance
      me_gusta,
      comentarios,
      compartidos,
      guardados: null,
      favoritos: null,
      nuevos_seguidores: null,
      interacciones: sumaOpcional(me_gusta, comentarios, compartidos),
      enlace: texto(f["Youtube video URL"]),
      id_externo: texto(f["Youtube video URL"]),
      fuente: "youtube",
    });
  }

  return {
    detectada: { usuario: cab.perfil, red: "YouTube" },
    fuente: "youtube",
    cuenta: cab.perfil,
    publicaciones,
    meses: mesesDe(publicaciones),
    advertencias: [
      "YouTube no entrega alcance: su engagement se calcula sobre visualizaciones y no es comparable con el de las otras plataformas.",
    ],
  };
}

/* ------------------------------------------------------------------ */
/* Dispatcher                                                          */
/* ------------------------------------------------------------------ */

export function leerArchivo(
  nombre: string,
  buffer: ArrayBuffer,
): ResultadoImport {
  const esCSV = nombre.toLowerCase().endsWith(".csv");
  if (esCSV) {
    return leerMetaCSV(new TextDecoder("utf-8").decode(buffer));
  }

  const cab = leerXLSXFila4(buffer);
  switch (detectarRed(cab.red)) {
    case "instagram":
      return leerInstagramXLSX(cab);
    case "tiktok":
      return leerTikTokXLSX(cab);
    case "youtube":
      return leerYouTubeXLSX(cab);
    default:
      throw new Error(
        `No pude reconocer la red social del archivo "${nombre}". Se esperaba "Instagram", "TikTok" o "Youtube" en la celda B2.`,
      );
  }
}

function mesesDe(publicaciones: PublicacionImportada[]): string[] {
  const set = new Set<string>();
  for (const p of publicaciones) {
    if (p.publicado_en) set.add(mesDe(p.publicado_en));
  }
  return [...set].sort();
}

export const _ordenFechaPorFuente: Record<string, OrdenFecha> = {
  meta: "MDY",
  youtube: "DMY",
};
