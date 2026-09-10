import type { Categoria, Plataforma } from "@/lib/dominio/plataformas";

export type FuenteImport = "meta" | "iconosquare" | "tiktok" | "youtube" | "manual";

/**
 * Una publicación importada desde la exportación de una plataforma.
 * Todos los campos que la fuente no entrega quedan en null (§9.4).
 */
export interface PublicacionImportada {
  plataforma: Plataforma;
  /** Naive local (hora que muestra la plataforma), sin zona. "YYYY-MM-DDTHH:mm:ss". */
  publicado_en: string | null;
  /** Imagen | Reel | Carrusel | Short | Video | Foto */
  formato: Categoria | null;
  /** Reactivo | Normal — solo Instagram (§5.2) */
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

export interface ResultadoImport {
  plataforma: Plataforma;
  fuente: FuenteImport;
  cuenta: string | null;
  publicaciones: PublicacionImportada[];
  /** Meses detectados en el archivo, "YYYY-MM". */
  meses: string[];
  /** Campos que esta fuente no entrega y quedarán vacíos (§5.1). */
  advertencias: string[];
}
