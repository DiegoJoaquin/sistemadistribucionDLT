/**
 * Traducción de los errores de SMTP, que son de los más crípticos que hay.
 *
 * Sin esto, una contraseña equivocada llega como "535 5.7.8 Username and
 * Password not accepted" y un puerto equivocado como "ETIMEDOUT" pelado.
 * Ninguno de los dos le dice a nadie qué tiene que arreglar.
 *
 * Va en su propio módulo, sin `server-only`, para poder probarlo con los
 * errores que de verdad devuelven los servidores.
 */

export function explicarError(e: unknown): string {
  const codigo = (e as { code?: string })?.code ?? "";
  const respuesta = (e as { response?: string })?.response ?? "";
  const bruto = e instanceof Error ? e.message : String(e);
  const todo = `${respuesta} ${bruto}`;

  if (codigo === "EAUTH" || /\b53[45]\b|password not accepted|autenticac/i.test(todo)) {
    return (
      "El servidor rechazó el usuario o la contraseña. Si tu correo tiene " +
      "verificación en dos pasos, SMTP_CLAVE tiene que ser una contraseña de " +
      "aplicación, no la del buzón."
    );
  }

  if (codigo === "ETIMEDOUT" || codigo === "ESOCKET" || codigo === "ECONNECTION") {
    return (
      "No pude conectarme al servidor de correo. Revisa SMTP_HOST y " +
      "SMTP_PUERTO: el 465 y el 587 usan cifrados distintos y no son " +
      "intercambiables."
    );
  }

  if (codigo === "EDNS" || /ENOTFOUND/i.test(todo)) {
    return "No existe el servidor indicado en SMTP_HOST. Revisa que esté bien escrito.";
  }

  if (/sender address rejected|not authorized|\b5\.7\.\d+\b/i.test(todo)) {
    return (
      "El servidor no te deja mandar desde esa dirección. Normalmente el " +
      "remitente tiene que ser el mismo usuario con el que te autenticas: " +
      "quita SMTP_REMITENTE o ponlo igual a SMTP_USUARIO."
    );
  }

  if (/\b45[0-9]\b|try again later|rate limit|too many/i.test(todo)) {
    return (
      "El servidor pidió esperar: o está saturado o llegaste a su límite de " +
      "envíos. Vuelve a intentarlo en unos minutos."
    );
  }

  return bruto;
}
