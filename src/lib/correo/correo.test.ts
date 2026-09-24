/**
 * Tests del envío de correo, sin mandar ni un correo.
 *
 * El mensaje se arma con `armarMensaje` y se pasa por el transporte `json` de
 * nodemailer, que construye el MIME completo y valida las direcciones y las
 * cabeceras sin abrir ninguna conexión. Así se puede verificar que el correo de
 * verdad sale bien armado, en vez de descubrirlo mandándoselo a los jefes.
 */
import nodemailer from "nodemailer";
import { describe, expect, it } from "vitest";
import {
  esDireccion,
  esPuertoSeguro,
  faltantesEn,
  MAXIMO_DESTINATARIOS,
  ocultarDireccion,
  parsearDestinatarios,
  parsearPuerto,
  VARIABLES_CORREO,
  VARIABLES_SMTP,
} from "./direcciones";
import { explicarError } from "./errores";
import { armarMensaje } from "./mensaje";

describe("parsearDestinatarios", () => {
  it("separa por coma, por punto y coma y por salto de línea", () => {
    const r = parsearDestinatarios("a@dlt.cl, b@dlt.cl; c@dlt.cl\nd@dlt.cl");
    expect(r.validos).toEqual(["a@dlt.cl", "b@dlt.cl", "c@dlt.cl", "d@dlt.cl"]);
    expect(r.invalidos).toEqual([]);
  });

  it("aguanta los espacios de más, que es como se pegan en Vercel", () => {
    const r = parsearDestinatarios("  jefe@dlt.cl ,  jefa@dlt.cl  ");
    expect(r.validos).toEqual(["jefe@dlt.cl", "jefa@dlt.cl"]);
  });

  /*
   * Con la misma dirección dos veces el servidor manda el correo dos veces y
   * el jefe recibe el reporte duplicado.
   */
  it("no repite destinatarios, ni con distinta capitalización", () => {
    const r = parsearDestinatarios("Jefe@dlt.cl, jefe@dlt.cl, JEFE@DLT.CL");
    expect(r.validos).toEqual(["Jefe@dlt.cl"]);
  });

  it("separa las que no son direcciones en vez de mandarlas", () => {
    const r = parsearDestinatarios("jefe@dlt.cl, esto no es un correo, otra@");
    expect(r.validos).toEqual(["jefe@dlt.cl"]);
    expect(r.invalidos).toEqual(["esto no es un correo", "otra@"]);
  });

  it("una variable vacía o ausente no es un error, es una lista vacía", () => {
    for (const v of ["", "   ", undefined, null]) {
      expect(parsearDestinatarios(v).validos).toEqual([]);
    }
  });

  it("reconoce una dirección", () => {
    expect(esDireccion("a@b.cl")).toBe(true);
    expect(esDireccion("a@b")).toBe(false);
    expect(esDireccion("a b@c.cl")).toBe(false);
  });
});

describe("faltantesEn", () => {
  const completo = {
    SMTP_HOST: "smtp.dlt.cl",
    SMTP_USUARIO: "diego@dltsports.cl",
    SMTP_CLAVE: "secreto",
    REPORTE_DESTINATARIOS: "jefe@dltsports.cl",
  };

  it("sin nada configurado enumera las cuatro variables", () => {
    expect(faltantesEn({}).map((f) => f.variable)).toEqual([
      "SMTP_HOST",
      "SMTP_USUARIO",
      "SMTP_CLAVE",
      "REPORTE_DESTINATARIOS",
    ]);
  });

  it("con todo puesto no falta nada", () => {
    expect(faltantesEn(completo)).toEqual([]);
  });

  /*
   * Una variable creada en Vercel pero dejada en blanco es el caso que más
   * confunde: parece configurada y no lo está.
   */
  it("una variable en blanco o con solo espacios cuenta como ausente", () => {
    expect(faltantesEn({ ...completo, SMTP_CLAVE: "" })[0].variable).toBe("SMTP_CLAVE");
    expect(faltantesEn({ ...completo, SMTP_CLAVE: "   " })[0].variable).toBe("SMTP_CLAVE");
  });

  it("cada variable explica para qué sirve, no solo su nombre", () => {
    for (const v of VARIABLES_CORREO) {
      expect(v.para.length).toBeGreaterThan(10);
    }
  });

  /*
   * El informe por cliente se manda a quien se escriba en el campo, así que
   * `REPORTE_DESTINATARIOS` ahí es solo el valor propuesto. Exigirlo escondería
   * el botón de envío del informe por una variable que no le hace falta.
   */
  it("para el informe no se exige REPORTE_DESTINATARIOS", () => {
    const soloSMTP = {
      SMTP_HOST: "smtp.gmail.com",
      SMTP_USUARIO: "diego@dltsports.com",
      SMTP_CLAVE: "secreto",
    };
    expect(faltantesEn(soloSMTP, VARIABLES_SMTP)).toEqual([]);
    // Para el reporte semanal, que va a destinatarios fijos, sí se exige.
    expect(faltantesEn(soloSMTP).map((f) => f.variable)).toEqual([
      "REPORTE_DESTINATARIOS",
    ]);
  });

  it("VARIABLES_SMTP es un subconjunto de las del reporte", () => {
    for (const v of VARIABLES_SMTP) {
      expect(VARIABLES_CORREO).toContain(v);
    }
    expect(VARIABLES_CORREO.length).toBe(VARIABLES_SMTP.length + 1);
  });
});

describe("tope de destinatarios", () => {
  /*
   * El campo de destinatarios del informe es texto abierto y detrás está la
   * dirección de correo de la empresa. El tope evita que se pueda usar para
   * mandar un correo a medio mundo de una vez.
   */
  it("hay un máximo y es un número razonable para un envío interno", () => {
    expect(MAXIMO_DESTINATARIOS).toBeGreaterThan(1);
    expect(MAXIMO_DESTINATARIOS).toBeLessThanOrEqual(20);
  });

  it("una lista larga se detecta contando los válidos", () => {
    const muchos = Array.from({ length: 30 }, (_, i) => `p${i}@dlt.cl`).join(", ");
    expect(parsearDestinatarios(muchos).validos.length).toBeGreaterThan(
      MAXIMO_DESTINATARIOS,
    );
  });
});

describe("puerto", () => {
  it("465 es SSL directo; 587 y 25 son STARTTLS", () => {
    expect(esPuertoSeguro(465)).toBe(true);
    expect(esPuertoSeguro(587)).toBe(false);
    expect(esPuertoSeguro(25)).toBe(false);
  });

  it("sin puerto usa 587, que es el habitual", () => {
    expect(parsearPuerto(undefined)).toBe(587);
    expect(parsearPuerto("")).toBe(587);
    expect(parsearPuerto(" 465 ")).toBe(465);
  });

  it("un puerto que no es un puerto se rechaza con un mensaje que se entiende", () => {
    for (const malo of ["465a", "0", "99999", "-1"]) {
      expect(() => parsearPuerto(malo)).toThrow(/465 o 587/);
    }
  });
});

describe("explicarError", () => {
  /*
   * Los dos errores que de verdad van a pasar: la contraseña del buzón en vez
   * de una contraseña de aplicación, y el puerto equivocado.
   */
  it("una contraseña rechazada dice que hace falta una de aplicación", () => {
    const e = Object.assign(new Error("Invalid login"), {
      code: "EAUTH",
      response: "535-5.7.8 Username and Password not accepted",
    });
    expect(explicarError(e)).toContain("contraseña de aplicación");
  });

  it("un tiempo de espera agotado apunta al host y al puerto", () => {
    const e = Object.assign(new Error("Connection timeout"), { code: "ETIMEDOUT" });
    expect(explicarError(e)).toContain("SMTP_PUERTO");
    expect(explicarError(e)).toContain("465");
  });

  it("un host inexistente lo dice", () => {
    const e = new Error("getaddrinfo ENOTFOUND smtp.mal.escrito");
    expect(explicarError(e)).toContain("SMTP_HOST");
  });

  it("un remitente no autorizado explica que tiene que coincidir con el usuario", () => {
    const e = Object.assign(new Error("Rejected"), {
      response: "553 5.7.1 Sender address rejected: not owned by user",
    });
    expect(explicarError(e)).toContain("SMTP_USUARIO");
  });

  it("un límite de envíos pide esperar en vez de culpar a la configuración", () => {
    const e = Object.assign(new Error("Too many messages"), {
      response: "451 4.7.0 Try again later",
    });
    expect(explicarError(e)).toContain("unos minutos");
  });

  it("lo que no reconoce lo pasa tal cual, sin inventar un diagnóstico", () => {
    expect(explicarError(new Error("algo muy raro"))).toBe("algo muy raro");
  });
});

describe("armarMensaje", () => {
  const de = {
    remitente: "diego@dltsports.cl",
    nombreRemitente: "KPIs DLT · Distribución",
    usuario: "diego@dltsports.cl",
  };

  it("las respuestas van a quien lo mandó", () => {
    const m = armarMensaje(
      { para: ["jefe@dlt.cl"], asunto: "Hola", html: "<p>a</p>", texto: "a" },
      de,
    );
    expect(m.replyTo).toBe("diego@dltsports.cl");
    expect(m.from).toEqual({
      name: "KPIs DLT · Distribución",
      address: "diego@dltsports.cl",
    });
  });

  it("sin destinatarios no se arma: mejor fallar acá que en el servidor", () => {
    expect(() =>
      armarMensaje({ para: [], asunto: "x", html: "", texto: "" }, de),
    ).toThrow(/destinatarios/);
  });

  /*
   * La prueba de verdad: nodemailer construye el MIME completo. Si el asunto,
   * una dirección o el HTML tuvieran algo que rompiera las cabeceras, falla
   * acá y no delante de los jefes.
   */
  it("nodemailer construye el mensaje completo, con acentos en el asunto", async () => {
    const transporte = nodemailer.createTransport({ jsonTransport: true });

    const info = await transporte.sendMail(
      armarMensaje(
        {
          para: ["jefe@dltsports.cl", "jefa@dltsports.cl"],
          asunto: "Catastro semanal de distribución · 25 al 31 de agosto de 2026",
          html: '<!doctype html><html><body><p>Alcance: 63.874 (-9,0%)</p></body></html>',
          texto: "Alcance: 63.874 (-9,0%)",
        },
        de,
      ),
    );

    const m = JSON.parse(info.message as string);
    // nodemailer normaliza las direcciones a { address, name }.
    expect(m.to.map((d: { address: string }) => d.address)).toEqual([
      "jefe@dltsports.cl",
      "jefa@dltsports.cl",
    ]);
    expect(m.subject).toContain("distribución");
    expect(m.html).toContain("63.874");
    // Va con las dos partes: quien no ve HTML igual lee el reporte.
    expect(m.text).toContain("63.874");
    expect(m.replyTo[0].address).toBe("diego@dltsports.cl");
    expect(m.from.address).toBe("diego@dltsports.cl");
  });

  it("acepta un correo del tamaño real del reporte", async () => {
    const transporte = nodemailer.createTransport({ jsonTransport: true });
    // Alrededor de 50 KB, que es lo que pesa el catastro de una semana cargada.
    const html = `<!doctype html><html><body>${"<p>fila</p>".repeat(5_000)}</body></html>`;

    const info = await transporte.sendMail(
      armarMensaje({ para: ["jefe@dlt.cl"], asunto: "Reporte", html, texto: "x" }, de),
    );
    expect(JSON.parse(info.message as string).html.length).toBeGreaterThan(40_000);
  });
});

describe("ocultarDireccion", () => {
  it("deja ver el dominio sin exponer el buzón entero", () => {
    expect(ocultarDireccion("diego@dltsports.cl")).toBe("di···@dltsports.cl");
    expect(ocultarDireccion("sin-arroba")).toBe("sin-arroba");
  });
});
