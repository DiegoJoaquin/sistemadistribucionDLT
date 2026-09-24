/**
 * La parte pura de la configuración del correo: direcciones, puerto y qué
 * variables faltan.
 *
 * Va aparte de `entorno.ts` porque ese módulo lleva `server-only` y no se
 * puede importar desde un test — se comprobó. Y es justo la parte que conviene
 * probar: un espacio de más en una variable de entorno hacía que el envío
 * fallara entero con un error del servidor SMTP que no dice nada, y la lista
 * de lo que falta es lo primero que ve quien va a configurar esto.
 */

export interface FaltanteCorreo {
  variable: string;
  para: string;
}

/** Lo mínimo para poder mandar un correo. Todo lo demás tiene valor por defecto. */
export const VARIABLES_CORREO: readonly FaltanteCorreo[] = [
  { variable: "SMTP_HOST", para: "el servidor de salida de tu correo" },
  { variable: "SMTP_USUARIO", para: "tu dirección de correo" },
  { variable: "SMTP_CLAVE", para: "la contraseña de aplicación" },
  { variable: "REPORTE_DESTINATARIOS", para: "a quiénes se manda el reporte" },
];

/** Qué falta. Vacío significa que el envío está configurado. */
export function faltantesEn(
  env: Record<string, string | undefined>,
): FaltanteCorreo[] {
  return VARIABLES_CORREO.filter(({ variable }) => !env[variable]?.trim());
}

/** Forma mínima de una dirección. No valida que exista, solo que sea una. */
const FORMA = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export function esDireccion(valor: string): boolean {
  return FORMA.test(valor.trim());
}

export interface Destinatarios {
  validos: string[];
  invalidos: string[];
}

/**
 * Separa por coma o punto y coma, limpia espacios y quita repetidos.
 *
 * Los repetidos importan: con la misma dirección dos veces el servidor manda
 * el correo dos veces y el jefe recibe el reporte duplicado.
 */
export function parsearDestinatarios(crudo: string | undefined | null): Destinatarios {
  const lista = (crudo ?? "")
    .split(/[,;\n]/)
    .map((d) => d.trim())
    .filter((d) => d !== "");

  const validos: string[] = [];
  const invalidos: string[] = [];
  const vistos = new Set<string>();

  for (const d of lista) {
    if (!esDireccion(d)) {
      invalidos.push(d);
      continue;
    }
    const clave = d.toLowerCase();
    if (vistos.has(clave)) continue;
    vistos.add(clave);
    validos.push(d);
  }

  return { validos, invalidos };
}

/**
 * El puerto decide el modo de cifrado, y equivocarlo da un error de conexión
 * que no explica nada. 465 es SSL directo; 587 y 25 son STARTTLS.
 */
export function esPuertoSeguro(puerto: number): boolean {
  return puerto === 465;
}

export function parsearPuerto(crudo: string | undefined | null): number {
  const t = (crudo ?? "").trim();
  if (t === "") return 587;
  const n = Number(t);
  if (!Number.isInteger(n) || n <= 0 || n > 65535) {
    throw new Error(
      `SMTP_PUERTO tiene que ser un número de puerto válido; llegó "${t}". Lo habitual es 465 o 587.`,
    );
  }
  return n;
}

/** Oculta una dirección para poder mostrarla sin exponerla entera. */
export function ocultarDireccion(d: string): string {
  const [local, dominio] = d.split("@");
  if (!dominio) return d;
  const visible = local.slice(0, 2);
  return `${visible}${"·".repeat(Math.max(local.length - 2, 1))}@${dominio}`;
}
