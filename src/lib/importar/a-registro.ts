/**
 * De una publicación de la exportación a una fila del registro.
 *
 * Esto es lo que ahorra el trabajo a mano: en vez de copiar publicación por
 * publicación desde Meta o Iconosquare, se sube el archivo y cada publicación
 * se convierte en una fila. Una fila por publicación, que es lo que necesita el
 * catastro semanal por hashtag.
 *
 * Va aparte de la acción de servidor y sin dependencias de Supabase para poder
 * probarlo: las reglas de §9 que se aplican acá (alcance de YouTube, categorías
 * por red, nulo ≠ cero) son justo las que se rompieron en el Excel.
 */

import type { Categoria } from "@/lib/dominio/categorias";
import { TIPOS_INSTAGRAM } from "@/lib/dominio/categorias";
import { normalizarHashtag } from "@/lib/dominio/hashtag";
import {
  type Cuenta,
  esCategoriaValidaEnRed,
  tieneAlcanceRed,
} from "@/lib/dominio/redes";
import type { FuenteImport, PublicacionImportada } from "./tipos";
import { fechaDe } from "./util";

/** Los campos de `registros` que sabe llenar una exportación. */
export interface FilaRegistroImportada {
  fecha: string;
  cuenta_id: string;
  /** El formato: Reel, Imagen, Carrusel, Video, Short. */
  categoria: Categoria | null;
  /** §3.2 — Reactivo o Normal. Solo Instagram, y solo si se pudo clasificar. */
  tipo: Categoria | null;
  hashtag: string | null;
  publicaciones: number;
  alcance: number | null;
  visualizaciones: number | null;
  interacciones: number | null;
  nuevos_seguidores: number | null;
  titulo_contenido: string | null;
  enlace: string | null;
  publicado_en: string;
  id_externo: string | null;
  fuente: FuenteImport;
}

/** Los campos que el archivo NUNCA trae y por eso jamás se tocan al reimportar. */
export const CAMPOS_SOLO_A_MANO = [
  "visitas_perfil",
  "vistas_seguidores",
  "vistas_no_seguidores",
] as const;

const LARGO_TITULO = 300;

/**
 * El caption, en una línea y recortado.
 *
 * Sirve para reconocer la publicación en la tabla y en el reporte, no para
 * guardar el texto completo: un caption de Instagram trae saltos de línea y
 * emojis, y entero rompería cualquier tabla.
 */
export function tituloDeCaption(caption: string | null): string | null {
  if (!caption) return null;
  const plano = caption.replace(/\s+/gu, " ").trim();
  if (plano === "") return null;
  return plano.length <= LARGO_TITULO
    ? plano
    : `${plano.slice(0, LARGO_TITULO - 1).trimEnd()}…`;
}

function enlaceValido(enlace: string | null): string | null {
  return enlace && /^https?:\/\//i.test(enlace) ? enlace : null;
}

/**
 * Convierte una publicación en una fila, aplicando las reglas de la red.
 *
 * Devuelve null si no tiene fecha de publicación: sin fecha no hay día al que
 * asignarla, y meterla en el día de hoy sería inventar el dato.
 */
export function aFilaRegistro(
  p: PublicacionImportada,
  cuenta: Cuenta,
): FilaRegistroImportada | null {
  if (!p.publicado_en) return null;

  /*
   * El formato se descarta si no corresponde a la red de la cuenta. No debería
   * pasar — cada lector solo produce formatos de su red — pero si pasara, el
   * trigger de la base rechazaría la fila entera y la importación se caería a
   * la mitad. Prefiero una fila sin formato que una importación rota.
   */
  const categoria = esCategoriaValidaEnRed(cuenta.red, p.formato) ? p.formato : null;

  // §3.2 — Reactivo/Normal solo existe en Instagram.
  const tipo =
    cuenta.red === "Instagram" &&
    p.tipo !== null &&
    (TIPOS_INSTAGRAM as readonly Categoria[]).includes(p.tipo)
      ? p.tipo
      : null;

  return {
    fecha: fechaDe(p.publicado_en),
    cuenta_id: cuenta.id,
    categoria,
    tipo,
    hashtag: normalizarHashtag(p.serie_hashtag),
    // Una publicación del archivo es exactamente una publicación (§9.5).
    publicaciones: 1,
    // §9.6 — YouTube no entrega alcance; guardarlo sería inventarlo.
    alcance: tieneAlcanceRed(cuenta.red) ? p.alcance : null,
    visualizaciones: p.visualizaciones,
    interacciones: p.interacciones,
    nuevos_seguidores: p.nuevos_seguidores,
    titulo_contenido: tituloDeCaption(p.caption),
    enlace: enlaceValido(p.enlace),
    publicado_en: p.publicado_en,
    id_externo: p.id_externo,
    fuente: p.fuente,
  };
}

export interface RangoFechas {
  desde?: string;
  hasta?: string;
}

export interface ConversionRegistro {
  filas: FilaRegistroImportada[];
  /** Publicaciones sin fecha en el archivo: no se pueden asignar a un día. */
  sinFecha: number;
  /** Quedaron fuera del rango que se pidió importar. */
  fueraDeRango: number;
  /** El propio archivo traía el mismo id_externo más de una vez. */
  repetidasEnArchivo: number;
}

/**
 * Convierte todas las publicaciones de un archivo.
 *
 * Deduplica por `id_externo` dentro del archivo. Parece paranoia, pero las
 * exportaciones a veces repiten una fila, y como la base tiene un índice único
 * por (cuenta, id_externo) eso haría fallar el lote entero en vez de la fila.
 */
export function aFilasRegistro(
  publicaciones: readonly PublicacionImportada[],
  cuenta: Cuenta,
  rango: RangoFechas = {},
): ConversionRegistro {
  const filas: FilaRegistroImportada[] = [];
  const vistas = new Set<string>();
  let sinFecha = 0;
  let fueraDeRango = 0;
  let repetidasEnArchivo = 0;

  for (const p of publicaciones) {
    const fila = aFilaRegistro(p, cuenta);
    if (!fila) {
      sinFecha += 1;
      continue;
    }
    if (rango.desde && fila.fecha < rango.desde) {
      fueraDeRango += 1;
      continue;
    }
    if (rango.hasta && fila.fecha > rango.hasta) {
      fueraDeRango += 1;
      continue;
    }
    if (fila.id_externo !== null) {
      if (vistas.has(fila.id_externo)) {
        repetidasEnArchivo += 1;
        continue;
      }
      vistas.add(fila.id_externo);
    }
    filas.push(fila);
  }

  return { filas, sinFecha, fueraDeRango, repetidasEnArchivo };
}

/**
 * Qué escribir cuando la publicación YA estaba importada.
 *
 * Regla: un valor que existe nunca se pisa con un vacío. Las fuentes no traen
 * las mismas columnas — Iconosquare tiene alcance pero no nuevos seguidores, y
 * Meta al revés — así que subir la segunda exportación encima de la primera,
 * copiando sus nulos, borraría la mitad de lo que ya se había cargado. Es la
 * misma regla del cruce de la línea base (§5.1).
 *
 * Los tres campos de perfil ni aparecen acá: ninguna exportación los trae, se
 * cargan a mano y reimportar no puede hacerlos desaparecer.
 */
export function fusionarConExistente(
  existente: Partial<FilaRegistroImportada>,
  nueva: FilaRegistroImportada,
): FilaRegistroImportada {
  const mantener = <T,>(nuevo: T | null, viejo: T | null | undefined): T | null =>
    nuevo ?? viejo ?? null;

  return {
    ...nueva,
    categoria: mantener(nueva.categoria, existente.categoria),
    tipo: mantener(nueva.tipo, existente.tipo),
    hashtag: mantener(nueva.hashtag, existente.hashtag),
    alcance: mantener(nueva.alcance, existente.alcance),
    visualizaciones: mantener(nueva.visualizaciones, existente.visualizaciones),
    interacciones: mantener(nueva.interacciones, existente.interacciones),
    nuevos_seguidores: mantener(nueva.nuevos_seguidores, existente.nuevos_seguidores),
    titulo_contenido: mantener(nueva.titulo_contenido, existente.titulo_contenido),
    enlace: mantener(nueva.enlace, existente.enlace),
  };
}

/** Cuántas publicaciones salieron con cada hashtag, de más a menos. */
export function contarHashtags(
  filas: readonly FilaRegistroImportada[],
): { hashtag: string | null; n: number }[] {
  const cuenta = new Map<string | null, number>();
  for (const f of filas) cuenta.set(f.hashtag, (cuenta.get(f.hashtag) ?? 0) + 1);
  return [...cuenta.entries()]
    .map(([hashtag, n]) => ({ hashtag, n }))
    .sort(
      (a, b) =>
        b.n - a.n ||
        // Las sin hashtag al final: son el "resto", no una serie.
        Number(a.hashtag === null) - Number(b.hashtag === null) ||
        (a.hashtag ?? "").localeCompare(b.hashtag ?? "", "es"),
    );
}

/** Primer y último día que trae el lote, para poder mostrar el rango. */
export function rangoDe(
  filas: readonly FilaRegistroImportada[],
): { desde: string; hasta: string } | null {
  if (filas.length === 0) return null;
  const fechas = filas.map((f) => f.fecha).sort();
  return { desde: fechas[0], hasta: fechas[fechas.length - 1] };
}
