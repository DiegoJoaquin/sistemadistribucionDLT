import type { Categoria, Plataforma } from "@/lib/dominio/plataformas";
import type { Cuenta, Red } from "@/lib/dominio/redes";
import type { FuenteImport } from "@/lib/importar/tipos";

/** Fila de `cuentas`. La forma de dominio vive en `redes.ts`. */
export interface CuentaRow extends Cuenta {
  creado_en: string;
}

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
  cuenta_id: string;
  /*
   * Transitoria. En la base es nullable, porque una cuenta de influencer no
   * tiene equivalente en el enum viejo. Acá se declara no-nula porque describe
   * los datos que existen hoy: el formulario de carga todavía solo ofrece las
   * cinco cuentas originales, así que no hay forma de crear una fila sin
   * plataforma. Pasa a `| null` en la etapa 2, junto con los consumidores que
   * hoy dependen de ella.
   */
  plataforma: Plataforma;
  /** El formato. */
  categoria: Categoria | null;
  /** §3.2 — Reactivo o Normal, la otra clasificación de Instagram. */
  tipo: Categoria | null;
  /** Serie o hashtag, normalizado. Es el corte del reporte semanal. */
  hashtag: string | null;
  /** Hora que muestra la plataforma, sin zona. Solo en lo importado. */
  publicado_en: string | null;
  /** Identificador en la plataforma: evita importar dos veces lo mismo. */
  id_externo: string | null;
  fuente: FuenteImport;
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
  cuenta_id: string;
  /** Transitoria, igual que en `registros`. */
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
  cuenta_id: string;
  /** Nombre de la cuenta: viene en la vista para no pedirlo aparte. */
  cuenta: string;
  red: Red;
  /** Alias de transición, con el mismo valor que `cuenta`. */
  plataforma: Plataforma;
  /** null = fila TOTAL de la cuenta (§9.2). */
  categoria: Categoria | null;
  n_publicaciones: number;
  alcance_prom: number | null;
  visualizaciones_prom: number | null;
  interacciones_prom: number | null;
  nuevos_seguidores_prom: number | null;
  engagement_prom: number | null;
}

/**
 * Fila de la vista `lineas_base_hashtag`.
 *
 * Igual que `LineaBaseDetalleRow` pero cortada por serie en vez de por formato.
 * Acá `hashtag` nulo son las publicaciones sin hashtag, NO un total: el total
 * de la cuenta vive en la otra vista.
 */
export interface LineaBaseHashtagRow {
  linea_base_id: string;
  cuenta_id: string;
  cuenta: string;
  red: Red;
  hashtag: string | null;
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
