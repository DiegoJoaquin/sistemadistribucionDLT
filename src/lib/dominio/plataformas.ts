/**
 * Las cinco cuentas originales, como enum.
 *
 * Este módulo es transitorio. Las cuentas ya son datos (ver `redes.ts` y la
 * tabla `cuentas`), pero buena parte de la aplicación todavía las trata como
 * un enum de cinco valores, y convertir todo de una sola vez sería un cambio
 * imposible de revisar. Mientras dure la transición, acá se mantiene la API
 * vieja, pero **sin duplicar las reglas**: cada plataforma sabe a qué red
 * pertenece y las preguntas se delegan a la red.
 *
 * Cuando el último archivo deje de importar desde acá, este módulo se borra
 * junto con la columna `plataforma` de la base.
 */

import {
  categoriasDeRed,
  COLOR_RED,
  COLOR_RED_2,
  denominadorEngagementRed,
  esCategoriaValidaEnRed,
  type Red,
  tieneAlcanceRed,
} from "./redes";
import { type Categoria } from "./categorias";

// Se re-exportan para no romper los imports existentes.
export {
  CATEGORIAS,
  type Categoria,
  esCategoria,
  FORMATOS_INSTAGRAM,
  TIPOS_INSTAGRAM,
} from "./categorias";
export { type Red, REDES, esRed } from "./redes";

export const PLATAFORMAS = [
  "Instagram DLT",
  "Instagram DBF",
  "TikTok",
  "YouTube",
  "Twitter/X",
] as const;

export type Plataforma = (typeof PLATAFORMAS)[number];

/** A qué red pertenece cada una de las cinco cuentas originales. */
export const RED_DE_PLATAFORMA: Record<Plataforma, Red> = {
  "Instagram DLT": "Instagram",
  "Instagram DBF": "Instagram",
  TikTok: "TikTok",
  YouTube: "YouTube",
  "Twitter/X": "Twitter/X",
};

export const CATEGORIAS_POR_PLATAFORMA: Record<Plataforma, readonly Categoria[]> = {
  "Instagram DLT": categoriasDeRed("Instagram"),
  "Instagram DBF": categoriasDeRed("Instagram"),
  TikTok: categoriasDeRed("TikTok"),
  YouTube: categoriasDeRed("YouTube"),
  "Twitter/X": categoriasDeRed("Twitter/X"),
};

export function categoriasDe(plataforma: Plataforma): readonly Categoria[] {
  return categoriasDeRed(RED_DE_PLATAFORMA[plataforma]);
}

export function esCategoriaValida(
  plataforma: Plataforma,
  categoria: Categoria | null,
): boolean {
  return esCategoriaValidaEnRed(RED_DE_PLATAFORMA[plataforma], categoria);
}

export function esPlataforma(v: unknown): v is Plataforma {
  return typeof v === "string" && (PLATAFORMAS as readonly string[]).includes(v);
}

/** §9.6 — YouTube no entrega alcance. */
export function tieneAlcance(plataforma: Plataforma): boolean {
  return tieneAlcanceRed(RED_DE_PLATAFORMA[plataforma]);
}

export function denominadorEngagement(
  plataforma: Plataforma,
): "alcance" | "visualizaciones" {
  return denominadorEngagementRed(RED_DE_PLATAFORMA[plataforma]);
}

export const CUENTAS: Record<Plataforma, string> = {
  "Instagram DLT": "@dltsports",
  "Instagram DBF": "@debuenafuente.dlt",
  TikTok: "@dltsportsoficial",
  YouTube: "@dltsportstv",
  "Twitter/X": "Cuenta DLT",
};

/**
 * Color por plataforma. DBF tiene su propio violeta, que es más específico que
 * el de la red; el resto sale del color de su red.
 */
export const COLOR_PLATAFORMA: Record<Plataforma, string> = {
  "Instagram DLT": COLOR_RED.Instagram,
  "Instagram DBF": "#7c3aed",
  TikTok: COLOR_RED.TikTok,
  YouTube: COLOR_RED.YouTube,
  "Twitter/X": COLOR_RED["Twitter/X"],
};

export const COLOR_PLATAFORMA_2: Record<Plataforma, string> = {
  "Instagram DLT": COLOR_RED_2.Instagram,
  "Instagram DBF": "#a855f7",
  TikTok: COLOR_RED_2.TikTok,
  YouTube: COLOR_RED_2.YouTube,
  "Twitter/X": COLOR_RED_2["Twitter/X"],
};

/** Orden en que se muestran los bloques del panel diario. */
export const ORDEN_PLATAFORMAS = PLATAFORMAS;

export const SLUG_PLATAFORMA: Record<Plataforma, string> = {
  "Instagram DLT": "ig-dlt",
  "Instagram DBF": "ig-dbf",
  TikTok: "tiktok",
  YouTube: "youtube",
  "Twitter/X": "twitter",
};
