/**
 * Validación de los formularios.
 *
 * Va en su propio módulo, sin dependencias de servidor, para poder probarlo
 * contra un FormData de verdad. No estaba, y el resultado fue que el estado por
 * defecto del formulario de registro quedó roto: las tres métricas de perfil
 * viven en una sección colapsada, no se renderizan hasta abrirla, y por lo
 * tanto no viajan en el envío.
 */

import { z } from "zod";
import { CATEGORIAS, TIPOS_INSTAGRAM } from "@/lib/dominio/categorias";
import { normalizarHashtag } from "@/lib/dominio/hashtag";
import {
  type Cuenta,
  esCategoriaValidaEnRed,
  REDES,
  tieneAlcanceRed,
} from "@/lib/dominio/redes";

/**
 * Entero opcional de un formulario. §9.4: vacío significa "no se midió", así
 * que se convierte a null y nunca a 0.
 *
 * El `.optional()` es imprescindible y no es lo mismo que meter `z.undefined()`
 * en la unión: en Zod 4 eso último acepta un undefined explícito pero RECHAZA
 * una clave ausente, con el mensaje "expected nonoptional, received undefined".
 * Y una clave ausente es justo lo que manda el navegador cuando el campo no se
 * renderizó o está deshabilitado.
 */
export const enteroDeFormulario = z
  .union([z.string(), z.number(), z.null()])
  .optional()
  .transform((v) => {
    if (v === null || v === undefined) return null;
    const t = String(v).trim();
    if (t === "") return null;
    // Acepta "1.234" y "1.234,5" como los escribe la gente en Chile.
    const n = Number(t.replace(/[.\s]/g, "").replace(",", "."));
    return Number.isFinite(n) ? Math.round(n) : null;
  });

const textoOpcional = (max: number) =>
  z
    .string()
    .trim()
    .max(max)
    .optional()
    .transform((v) => v || null);

/** Categoría opcional: la clave no llega si el selector está deshabilitado. */
const categoriaOpcional = z
  .union([z.enum(CATEGORIAS), z.literal(""), z.null()])
  .optional()
  .transform((v) => (v === "" || v === null || v === undefined ? null : v));

const tipoOpcional = z
  .union([z.enum(TIPOS_INSTAGRAM), z.literal(""), z.null()])
  .optional()
  .transform((v) => (v === "" || v === null || v === undefined ? null : v));

/**
 * Esquema del registro, construido con las cuentas disponibles.
 *
 * Es una función y no una constante porque dos de las reglas de §9 dependen de
 * la red de la cuenta elegida, y las cuentas son datos: viven en la base y
 * cambian sin desplegar. Antes la plataforma era un enum y las reglas se podían
 * escribir fijas en el esquema.
 */
export function esquemaRegistroPara(cuentas: readonly Cuenta[]) {
  const porId = new Map(cuentas.map((c) => [c.id, c]));

  return z
    .object({
      /*
       * El mensaje va en los dos lugares a propósito: el de `.regex()` solo
       * cubre un formato inválido, y sin el del tipo una fecha ausente muestra
       * el texto crudo de Zod, que no le dice nada a nadie.
       */
      fecha: z
        .string({ message: "Falta la fecha." })
        .regex(/^\d{4}-\d{2}-\d{2}$/, "La fecha no es válida."),

      cuenta_id: z
        .string({ message: "Elige la cuenta." })
        .uuid("La cuenta elegida no es válida."),

      /** El formato. */
      categoria: categoriaOpcional,
      /** §3.2 — Reactivo o Normal, la otra clasificación de Instagram. */
      tipo: tipoOpcional,

      hashtag: z
        .string()
        .max(120)
        .optional()
        .transform((v) => normalizarHashtag(v)),

      // §9.5: cuántas publicaciones representa la fila. Es el divisor de todos
      // los promedios del día, así que no puede faltar ni ser cero.
      publicaciones: z.coerce
        .number({ message: "Escribe cuántas publicaciones representa la fila." })
        .int("Las publicaciones deben ser un número entero.")
        .min(1, "Una fila tiene que representar al menos 1 publicación."),

      alcance: enteroDeFormulario,
      visualizaciones: enteroDeFormulario,
      interacciones: enteroDeFormulario,
      nuevos_seguidores: enteroDeFormulario,

      // §4.1: se ingresan a mano y viven en una sección colapsable, así que lo
      // habitual es que no vengan.
      visitas_perfil: enteroDeFormulario,
      vistas_seguidores: enteroDeFormulario,
      vistas_no_seguidores: enteroDeFormulario,

      titulo_contenido: textoOpcional(300),
      enlace: textoOpcional(2000).refine(
        (v) => v === null || /^https?:\/\//i.test(v),
        "El enlace debe empezar con http:// o https://",
      ),
    })
    .refine((d) => porId.has(d.cuenta_id), {
      message: "Esa cuenta no existe o está desactivada.",
      path: ["cuenta_id"],
    })
    .refine(
      (d) => {
        const c = porId.get(d.cuenta_id);
        return c === undefined || esCategoriaValidaEnRed(c.red, d.categoria);
      },
      {
        message: "Esa categoría no corresponde a la red de la cuenta elegida.",
        path: ["categoria"],
      },
    )
    // §3.2 — Reactivo/Normal solo existe en Instagram.
    .refine(
      (d) => {
        const c = porId.get(d.cuenta_id);
        return c === undefined || d.tipo === null || c.red === "Instagram";
      },
      {
        message: "Reactivo y Normal son clasificaciones de Instagram.",
        path: ["tipo"],
      },
    )
    // §9.6: YouTube no entrega alcance. Guardarlo sería inventar el dato.
    .refine(
      (d) => {
        const c = porId.get(d.cuenta_id);
        return c === undefined || tieneAlcanceRed(c.red) || d.alcance === null;
      },
      {
        message: "YouTube no entrega alcance: deja ese campo vacío.",
        path: ["alcance"],
      },
    );
}

export type RegistroValidado = z.output<ReturnType<typeof esquemaRegistroPara>>;

/* ------------------------------------------------------------------ */
/* Cuentas                                                             */
/* ------------------------------------------------------------------ */

export const esquemaCuenta = z.object({
  nombre: z
    .string({ message: "Escribe el nombre de la cuenta." })
    .trim()
    .min(2, "El nombre es demasiado corto.")
    .max(80, "El nombre es demasiado largo."),
  usuario: z
    .string()
    .trim()
    .max(80)
    .optional()
    .transform((v) => v || null),
  // §9.3: la red sí es un enum cerrado, porque de ella dependen las reglas.
  red: z.enum(REDES, { message: "Elige la red de la cuenta." }),
  // Las casillas no marcadas no viajan en el formulario: ausente es false.
  es_influencer: z
    .union([z.literal("on"), z.literal("true"), z.boolean()])
    .optional()
    .transform((v) => v === "on" || v === "true" || v === true),
  orden: z.coerce
    .number({ message: "El orden debe ser un número." })
    .int("El orden debe ser un número entero.")
    .min(0)
    .max(9999)
    .optional()
    .transform((v) => v ?? 100),
});

/* ------------------------------------------------------------------ */
/* Reporte                                                             */
/* ------------------------------------------------------------------ */

export const esquemaReporte = z.object({
  fecha: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  plan_publicaciones: textoOpcional(5000),
  conversacion_audiencia: textoOpcional(5000),
  aprendizajes: textoOpcional(5000),
  recomendaciones: textoOpcional(5000),
  riesgos: textoOpcional(5000),
});

/* ------------------------------------------------------------------ */
/* Utilidades                                                          */
/* ------------------------------------------------------------------ */

/**
 * Pasa un FormData a objeto plano. Solo las entradas de texto: los archivos se
 * leen aparte.
 */
export function desdeFormData(fd: FormData): Record<string, unknown> {
  const obj: Record<string, unknown> = {};
  for (const [k, v] of fd.entries()) {
    if (typeof v === "string") obj[k] = v;
  }
  return obj;
}

/** Primer mensaje de error, que es el que se le muestra a la persona. */
export function primerError(error: z.ZodError): string {
  return error.issues[0]?.message ?? "Datos inválidos.";
}
