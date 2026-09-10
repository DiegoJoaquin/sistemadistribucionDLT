/**
 * §5.2 — Clasificación automática Reactivo / Normal. Solo aplica a Instagram.
 *
 * La clasificación es editable a mano después de importar: siempre hay casos
 * que el algoritmo no captura, y por eso `publicaciones_base` guarda tanto
 * `tipo_auto` (lo que decidió esto) como `tipo` (lo que quedó).
 */

import type { Categoria } from "@/lib/dominio/plataformas";
import { normalizar, primerHashtag } from "./util";

/**
 * @dltsports: se detecta por el PRIMER hashtag del caption.
 * Cualquier otro hashtag, o su ausencia, es Normal.
 */
export const HASHTAGS_REACTIVOS: readonly string[] = [
  "MUNDIALXDLT",
  "DESDELAFINAL",
  "DESDELAFINALXDLT",
  "SUDAMERICANAXDLT",
  "CHILEANPREMIERLEAGUEXDLT",
  "CHILEANPREMIERXDLT",
  "CHILEANCUPXDLT",
  "COPACHILEXDLT",
  "LAVELADAXDLT",
  "ENCALIENTE",
  "BREAKING",
  "BREAKINGNEWS",
  "BREAKINGNEWXDLT",
  "ONCEIDEAL",
  "VOZINHAENCHILE",
  "FECHA17XDLT",
];

const SET_REACTIVOS = new Set(HASHTAGS_REACTIVOS);

/**
 * @debuenafuente.dlt no usa hashtags de sección: se detecta por palabras clave
 * en el caption, sin distinguir tildes ni mayúsculas.
 */
export const PALABRAS_REACTIVAS_DBF: readonly string[] = [
  "BREAKING",
  "EN VIVO",
  "MINUTO A MINUTO",
  "ULTIMA HORA",
  "URGENTE",
];

export interface Clasificacion {
  tipo: Extract<Categoria, "Reactivo" | "Normal">;
  /** Hashtag o palabra clave que decidió la clasificación. */
  serie: string | null;
  motivo: string;
}

export function clasificarDLT(caption: string | null): Clasificacion {
  const hashtag = primerHashtag(caption);
  if (hashtag && SET_REACTIVOS.has(hashtag)) {
    return {
      tipo: "Reactivo",
      serie: hashtag,
      motivo: `primer hashtag #${hashtag} está en la lista de reactivos`,
    };
  }
  return {
    tipo: "Normal",
    serie: hashtag,
    motivo: hashtag
      ? `primer hashtag #${hashtag} no está en la lista de reactivos`
      : "el caption no tiene hashtags",
  };
}

export function clasificarDBF(caption: string | null): Clasificacion {
  if (caption) {
    const texto = normalizar(caption);
    for (const palabra of PALABRAS_REACTIVAS_DBF) {
      if (texto.includes(palabra)) {
        return {
          tipo: "Reactivo",
          serie: primerHashtag(caption),
          motivo: `el caption contiene "${palabra}"`,
        };
      }
    }
  }
  return {
    tipo: "Normal",
    serie: primerHashtag(caption),
    motivo: "el caption no contiene palabras clave de contenido reactivo",
  };
}

export function clasificarInstagram(
  cuenta: "dltsports" | "debuenafuente.dlt",
  caption: string | null,
): Clasificacion {
  return cuenta === "dltsports" ? clasificarDLT(caption) : clasificarDBF(caption);
}
