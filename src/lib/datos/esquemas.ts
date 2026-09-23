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
import {
  CATEGORIAS,
  esCategoriaValida,
  PLATAFORMAS,
  REDES,
  tieneAlcance,
} from "@/lib/dominio/plataformas";

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

export const esquemaRegistro = z
  .object({
    /*
     * El mensaje va en los dos lugares a propósito: el de `.regex()` solo
     * cubre un formato inválido, y sin el del tipo una fecha ausente muestra
     * el texto crudo de Zod, que no le dice nada a nadie.
     */
    fecha: z
      .string({ message: "Falta la fecha." })
      .regex(/^\d{4}-\d{2}-\d{2}$/, "La fecha no es válida."),
    plataforma: z.enum(PLATAFORMAS, { message: "Elige una plataforma válida." }),

    // Igual que los enteros: si el selector está deshabilitado, la clave no
    // llega. Sin `.optional()` el formulario entero se cae.
    categoria: z
      .union([z.enum(CATEGORIAS), z.literal(""), z.null()])
      .optional()
      .transform((v) => (v === "" || v === null || v === undefined ? null : v)),

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
  .refine((d) => esCategoriaValida(d.plataforma, d.categoria), {
    message: "Esa categoría no corresponde a la plataforma elegida.",
    path: ["categoria"],
  })
  // §9.6: YouTube no entrega alcance. Guardarlo sería inventar el dato.
  .refine((d) => tieneAlcance(d.plataforma) || d.alcance === null, {
    message: "YouTube no entrega alcance: deja ese campo vacío.",
    path: ["alcance"],
  });

export type RegistroValidado = z.output<typeof esquemaRegistro>;

export const esquemaReporte = z.object({
  fecha: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  plan_publicaciones: textoOpcional(5000),
  conversacion_audiencia: textoOpcional(5000),
  aprendizajes: textoOpcional(5000),
  recomendaciones: textoOpcional(5000),
  riesgos: textoOpcional(5000),
});

/**
 * Pasa un FormData a objeto plano. Solo las entradas de texto: los archivos se
 * leen aparte.
 */
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
