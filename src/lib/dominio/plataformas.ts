/**
 * Enums de plataforma y categoría.
 *
 * Regla de negocio §9.3: los nombres NUNCA son texto libre. En el Excel alguien
 * escribió "Normal (informativo)" en lugar de "Normal" y rompió todas las
 * comparaciones contra la línea base. Acá son uniones cerradas de TypeScript y
 * enums de Postgres: un valor fuera de la lista no compila ni entra a la base.
 */

export const PLATAFORMAS = [
  "Instagram DLT",
  "Instagram DBF",
  "TikTok",
  "YouTube",
  "Twitter/X",
] as const;

export type Plataforma = (typeof PLATAFORMAS)[number];

export const CATEGORIAS = [
  "Reactivo",
  "Normal",
  "Imagen",
  "Reel",
  "Carrusel",
  "Short",
  "Video",
  "Foto",
] as const;

export type Categoria = (typeof CATEGORIAS)[number];

/**
 * En Instagram conviven dos clasificaciones sobre la misma publicación:
 *  - tipo de contenido: Reactivo | Normal
 *  - formato:           Imagen | Reel | Carrusel
 *
 * §3.2: una publicación pertenece a una de cada una, pero en el registro diario
 * se etiqueta con UNA SOLA. Por eso el TOTAL jamás se calcula sumando categorías
 * (se contaría dos veces) — ver `filasDeTotal` en calculo.ts.
 */
export const TIPOS_INSTAGRAM = ["Reactivo", "Normal"] as const;
export const FORMATOS_INSTAGRAM = ["Imagen", "Reel", "Carrusel"] as const;

export const CATEGORIAS_POR_PLATAFORMA: Record<Plataforma, readonly Categoria[]> = {
  "Instagram DLT": [...TIPOS_INSTAGRAM, ...FORMATOS_INSTAGRAM],
  "Instagram DBF": [...TIPOS_INSTAGRAM, ...FORMATOS_INSTAGRAM],
  // La especificación original decía "sin categorías, solo total", pero el
  // equipo lo registra como Video: así queda etiquetado y no como "sin
  // categoría".
  TikTok: ["Video"],
  YouTube: ["Short", "Video"],
  "Twitter/X": ["Video", "Foto"],
};

export function categoriasDe(plataforma: Plataforma): readonly Categoria[] {
  return CATEGORIAS_POR_PLATAFORMA[plataforma];
}

export function esCategoriaValida(plataforma: Plataforma, categoria: Categoria | null): boolean {
  if (categoria === null) return true; // null = "sin categoría" (TikTok) o fila TOTAL
  return CATEGORIAS_POR_PLATAFORMA[plataforma].includes(categoria);
}

export function esPlataforma(v: unknown): v is Plataforma {
  return typeof v === "string" && (PLATAFORMAS as readonly string[]).includes(v);
}

export function esCategoria(v: unknown): v is Categoria {
  return typeof v === "string" && (CATEGORIAS as readonly string[]).includes(v);
}

/**
 * §9.6: YouTube no entrega alcance. Su engagement se calcula sobre
 * visualizaciones y debe rotularse como NO comparable con las otras plataformas.
 */
export function tieneAlcance(plataforma: Plataforma): boolean {
  return plataforma !== "YouTube";
}

/** Etiqueta de la métrica que hace de denominador del engagement. */
export function denominadorEngagement(plataforma: Plataforma): "alcance" | "visualizaciones" {
  return tieneAlcance(plataforma) ? "alcance" : "visualizaciones";
}

export const CUENTAS: Record<Plataforma, string> = {
  "Instagram DLT": "@dltsports",
  "Instagram DBF": "@debuenafuente.dlt",
  TikTok: "@dltsportsoficial",
  YouTube: "@dltsportstv",
  "Twitter/X": "Cuenta DLT",
};

/** Color de marca por plataforma. §8: se usa como acento, nunca como fondo. */
export const COLOR_PLATAFORMA: Record<Plataforma, string> = {
  "Instagram DLT": "#d6216f",
  "Instagram DBF": "#7c3aed",
  TikTok: "#0f172a",
  YouTube: "#dc2626",
  "Twitter/X": "#111827",
};

/** Acento secundario, para el filete de TikTok que en la marca es negro/cyan. */
export const COLOR_PLATAFORMA_2: Record<Plataforma, string> = {
  "Instagram DLT": "#f0a03c",
  "Instagram DBF": "#a855f7",
  TikTok: "#22d3ee",
  YouTube: "#ef4444",
  "Twitter/X": "#374151",
};

/** Orden en que se muestran los bloques del panel diario. */
export const ORDEN_PLATAFORMAS = PLATAFORMAS;

/** Slug estable para URLs y anclas. */
export const SLUG_PLATAFORMA: Record<Plataforma, string> = {
  "Instagram DLT": "ig-dlt",
  "Instagram DBF": "ig-dbf",
  TikTok: "tiktok",
  YouTube: "youtube",
  "Twitter/X": "twitter",
};
