import type { Categoria, Plataforma } from "@/lib/dominio/plataformas";
import type { FuenteImport } from "@/lib/importar/tipos";

export interface PerfilRow {
  id: string;
  email: string;
  nombre: string;
  /**
   * Tener sesión no alcanza para entrar: hay que estar autorizado. Se activa a
   * mano al sumar alguien al equipo.
   */
  autorizado: boolean;
  creado_en: string;
}

export interface RegistroRow {
  id: string;
  fecha: string;
  plataforma: Plataforma;
  categoria: Categoria | null;
  publicaciones: number;
  alcance: number | null;
  visualizaciones: number | null;
  interacciones: number | null;
  nuevos_seguidores: number | null;
  visitas_perfil: number | null;
  vistas_seguidores: number | null;
  vistas_no_seguidores: number | null;
  titulo_contenido: string | null;
  enlace: string | null;
  created_by: string;
  created_at: string;
  updated_at: string;
}

/** Registro con el perfil de quien lo cargó, para mostrar trazabilidad (§2). */
export interface RegistroConAutor extends RegistroRow {
  autor: Pick<PerfilRow, "id" | "nombre" | "email"> | null;
}

export interface LineaBaseRow {
  id: string;
  mes: string;
  nombre: string;
  activa: boolean;
  creado_por: string | null;
  creado_en: string;
}

export interface PublicacionBaseRow {
  id: string;
  linea_base_id: string;
  plataforma: Plataforma;
  publicado_en: string | null;
  formato: Categoria | null;
  tipo: Categoria | null;
  tipo_auto: Categoria | null;
  clasificado_a_mano: boolean;
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
  importado_en: string;
}

/** Fila de la vista `lineas_base_detalle`. */
export interface LineaBaseDetalleRow {
  linea_base_id: string;
  plataforma: Plataforma;
  /** null = fila TOTAL de la plataforma (§9.2). */
  categoria: Categoria | null;
  n_publicaciones: number;
  alcance_prom: number | null;
  visualizaciones_prom: number | null;
  interacciones_prom: number | null;
  nuevos_seguidores_prom: number | null;
  engagement_prom: number | null;
}

export interface ReporteRow {
  id: string;
  fecha: string;
  plan_publicaciones: string | null;
  conversacion_audiencia: string | null;
  aprendizajes: string | null;
  recomendaciones: string | null;
  riesgos: string | null;
  enviado_en: string | null;
  actualizado_por: string | null;
  actualizado_en: string;
}
