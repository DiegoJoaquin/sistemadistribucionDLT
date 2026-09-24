/**
 * Configuración del envío de correo, desde variables de entorno.
 *
 * Va por SMTP genérico y no por la API de un servicio (Resend, Brevo) porque
 * el pedido era que el correo salga desde la dirección de DLT, no desde un
 * remitente de terceros. SMTP funciona igual con Google Workspace, Microsoft
 * 365, Hostinger o cualquier otro: cambian el host y el puerto, nada más.
 *
 * La contraseña nunca viaja al navegador ni se guarda en la base: vive solo en
 * las variables de entorno del servidor. Conviene que sea una **contraseña de
 * aplicación** y no la del correo, porque se puede revocar sin cambiar la del
 * buzón.
 */

import "server-only";

import {
  esPuertoSeguro,
  type FaltanteCorreo,
  faltantesEn,
  parsearDestinatarios,
  parsearPuerto,
  VARIABLES_SMTP,
} from "./direcciones";

export type { FaltanteCorreo };

export interface ConfigSMTP {
  host: string;
  puerto: number;
  /** true en el 465 (SSL directo), false en el 587 (STARTTLS). */
  seguro: boolean;
  usuario: string;
  clave: string;
  /** De quién sale el correo. Por defecto, el propio usuario SMTP. */
  remitente: string;
  nombreRemitente: string;
}

/**
 * Qué variables faltan. Vacío significa que el envío está configurado.
 *
 * Se consulta ANTES de mostrar el botón: es mucho mejor decir "falta
 * SMTP_CLAVE" en la propia página que dejar que alguien aplaste el botón y
 * reciba un error de conexión sin ninguna explicación.
 */
export function faltantesCorreo(): FaltanteCorreo[] {
  return faltantesEn(process.env);
}

/**
 * Solo lo necesario para conectarse al servidor, sin exigir destinatarios.
 *
 * Lo usa el informe por cliente, donde el destinatario se escribe a mano y
 * `REPORTE_DESTINATARIOS` es nada más el valor que viene propuesto.
 */
export function faltantesSMTP(): FaltanteCorreo[] {
  return faltantesEn(process.env, VARIABLES_SMTP);
}

export function correoConfigurado(): boolean {
  return faltantesCorreo().length === 0;
}

export function configSMTP(): ConfigSMTP {
  const faltan = faltantesCorreo();
  if (faltan.length > 0) {
    throw new Error(
      `El envío de correo no está configurado. Falta ${faltan
        .map((f) => f.variable)
        .join(", ")} en las variables de entorno.`,
    );
  }

  const usuario = process.env.SMTP_USUARIO!.trim();
  const puerto = parsearPuerto(process.env.SMTP_PUERTO);

  return {
    host: process.env.SMTP_HOST!.trim(),
    puerto,
    seguro: esPuertoSeguro(puerto),
    usuario,
    clave: process.env.SMTP_CLAVE!,
    /*
     * Casi todos los servidores rechazan un remitente distinto del usuario
     * autenticado, así que por defecto son el mismo. SMTP_REMITENTE existe
     * para los buzones que tienen alias autorizados.
     */
    remitente: process.env.SMTP_REMITENTE?.trim() || usuario,
    nombreRemitente: process.env.SMTP_NOMBRE?.trim() || "KPIs DLT · Distribución",
  };
}

/** Los destinatarios del reporte, ya validados. */
export function destinatariosReporte(): string[] {
  const { validos, invalidos } = parsearDestinatarios(
    process.env.REPORTE_DESTINATARIOS,
  );

  if (invalidos.length > 0) {
    throw new Error(
      `REPORTE_DESTINATARIOS tiene direcciones que no son válidas: ${invalidos.join(
        ", ",
      )}.`,
    );
  }
  if (validos.length === 0) {
    throw new Error(
      "REPORTE_DESTINATARIOS está vacío: no hay a quién mandarle el reporte.",
    );
  }

  return validos;
}
