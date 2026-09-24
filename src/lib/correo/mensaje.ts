/**
 * Armado del mensaje, separado del envío.
 *
 * Existe para poder probar que el correo se construye bien sin mandar nada: un
 * asunto con acentos, un destinatario con un espacio de más o un HTML con un
 * carácter raro fallan al armar el mensaje, no al conectar con el servidor. Y
 * la única forma de verlo sin esta separación sería mandar un correo de verdad
 * a los jefes.
 *
 * No lleva `server-only` ni lee el entorno: recibe la configuración como
 * argumento.
 */

export interface Correo {
  para: string[];
  asunto: string;
  html: string;
  /** Alternativa en texto para los clientes que no muestran HTML. */
  texto: string;
}

export interface DatosRemitente {
  /** Dirección desde la que sale el correo. */
  remitente: string;
  nombreRemitente: string;
  /** Dirección a la que llegan las respuestas. */
  usuario: string;
}

export interface MensajeArmado {
  from: { name: string; address: string };
  replyTo: string;
  to: string[];
  subject: string;
  html: string;
  text: string;
}

export function armarMensaje(correo: Correo, de: DatosRemitente): MensajeArmado {
  if (correo.para.length === 0) {
    throw new Error("No hay destinatarios: el correo no se puede armar.");
  }

  return {
    from: { name: de.nombreRemitente, address: de.remitente },
    // Responder al correo llega a quien lo mandó, que es lo esperable.
    replyTo: de.usuario,
    to: correo.para,
    subject: correo.asunto,
    html: correo.html,
    text: correo.texto,
  };
}
