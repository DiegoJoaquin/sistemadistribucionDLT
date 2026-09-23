/**
 * Redes sociales y cuentas.
 *
 * La distinción es la que faltaba: una **red** es Instagram, TikTok, YouTube o
 * Twitter/X, y es un enum porque las reglas del negocio dependen de ella. Una
 * **cuenta** es @dltsports, @diegoat o DLT Running, y es un dato: se agrega
 * desde la aplicación, sin tocar el código.
 *
 * Antes las dos cosas estaban mezcladas en un solo enum de cinco valores. Eso
 * alcanzaba mientras las cuentas fueran cinco y fijas; con las cuentas de los
 * influencers, agregar una habría significado modificar el enum y desplegar.
 *
 * §9.3 sigue en pie: lo que nunca es texto libre son las categorías y las
 * redes. El nombre de una cuenta sí lo es, pero eso no rompe ninguna
 * comparación, porque las filas apuntan a la cuenta por su id.
 */

import { type Categoria, FORMATOS_INSTAGRAM, TIPOS_INSTAGRAM } from "./categorias";

export const REDES = ["Instagram", "TikTok", "YouTube", "Twitter/X"] as const;

export type Red = (typeof REDES)[number];

export function esRed(v: unknown): v is Red {
  return typeof v === "string" && (REDES as readonly string[]).includes(v);
}

/** §3.2 — qué categorías aplican en cada red. */
export const CATEGORIAS_POR_RED: Record<Red, readonly Categoria[]> = {
  Instagram: [...TIPOS_INSTAGRAM, ...FORMATOS_INSTAGRAM],
  // La especificación decía "sin categorías", pero el equipo lo registra como
  // Video, así que queda etiquetado y no como "sin categoría".
  TikTok: ["Video"],
  YouTube: ["Short", "Video"],
  "Twitter/X": ["Video", "Foto"],
};

export function categoriasDeRed(red: Red): readonly Categoria[] {
  return CATEGORIAS_POR_RED[red];
}

export function esCategoriaValidaEnRed(red: Red, categoria: Categoria | null): boolean {
  // null es válido siempre: es "sin categoría" y también la fila TOTAL.
  if (categoria === null) return true;
  return CATEGORIAS_POR_RED[red].includes(categoria);
}

/**
 * §9.6 — YouTube no entrega alcance. Su engagement se calcula sobre
 * visualizaciones y hay que rotularlo como no comparable con el de las otras.
 */
export function tieneAlcanceRed(red: Red): boolean {
  return red !== "YouTube";
}

export function denominadorEngagementRed(red: Red): "alcance" | "visualizaciones" {
  return tieneAlcanceRed(red) ? "alcance" : "visualizaciones";
}

/** Color de marca por red. §8: se usa como acento, nunca como fondo. */
export const COLOR_RED: Record<Red, string> = {
  Instagram: "#d6216f",
  TikTok: "#0f172a",
  YouTube: "#dc2626",
  "Twitter/X": "#111827",
};

/** Acento secundario: el de TikTok en la marca es negro con cyan. */
export const COLOR_RED_2: Record<Red, string> = {
  Instagram: "#f0a03c",
  TikTok: "#22d3ee",
  YouTube: "#ef4444",
  "Twitter/X": "#374151",
};

/* ------------------------------------------------------------------ */
/* Cuentas                                                             */
/* ------------------------------------------------------------------ */

export interface Cuenta {
  id: string;
  /** Cómo se llama en los reportes: "Instagram DLT", "DiegoAT". */
  nombre: string;
  /** El @ de la cuenta, para distinguir dos cuentas de nombre parecido. */
  usuario: string | null;
  red: Red;
  /** Separa las cuentas propias del grupo de las de los influencers. */
  es_influencer: boolean;
  /**
   * Una cuenta que se deja de usar se desactiva, no se borra: sus registros
   * históricos tienen que seguir existiendo.
   */
  activa: boolean;
  orden: number;
}

/** Las reglas de una cuenta son las de su red. */
export const categoriasDeCuenta = (c: Cuenta) => categoriasDeRed(c.red);
export const tieneAlcanceCuenta = (c: Cuenta) => tieneAlcanceRed(c.red);
export const colorDeCuenta = (c: Cuenta) => COLOR_RED[c.red];
export const colorSecundarioDeCuenta = (c: Cuenta) => COLOR_RED_2[c.red];

/** Handle con arroba, listo para mostrar. */
export function usuarioVisible(c: Cuenta): string | null {
  if (!c.usuario) return null;
  const t = c.usuario.trim();
  if (!t) return null;
  // Los nombres que no son handles ("Cuenta DLT") se dejan tal cual.
  return t.startsWith("@") || t.includes(" ") ? t : `@${t}`;
}

/**
 * Orden de presentación: primero las cuentas propias, después las de
 * influencers, y dentro de cada grupo por el orden que fijó el equipo.
 */
export function ordenarCuentas<T extends Cuenta>(cuentas: readonly T[]): T[] {
  return [...cuentas].sort(
    (a, b) =>
      Number(a.es_influencer) - Number(b.es_influencer) ||
      a.orden - b.orden ||
      a.nombre.localeCompare(b.nombre, "es"),
  );
}

/**
 * Agrupa por red, respetando el orden de REDES.
 *
 * Genérica para no perder los campos de la fila: quien le pasa `CuentaRow`
 * recibe `CuentaRow`, no un `Cuenta` recortado.
 */
export function porRed<T extends Cuenta>(
  cuentas: readonly T[],
): { red: Red; cuentas: T[] }[] {
  return REDES.flatMap((red) => {
    const suyas = ordenarCuentas(cuentas.filter((c) => c.red === red));
    return suyas.length > 0 ? [{ red, cuentas: suyas }] : [];
  });
}
