/**
 * §5.1 — Lectores de los archivos que exporta cada plataforma.
 *
 * Corren en el servidor: `xlsx` pesa cerca de un mega y no tiene por qué viajar
 * al navegador. Cada lector devuelve el mismo `ResultadoImport`, con
 * advertencias explícitas sobre los campos que esa fuente no entrega.
 */

import Papa from "papaparse";
import * as XLSX from "xlsx";
import type { Categoria, Plataforma } from "@/lib/dominio/plataformas";
import { clasificarInstagram } from "./clasificar";
import type { PublicacionImportada, ResultadoImport } from "./tipos";
import {
  fechaDeCelda,
  mesDe,
  num,
  type OrdenFecha,
  sumaOpcional,
  texto,
} from "./util";

type Fila = Record<string, unknown>;

const CUENTAS_INSTAGRAM: Record<string, Plataforma> = {
  dltsports: "Instagram DLT",
  "debuenafuente.dlt": "Instagram DBF",
};

/* ------------------------------------------------------------------ */
/* Meta Business Suite — CSV (Instagram DLT y DBF)                     */
/* ------------------------------------------------------------------ */

/** §5.1: mapeo del "Tipo de publicación" de Meta a nuestro formato. */
const FORMATO_META: Record<string, Categoria> = {
  "Reel de Instagram": "Reel",
  "Imagen de Instagram": "Imagen",
  "Secuencia de Instagram": "Carrusel",
};

export function leerMetaCSV(contenido: string): ResultadoImport {
  const sinBOM = contenido.replace(/^﻿/, "");
  const { data } = Papa.parse<Fila>(sinBOM, {
    header: true,
    skipEmptyLines: true,
  });

  const cuenta =
    texto(data.find((f) => texto(f["Nombre de usuario de la cuenta"]))?.[
      "Nombre de usuario de la cuenta"
    ]) ?? "";
  const plataforma = CUENTAS_INSTAGRAM[cuenta];
  if (!plataforma) {
    throw new Error(
      `La cuenta "${cuenta}" del CSV no corresponde a Instagram DLT (@dltsports) ni a Instagram DBF (@debuenafuente.dlt).`,
    );
  }
  const claveCuenta = cuenta as "dltsports" | "debuenafuente.dlt";

  const publicaciones: PublicacionImportada[] = [];
  for (const f of data) {
    // Meta usa MM/DD/YYYY. YouTube usa DD/MM/YYYY. No son intercambiables.
    const publicado_en = fechaDeCelda(f["Hora de publicación"], "MDY");
    if (!publicado_en) continue;

    const caption = texto(f["Descripción"]);
    const clas = clasificarInstagram(claveCuenta, caption);

    const me_gusta = num(f["Me gusta"]);
    const comentarios = num(f["Comentarios"]);
    const compartidos = num(f["Veces que se compartió"]);
    const guardados = num(f["Veces que se guardó"]);

    publicaciones.push({
      plataforma,
      publicado_en,
      formato: FORMATO_META[String(f["Tipo de publicación"] ?? "").trim()] ?? null,
      tipo: clas.tipo,
      tipo_auto: clas.tipo,
      serie_hashtag: clas.serie,
      caption,
      duracion_s: num(f["Duración (segundos)"]),
      visualizaciones: num(f["Visualizaciones"]),
      alcance: num(f["Alcance"]),
      me_gusta,
      comentarios,
      compartidos,
      guardados,
      favoritos: null,
      nuevos_seguidores: num(f["Seguimientos"]),
      interacciones: sumaOpcional(me_gusta, comentarios, compartidos, guardados),
      enlace: texto(f["Enlace permanente"]),
      id_externo: texto(f["Identificador de la publicación"]),
      fuente: "meta",
    });
  }

  return {
    plataforma,
    fuente: "meta",
    cuenta,
    publicaciones,
    meses: mesesDe(publicaciones),
    advertencias: [],
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
  const cuenta = (cab.perfil ?? "").replace(/^@/, "");
  const plataforma = CUENTAS_INSTAGRAM[cuenta];
  if (!plataforma) {
    throw new Error(
      `La cuenta "${cuenta}" del Excel no corresponde a Instagram DLT (@dltsports) ni a Instagram DBF (@debuenafuente.dlt).`,
    );
  }
  const claveCuenta = cuenta as "dltsports" | "debuenafuente.dlt";

  const publicaciones: PublicacionImportada[] = [];
  for (const f of cab.filas) {
    const publicado_en = fechaDeCelda(f["Date"], "DMY");
    if (!publicado_en) continue;

    const caption = texto(f["Caption"]);
    const clas = clasificarInstagram(claveCuenta, caption);

    const me_gusta = num(f["Likes"]);
    const comentarios = num(f["Comments"]);
    const guardados = num(f["Saves"]);
    const compartidos = num(f["Shares"]);

    publicaciones.push({
      plataforma,
      publicado_en,
      formato:
        FORMATO_ICONOSQUARE[String(f["Type"] ?? "").trim().toLowerCase()] ?? null,
      tipo: clas.tipo,
      tipo_auto: clas.tipo,
      serie_hashtag: clas.serie,
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
    plataforma,
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

    publicaciones.push({
      plataforma: "TikTok",
      publicado_en,
      formato: "Video", // única categoría de TikTok
      tipo: null,
      tipo_auto: null,
      serie_hashtag: null,
      caption: texto(f["Caption"]),
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
    plataforma: "TikTok",
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

    publicaciones.push({
      plataforma: "YouTube",
      publicado_en,
      formato: FORMATO_YOUTUBE[String(f["Type"] ?? "").trim().toLowerCase()] ?? null,
      tipo: null,
      tipo_auto: null,
      serie_hashtag: null,
      caption: texto(f["Caption"]),
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
    plataforma: "YouTube",
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
