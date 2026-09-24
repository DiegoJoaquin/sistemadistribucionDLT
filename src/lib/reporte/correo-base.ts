/**
 * Las piezas compartidas de los correos: la hoja de estilos, el envoltorio del
 * documento y los ladrillos que se repiten (badges, títulos, líneas de KPI).
 *
 * Existe porque hay dos correos —el catastro semanal y el informe por
 * cliente— y duplicar trescientas líneas de HTML de correo garantizaba que se
 * desfasaran. El arreglo del peso de Gmail vive acá una sola vez.
 */

import { coloresDeltaHex, porcentajeDelta } from "@/lib/dominio/formato";

/**
 * Los estilos repetidos van en una hoja en el <head>, no en cada celda.
 *
 * No es cosmética: con 121 publicaciones y 49 series el correo pesaba 111 KB,
 * de los cuales 83 KB eran atributos `style=` idénticos copiados en cada una de
 * las 378 celdas. Gmail RECORTA los correos sobre ~102 KB — al destinatario le
 * llegaba "[Mensaje recortado]" y la mitad del catastro escondida tras un clic.
 *
 * Lo dinámico (el color de cada variación, que depende de su valor) sigue en
 * línea, porque no se puede saber de antemano.
 *
 * Si un cliente de correo ignora la hoja de estilos — le pasa a algún Outlook
 * viejo — el correo se sigue leyendo: las alineaciones van como atributos
 * `align` de HTML y el espaciado como `cellpadding`, que sobreviven a que se
 * descarte el CSS. Se pierde el detalle visual, no el contenido.
 */
export const HOJA = `
    body{margin:0;padding:0;background:#f6f5f3}
    .m{width:100%;max-width:720px;text-align:left;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Helvetica,Arial,sans-serif}
    .t{width:100%;border-collapse:collapse}
    .card{margin:0 0 16px;padding:12px 14px;border:1px solid #e5e4e0;border-radius:8px;background:#fff}
    .h2{margin:28px 0 10px;font-size:13px;font-weight:700;letter-spacing:.08em;text-transform:uppercase;color:#6e6e68}
    .th{padding:8px 6px;font-size:11px;text-transform:uppercase;letter-spacing:.05em;color:#6e6e68;font-weight:400}
    .c{padding:7px 6px;border-top:1px solid #e5e4e0;font-size:13px;color:#33332f}
    .k{padding:3px 0;font-size:14px;color:#33332f}
    .km{padding:3px 0;font-size:13px;color:#8a8a82}
    .lbl{color:#6e6e68}
    .val{color:#1a1a18}
    .g{color:#8a8a82}
    .sm{font-size:11px;color:#8a8a82}
    .cmp{font-size:13px}
    .p{display:inline-block;padding:2px 6px;border-radius:4px;font-size:12px;font-weight:600;white-space:nowrap}
    .tit{margin:0 0 8px;font-size:14px;font-weight:700;color:#1a1a18}
    .nota{margin:0;font-size:14px;color:#8a8a82}
    .aviso{margin:10px 0 0;padding:10px 12px;border:1px solid #f0d9a8;border-radius:8px;background:#fdf6e7;font-size:13px;color:#6b4e12}
`;

export const esc = (s: string) =>
  s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");

/** Los dos colores del badge son lo único que no se puede sacar a una clase. */
export function pill(d: number | null): string {
  const c = coloresDeltaHex(d);
  return `<span class="p" style="background:${c.fondo};color:${c.texto}">${porcentajeDelta(
    d,
  )}</span>`;
}

export const H2 = (t: string) => `<h2 class="h2">${esc(t)}</h2>`;

export const TH = (t: string, alinear = "left") =>
  `<th class="th" align="${alinear}">${esc(t)}</th>`;

/**
 * Una línea de KPI, en el formato que pidió el equipo:
 *
 *     Alcance: 63.874 (-9,0% que la línea base)
 *
 * §9.4 — distingue dos cosas que se veían iguales y no lo son: que la métrica
 * no se haya medido, y que no haya línea base contra la que compararla. Antes
 * las dos salían como "— (sin línea base)", que le echaba la culpa a la base
 * cuando lo que faltaba era el dato.
 */
export function lineaKPI(
  nombre: string,
  valorCrudo: number | null,
  valor: string,
  vsBase: number | null,
  textoBase: string,
  opciones: { vsCuenta?: number | null; sinMedir?: string } = {},
): string {
  let comparacion: string;

  if (valorCrudo === null) {
    comparacion = `<span class="g">${esc(opciones.sinMedir ?? "no se midió")}</span>`;
  } else {
    const trozo = (d: number | null, que: string) => {
      if (d === null) return `<span class="g">sin ${que}</span>`;
      return `<span style="color:${coloresDeltaHex(d).texto}">${porcentajeDelta(
        d,
      )} ${que}</span>`;
    };
    const partes = [trozo(vsBase, textoBase)];
    if (opciones.vsCuenta !== undefined) {
      partes.push(trozo(opciones.vsCuenta, "que la cuenta"));
    }
    comparacion = partes.join(" · ");
  }

  return `<tr><td class="k"><span class="lbl">${esc(
    nombre,
  )}:</span> <strong class="${valorCrudo === null ? "g" : "val"}">${valor}</strong> <span class="cmp">(${comparacion})</span></td></tr>`;
}

/** Una línea sin comparación, para lo que no tiene contra qué compararse. */
export function lineaSuelta(nombre: string, valor: string, tenue = false): string {
  return `<tr><td class="k"><span class="lbl">${esc(
    nombre,
  )}:</span> <strong class="${tenue ? "g" : "val"}">${valor}</strong></td></tr>`;
}

export interface OpcionesCorreo {
  /**
   * URL pública de la aplicación. Sin ella el correo va sin logo: un cliente
   * de correo no resuelve rutas relativas.
   */
  urlBase?: string | null;
}

/**
 * El documento completo: cabecera con el logo, el cuerpo y el pie.
 *
 * Todo va en tablas y con estilos en línea o por clase porque es un correo, no
 * una página: la mitad de los clientes no soporta flexbox ni grid.
 */
export function envoltura({
  titulo,
  encabezado,
  bajada,
  referencia,
  aviso,
  cuerpo,
  pie,
  opciones = {},
}: {
  /** El <title> del documento. */
  titulo: string;
  /** El H1. */
  encabezado: string;
  /** La línea de abajo del H1: el período. */
  bajada: string;
  /** Contra qué se compara todo. */
  referencia: string;
  /** Recuadro ámbar, si hay algo que advertir. */
  aviso?: string;
  cuerpo: string;
  pie: string;
  opciones?: OpcionesCorreo;
}): string {
  return `<!doctype html>
<html lang="es-CL">
<head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>${esc(
    titulo,
  )}</title><style>${HOJA}</style></head>
<body>
<table role="presentation" cellpadding="0" cellspacing="0" style="width:100%;background:#f6f5f3">
<tr><td align="center" style="padding:24px 12px">
<table role="presentation" cellpadding="0" cellspacing="0" class="m">
<tr><td>

  ${
    opciones.urlBase
      ? `<img src="${opciones.urlBase}/logo-dlt.png" width="46" height="47" alt="DLT Sports" style="display:block;border:0;margin:0 0 14px">`
      : ""
  }
  <p style="margin:0;font-size:11px;font-weight:700;letter-spacing:.14em;text-transform:uppercase;color:#8a8a82">DLT Sports · Distribución</p>
  <h1 style="margin:6px 0 2px;font-size:22px;font-weight:700;color:#1a1a18">${esc(
    encabezado,
  )}</h1>
  <p style="margin:0 0 4px;font-size:15px;color:#33332f">${esc(bajada)}</p>
  <p style="margin:0;font-size:12px;color:#8a8a82">${referencia}</p>
  ${aviso ? `<p class="aviso">${aviso}</p>` : ""}

  ${cuerpo}

  <p style="margin:28px 0 0;padding-top:12px;border-top:1px solid #e5e4e0;font-size:11px;line-height:1.6;color:#8a8a82">
    ${pie}
  </p>

</td></tr>
</table>
</td></tr>
</table>
</body>
</html>`;
}
