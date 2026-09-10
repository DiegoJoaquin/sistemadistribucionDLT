/**
 * Acceso a los archivos de exportación reales que se usan en los tests.
 *
 * Viven en la carpeta que contiene al repositorio, no dentro: son datos de
 * desempeño de la empresa y no corresponde versionarlos. Por eso los tests que
 * dependen de ellos se saltan solos cuando no están, en vez de caerse con un
 * "archivo no encontrado" en el clon de un compañero o en CI.
 */

import { existsSync, readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";

export const CARPETA_EJEMPLOS = fileURLToPath(new URL("../../../../", import.meta.url));

export const EJEMPLOS = {
  dbfMeta: "DBFINSTAGRAMAug-01-2026_Aug-31-2026_1552123462682178.csv",
  dltIconosquare:
    "DLTINSTAGRAMmedia_exports_dltsports_posts_20260902162230_6a984d462441a.xlsx",
  tiktok: "tiktokmedia_exports_dltsportsoficial_posts_20260902161312_6a984b1867947.xlsx",
  youtube: "youtubemedia_exports_dltsportstv_posts_20260902160240_6a9848a092f57.xlsx",
  excelKpis: "KPIs_Diarios_DLT_Agosto (2).xlsx",
} as const;

export type NombreEjemplo = keyof typeof EJEMPLOS;

export function rutaEjemplo(cual: NombreEjemplo): string {
  return CARPETA_EJEMPLOS + EJEMPLOS[cual];
}

/** true si están todos los archivos que pide la lista (o todos, si no se pasa). */
export function hayEjemplos(...cuales: NombreEjemplo[]): boolean {
  const lista = cuales.length > 0 ? cuales : (Object.keys(EJEMPLOS) as NombreEjemplo[]);
  return lista.every((c) => existsSync(rutaEjemplo(c)));
}

/** Lee un archivo de ejemplo como ArrayBuffer, listo para los lectores. */
export function bufferEjemplo(cual: NombreEjemplo): ArrayBuffer {
  const buf = readFileSync(rutaEjemplo(cual));
  return buf.buffer.slice(buf.byteOffset, buf.byteOffset + buf.byteLength) as ArrayBuffer;
}

export const MOTIVO_SIN_EJEMPLOS =
  "faltan los archivos de exportación de ejemplo en la carpeta que contiene al repositorio";
