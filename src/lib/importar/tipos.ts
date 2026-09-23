import type { Categoria } from "@/lib/dominio/categorias";
import type { Red } from "@/lib/dominio/redes";

export type FuenteImport = "meta" | "iconosquare" | "tiktok" | "youtube" | "manual";

/**
 * La cuenta que viene declarada en el propio archivo.
 *
 * Es lo que reemplaza al enum de cinco plataformas. Un archivo no sabe nada de
 * nuestras cuentas: sabe su `@usuario` y su red, y con eso se busca a cuál de
 * las cuentas cargadas corresponde (`resolverCuenta`). Así una exportación de
 * @diegoat se importa sin tocar el código ni agregar nada a un enum.
 */
export interface CuentaDetectada {
  /** El @ tal como lo trae el archivo, sin arroba y sin normalizar. */
  usuario: string | null;
  red: Red;
}

/**
 * Una publicación importada desde la exportación de una plataforma.
 * Todos los campos que la fuente no entrega quedan en null (§9.4).
 */
export interface PublicacionImportada {
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
  /** Quién publicó esto, según el archivo. */
  detectada: CuentaDetectada;
  fuente: FuenteImport;
  /** El perfil tal como lo rotula el archivo, para mostrarlo. */
  cuenta: string | null;
  publicaciones: PublicacionImportada[];
  /** Meses detectados en el archivo, "YYYY-MM". */
  meses: string[];
  /** Campos que esta fuente no entrega y quedarán vacíos (§5.1). */
  advertencias: string[];
}
