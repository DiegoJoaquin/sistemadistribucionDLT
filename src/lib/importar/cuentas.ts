/**
 * De la cuenta que declara el archivo a la cuenta que tenemos cargada.
 *
 * Antes esto no existía porque no hacía falta: las cuentas eran cinco y el
 * lector devolvía directamente un valor del enum. Con las cuentas de los
 * influencers el archivo ya no puede decidirlo, así que dice lo único que sabe
 * — su `@usuario` y su red — y acá se busca a cuál corresponde.
 *
 * El pareo es por usuario Y por red. Solo por usuario sería incorrecto: el
 * mismo @ existe en Instagram y en TikTok, y son dos cuentas distintas con
 * métricas distintas, que es justo lo que el catastro semanal tiene que mostrar
 * por separado.
 */

import { type Cuenta, type Red } from "@/lib/dominio/redes";
import type { CuentaDetectada } from "./tipos";

/**
 * Usuario comparable: sin arroba, sin espacios, en minúsculas.
 *
 * Los @ se escriben de muchas maneras — "@dltsports", "dltsports",
 * "DLTSports" — y todas son la misma cuenta. Sin esto, cargar el @ con arroba
 * en Cuentas y sin arroba en el archivo daba "no encontré la cuenta" sin
 * ninguna pista de por qué.
 */
export function usuarioComparable(valor: string | null | undefined): string | null {
  if (valor === null || valor === undefined) return null;
  const limpio = valor.replace(/@/g, "").replace(/\s+/g, "").toLowerCase();
  return limpio === "" ? null : limpio;
}

export type ResultadoResolver<T extends Cuenta> =
  | { ok: true; cuenta: T }
  | { ok: false; motivo: string };

/**
 * Busca la cuenta a la que pertenece un archivo.
 *
 * Si el archivo no trae usuario (algunas exportaciones dejan el perfil vacío)
 * y hay exactamente UNA cuenta de esa red, se usa esa: no hay ambigüedad
 * posible. Con dos o más se prefiere fallar y pedir el dato antes que adivinar
 * y cargar las métricas de una cuenta en otra.
 */
export function resolverCuenta<T extends Cuenta>(
  cuentas: readonly T[],
  detectada: CuentaDetectada,
): ResultadoResolver<T> {
  const deLaRed = cuentas.filter((c) => c.red === detectada.red);

  if (deLaRed.length === 0) {
    return {
      ok: false,
      motivo: `No tienes ninguna cuenta de ${detectada.red} cargada. Agrégala en Cuentas y vuelve a subir el archivo.`,
    };
  }

  const buscado = usuarioComparable(detectada.usuario);

  if (buscado === null) {
    if (deLaRed.length === 1) return { ok: true, cuenta: deLaRed[0] };
    return {
      ok: false,
      motivo: `El archivo no dice de qué cuenta es, y tienes ${deLaRed.length} cuentas de ${detectada.red}. No voy a adivinar cuál.`,
    };
  }

  const calzan = deLaRed.filter((c) => usuarioComparable(c.usuario) === buscado);

  if (calzan.length === 1) return { ok: true, cuenta: calzan[0] };

  if (calzan.length > 1) {
    return {
      ok: false,
      motivo: `Hay ${calzan.length} cuentas de ${detectada.red} con el usuario @${buscado}: ${calzan
        .map((c) => c.nombre)
        .join(", ")}. Deja solo una activa o corrige el usuario en Cuentas.`,
    };
  }

  return {
    ok: false,
    motivo: `No tengo ninguna cuenta de ${detectada.red} con el usuario @${buscado}. Ve a Cuentas, y o bien créala, o bien agrégale ese usuario a la cuenta que corresponda.`,
  };
}

/** Rótulo para los mensajes: "DiegoAT (@diegoat · Instagram)". */
export function rotularDetectada(d: CuentaDetectada): string {
  return d.usuario ? `@${d.usuario} · ${d.red}` : `${d.red} (sin usuario en el archivo)`;
}

/** Las redes que sabemos leer, para el texto de ayuda del formulario. */
export const REDES_IMPORTABLES: readonly Red[] = ["Instagram", "TikTok", "YouTube"];
