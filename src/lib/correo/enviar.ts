/**
 * Envío de correo por SMTP.
 *
 * Aparte del armado del reporte a propósito: acá no se decide NADA del
 * contenido, solo se manda. Así el generador se puede probar sin red y esto se
 * puede cambiar de proveedor sin tocar el reporte.
 */

import "server-only";

import nodemailer from "nodemailer";
import { configSMTP } from "./entorno";
import { explicarError } from "./errores";
import { armarMensaje, type Correo } from "./mensaje";

export type { Correo };

export interface ResultadoEnvio {
  ok: boolean;
  mensaje: string;
  /** Identificador que devuelve el servidor, para poder rastrear el envío. */
  id?: string;
}

/**
 * Manda un correo y devuelve si se pudo.
 *
 * No lanza: quien llama es una acción de servidor que tiene que poder mostrar
 * el problema en pantalla, no caerse con un 500.
 */
export async function enviarCorreo(correo: Correo): Promise<ResultadoEnvio> {
  let config;
  try {
    config = configSMTP();
  } catch (e) {
    return { ok: false, mensaje: e instanceof Error ? e.message : "Sin configurar." };
  }

  const transporte = nodemailer.createTransport({
    host: config.host,
    port: config.puerto,
    secure: config.seguro,
    auth: { user: config.usuario, pass: config.clave },
    /*
     * Las funciones de Vercel se apagan cuando termina la petición, así que no
     * sirve de nada dejar la conexión abierta esperando otro correo.
     */
    pool: false,
    connectionTimeout: 15_000,
    greetingTimeout: 10_000,
    socketTimeout: 20_000,
  });

  try {
    const info = await transporte.sendMail(armarMensaje(correo, config));

    return {
      ok: true,
      mensaje: `Enviado a ${correo.para.join(", ")}.`,
      id: info.messageId,
    };
  } catch (e) {
    return { ok: false, mensaje: explicarError(e) };
  } finally {
    transporte.close();
  }
}
