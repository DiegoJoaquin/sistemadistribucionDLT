/**
 * §5.1 — Cruce de dos fuentes para la misma plataforma y mes.
 *
 * El caso concreto: Instagram DLT necesita las dos exportaciones. Iconosquare
 * trae alcance y visualizaciones pero no nuevos seguidores ni duración; el CSV
 * de Meta Business Suite sí los trae. Hay que combinarlas.
 *
 * La regla es que la PRIMERA fuente importada de una plataforma es la canónica
 * y define cuántas publicaciones tiene el mes. Las siguientes solo COMPLETAN
 * campos vacíos, nunca agregan filas. Sin esta regla, subir las dos fuentes de
 * Instagram duplicaría las 270 publicaciones de agosto y partiría todos los
 * promedios por la mitad.
 *
 * El calce se hace primero por caption, que es el identificador más confiable
 * porque las dos fuentes exportan el mismo texto. Para lo que queda se usa la
 * hora, corrigiendo el desfase entre exportadores: Meta reporta 3 horas atrás
 * respecto de Iconosquare. Ese desfase no va fijo en el código — se estima de
 * los propios pares que calzaron por caption, así que si cambia (o si hay
 * cambio de hora) el cruce sigue funcionando.
 */

import type { Categoria } from "@/lib/dominio/plataformas";
import type { PublicacionImportada } from "./tipos";
import { aNaive, minutosNaive, normalizar } from "./util";

/** Campos que una segunda fuente puede completar si están vacíos. */
export const CAMPOS_COMPLETABLES = [
  "nuevos_seguidores",
  "duracion_s",
  "alcance",
  "visualizaciones",
  "interacciones",
  "me_gusta",
  "comentarios",
  "compartidos",
  "guardados",
  "favoritos",
] as const;

export type CampoCompletable = (typeof CAMPOS_COMPLETABLES)[number];

export interface PublicacionExistente {
  id: string;
  /** Texto naive, o un Date si el driver de la base ya lo parseó. */
  publicado_en: string | Date | null;
  caption: string | null;
  formato: Categoria | null;
  nuevos_seguidores: number | null;
  duracion_s: number | null;
  alcance: number | null;
  visualizaciones: number | null;
  interacciones: number | null;
  me_gusta: number | null;
  comentarios: number | null;
  compartidos: number | null;
  guardados: number | null;
  favoritos: number | null;
}

export interface Enriquecimiento {
  id: string;
  campos: Partial<Record<CampoCompletable, number>>;
}

export interface ResultadoCruce {
  /** Desfase estimado entre las dos fuentes, en horas. null si no se pudo estimar. */
  desfaseHoras: number | null;
  /** Cómo se estimó: por caption, o el valor por defecto. */
  desfaseSegun: "captions" | "por defecto" | "ninguno";
  enriquecimientos: Enriquecimiento[];
  calzadasPorCaption: number;
  calzadasPorHora: number;
  /** Publicaciones del archivo nuevo que no calzaron con ninguna existente. */
  sinCalzar: PublicacionImportada[];
  /** Cuántos valores se completaron, por campo. */
  camposCompletados: Partial<Record<CampoCompletable, number>>;
}

/** Meta reporta 3 horas atrás respecto de Iconosquare (§5.1). */
const DESFASE_POR_DEFECTO_MIN = 180;

/** Tolerancia al calzar por hora, una vez corregido el desfase. */
const TOLERANCIA_MIN = 8;

/**
 * Clave de contenido. Se normaliza fuerte (sin tildes, sin espacios de más,
 * mayúsculas) y se recorta, porque las dos fuentes a veces difieren en saltos
 * de línea o en los últimos caracteres.
 */
export function claveCaption(caption: string | null): string | null {
  if (!caption) return null;
  const k = normalizar(caption).replace(/\s+/g, " ").trim().slice(0, 80);
  // Un caption muy corto no identifica nada (ej. "(sin descripción)").
  return k.length >= 20 ? k : null;
}

function mediana(xs: number[]): number {
  const s = [...xs].sort((a, b) => a - b);
  const m = Math.floor(s.length / 2);
  return s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2;
}

export function cruzar(
  existentes: readonly PublicacionExistente[],
  nuevas: readonly PublicacionImportada[],
): ResultadoCruce {
  const usadas = new Set<string>();
  const pares: { existente: PublicacionExistente; nueva: PublicacionImportada }[] = [];

  /* ---- 1. Calce por caption ---- */

  // Solo claves únicas: si dos publicaciones comparten caption no se puede
  // saber cuál es cuál, y es mejor no calzar que calzar mal.
  const porCaption = new Map<string, PublicacionExistente | null>();
  for (const e of existentes) {
    const k = claveCaption(e.caption);
    if (!k) continue;
    porCaption.set(k, porCaption.has(k) ? null : e);
  }

  const pendientes: PublicacionImportada[] = [];
  for (const n of nuevas) {
    const k = claveCaption(n.caption);
    const e = k ? porCaption.get(k) : undefined;
    if (e && !usadas.has(e.id)) {
      usadas.add(e.id);
      pares.push({ existente: e, nueva: n });
    } else {
      pendientes.push(n);
    }
  }

  const calzadasPorCaption = pares.length;

  /* ---- 2. Estimación del desfase ---- */

  const diferencias: number[] = [];
  for (const { existente, nueva } of pares) {
    const a = aNaive(existente.publicado_en);
    const b = aNaive(nueva.publicado_en);
    if (!a || !b) continue;
    diferencias.push(minutosNaive(a) - minutosNaive(b));
  }

  let desfaseMin: number | null = null;
  let desfaseSegun: ResultadoCruce["desfaseSegun"] = "ninguno";

  if (diferencias.length >= 5) {
    desfaseMin = Math.round(mediana(diferencias));
    desfaseSegun = "captions";
  } else if (pendientes.length > 0) {
    desfaseMin = DESFASE_POR_DEFECTO_MIN;
    desfaseSegun = "por defecto";
  }

  /* ---- 3. Calce por hora, con el desfase aplicado ---- */

  let calzadasPorHora = 0;
  const sinCalzar: PublicacionImportada[] = [];

  if (desfaseMin !== null) {
    const libres = existentes
      .flatMap((e) => {
        if (usadas.has(e.id)) return [];
        const n = aNaive(e.publicado_en);
        return n ? [{ e, min: minutosNaive(n) }] : [];
      })
      .sort((a, b) => a.min - b.min);

    for (const n of pendientes) {
      const cuando = aNaive(n.publicado_en);
      if (!cuando) {
        sinCalzar.push(n);
        continue;
      }
      const objetivo = minutosNaive(cuando) + desfaseMin;

      let mejor: (typeof libres)[number] | null = null;
      let mejorDist = Infinity;
      for (const c of libres) {
        if (usadas.has(c.e.id)) continue;
        const dist = Math.abs(c.min - objetivo);
        if (dist > TOLERANCIA_MIN) continue;
        // Si ambas conocen el formato y no coincide, no es la misma publicación.
        if (c.e.formato && n.formato && c.e.formato !== n.formato) continue;
        if (dist < mejorDist) {
          mejor = c;
          mejorDist = dist;
        }
      }

      if (mejor) {
        usadas.add(mejor.e.id);
        pares.push({ existente: mejor.e, nueva: n });
        calzadasPorHora++;
      } else {
        sinCalzar.push(n);
      }
    }
  } else {
    sinCalzar.push(...pendientes);
  }

  /* ---- 4. Qué campos completar ---- */

  const enriquecimientos: Enriquecimiento[] = [];
  const camposCompletados: Partial<Record<CampoCompletable, number>> = {};

  for (const { existente, nueva } of pares) {
    const campos: Partial<Record<CampoCompletable, number>> = {};
    for (const campo of CAMPOS_COMPLETABLES) {
      // Solo se completa lo que está vacío. Nunca se sobrescribe un dato que ya
      // estaba: la fuente canónica manda.
      if (existente[campo] !== null) continue;
      const valor = nueva[campo];
      if (valor === null || valor === undefined) continue;
      campos[campo] = valor;
      camposCompletados[campo] = (camposCompletados[campo] ?? 0) + 1;
    }
    if (Object.keys(campos).length > 0) {
      enriquecimientos.push({ id: existente.id, campos });
    }
  }

  return {
    desfaseHoras: desfaseMin === null ? null : desfaseMin / 60,
    desfaseSegun,
    enriquecimientos,
    calzadasPorCaption,
    calzadasPorHora,
    sinCalzar,
    camposCompletados,
  };
}
