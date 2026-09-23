/**
 * Categorías de contenido.
 *
 * §9.3: nunca son texto libre. Acá son una unión cerrada de TypeScript y un
 * enum de Postgres, así que un valor fuera de la lista no compila ni entra a la
 * base. Están en su propio módulo para que tanto las redes como las cuentas
 * puedan usarlas sin importarse entre sí.
 */

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
 * §3.2: una publicación pertenece a una de cada una, pero en el registro se
 * etiqueta con UNA SOLA. Por eso el TOTAL jamás se calcula sumando categorías.
 */
export const TIPOS_INSTAGRAM = ["Reactivo", "Normal"] as const;
export const FORMATOS_INSTAGRAM = ["Imagen", "Reel", "Carrusel"] as const;

export type TipoInstagram = (typeof TIPOS_INSTAGRAM)[number];

export function esCategoria(v: unknown): v is Categoria {
  return typeof v === "string" && (CATEGORIAS as readonly string[]).includes(v);
}

export function esTipoInstagram(v: unknown): v is TipoInstagram {
  return typeof v === "string" && (TIPOS_INSTAGRAM as readonly string[]).includes(v);
}
