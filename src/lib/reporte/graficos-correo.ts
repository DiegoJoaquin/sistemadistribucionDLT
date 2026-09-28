/**
 * Gráficos que sobreviven a un cliente de correo.
 *
 * Nada de SVG ni de JavaScript: Gmail descarta los dos. Un `<canvas>` tampoco,
 * y una imagen obligaría a generarla y alojarla en alguna parte. Lo que sí
 * funciona en todos lados desde hace veinte años es una tabla con celdas de
 * ancho fijo y color de fondo, que es exactamente lo que hay acá.
 *
 * Por eso las formas son barras y no líneas: una línea necesita trazado, y una
 * barra es un rectángulo de color con un ancho. La evolución semanal va como
 * columna de barras horizontales, una por semana, que se lee igual de bien.
 *
 * Las mismas reglas de §9 que en pantalla: promedios por publicación, un hueco
 * donde no hay dato, y el engagement sin mezclar entre redes.
 */

import {
  esPorcentaje,
  type EvolucionSemanal,
  type MetricaGrafico,
  NOMBRE_METRICA,
} from "@/lib/dominio/analitica";
import { numero, numeroFino, porcentaje } from "@/lib/dominio/formato";
import { BARRA } from "@/lib/dominio/paleta";
import { esc, H2 } from "./correo-base";

function valor(v: number | null, pct: boolean): string {
  if (v === null) return "—";
  return pct ? porcentaje(v) : v < 100 ? numeroFino(v) : numero(v);
}

const MESES = ["ene", "feb", "mar", "abr", "may", "jun", "jul", "ago", "sep", "oct", "nov", "dic"];

function etiquetaSemana(desde: string): string {
  const [, m, d] = desde.split("-").map(Number);
  return `${d} ${MESES[m - 1]}`;
}

export interface FilaBarra {
  etiqueta: string;
  valor: number | null;
  /** Texto chico a la derecha del nombre. */
  detalle?: string;
}

/**
 * Una barra por fila, con el ancho en porcentaje del máximo.
 *
 * La barra es una celda con fondo dentro de una tabla de dos columnas: la de
 * color mide lo que vale el dato y la otra completa el resto. Es la técnica que
 * aguanta Outlook, que ignora casi todo el CSS moderno.
 *
 * Un color para todas y no un degradado por tamaño: son categorías sin orden
 * natural, y pintar la más alta más oscura codificaría dos veces el mismo dato.
 */
export function barrasHTML(filas: readonly FilaBarra[], porcentual = false): string {
  if (filas.length === 0) {
    return `<p class="nota">Sin datos en el período.</p>`;
  }

  const max = Math.max(...filas.map((f) => f.valor ?? 0), 0);

  const cuerpo = filas
    .map((f) => {
      const ancho = f.valor === null || max <= 0 ? 0 : Math.round((f.valor / max) * 100);
      /*
       * La barra nunca es de ancho 0 si hay dato: un valor chiquito con barra
       * invisible se lee como "no hay dato", que es otra cosa (§9.4).
       */
      const visible = f.valor === null ? 0 : Math.max(ancho, 2);

      return `<tr>
        <td class="c" width="34%">${esc(f.etiqueta)}${
          f.detalle ? ` <span class="sm">${esc(f.detalle)}</span>` : ""
        }</td>
        <td class="c">
          <table role="presentation" cellpadding="0" cellspacing="0" style="width:100%;border-collapse:collapse">
            <tr>
              <td width="${visible}%" style="height:10px;background:${BARRA};border-radius:2px;font-size:0;line-height:0">&nbsp;</td>
              <td width="${100 - visible}%" style="font-size:0;line-height:0">&nbsp;</td>
            </tr>
          </table>
        </td>
        <td class="c" align="right" width="18%"><strong>${valor(
          f.valor,
          porcentual,
        )}</strong></td>
      </tr>`;
    })
    .join("");

  return `<table role="presentation" cellpadding="4" cellspacing="0" class="t">${cuerpo}</table>`;
}

/**
 * La evolución semanal, como una barra por semana.
 *
 * Una sola cuenta por gráfico: varias series en un correo obligarían a un
 * apilado que en Outlook se desarma. Cuando hay varias cuentas van una debajo
 * de otra, que además es la forma de comparar que pidió el equipo — y no se
 * mezclan escalas, porque cada bloque tiene la suya.
 */
export function evolucionHTML(datos: EvolucionSemanal, cuantasSemanas = 12): string {
  const pct = esPorcentaje(datos.metrica);
  const desde = Math.max(0, datos.semanas.length - cuantasSemanas);
  const semanas = datos.semanas.slice(desde);

  const publicaron = datos.series.filter((s) => s.total > 0);

  /*
   * Una cuenta que publicó pero no entrega esta métrica —YouTube y el alcance,
   * §9.6— se saca del gráfico y se nombra aparte. Dejarla dibujaba seis filas
   * de guiones que no dicen nada y que además se leen como "tuvo cero", que es
   * lo contrario de lo que pasa.
   */
  const conDato = publicaron.filter((s) => s.puntos.some((v) => v !== null));
  const sinDato = publicaron.filter((s) => !s.puntos.some((v) => v !== null));

  const bloques = conDato
    .map((s) => {
      const puntos = s.puntos.slice(desde);
      const publicaciones = s.publicaciones.slice(desde);

      const filas: FilaBarra[] = semanas.map((sem, i) => ({
        etiqueta: etiquetaSemana(sem.desde),
        valor: puntos[i],
        detalle:
          publicaciones[i] === 0
            ? "sin publicar"
            : `${publicaciones[i]} pub.`,
      }));

      return `<div class="card">
        <p class="tit">${esc(s.nombre)} <span style="font-weight:400" class="g">· ${
          s.total
        } ${s.total === 1 ? "publicación" : "publicaciones"} en el período</span></p>
        ${barrasHTML(filas, pct)}
      </div>`;
    })
    .join("");

  if (bloques === "") return "";

  const nota =
    sinDato.length > 0
      ? `<p class="sm" style="margin:6px 0 0">${esc(
          sinDato.map((s) => s.nombre).join(", "),
        )} no ${sinDato.length === 1 ? "aparece" : "aparecen"} en este gráfico: ${
          sinDato.length === 1 ? "esa red no entrega" : "esas redes no entregan"
        } ${NOMBRE_METRICA[datos.metrica].toLowerCase()}, así que no es que haya dado cero.</p>`
      : "";

  return `${H2(`${NOMBRE_METRICA[datos.metrica]} semana a semana`)}
  <p style="margin:0 0 10px;font-size:13px;color:#6e6e68">Promedio por publicación de cada semana. Las semanas sin publicar aparecen sin barra: es un hueco, no un cero.</p>
  ${bloques}
  ${nota}`;
}

export interface BarraCuentaCorreo {
  nombre: string;
  valor: number | null;
  publicaciones: number;
  noComparable: boolean;
}

/** La comparación entre cuentas, de mayor a menor. */
export function comparativaHTML(
  barras: readonly BarraCuentaCorreo[],
  metrica: MetricaGrafico,
): string {
  // Misma razón que en la evolución: una barra vacía se lee como un cero.
  const conDato = barras.filter((b) => b.valor !== null);
  const sinDato = barras.filter((b) => b.valor === null);

  if (conDato.length === 0) return "";

  const hayNoComparable = conDato.some((b) => b.noComparable);

  return `${H2(`${NOMBRE_METRICA[metrica]} por cuenta`)}
  ${barrasHTML(
    conDato.map((b) => ({
      etiqueta: b.nombre,
      valor: b.valor,
      detalle: `${b.publicaciones} pub.`,
    })),
    esPorcentaje(metrica),
  )}
  ${
    sinDato.length > 0
      ? `<p class="sm" style="margin:6px 0 0">${esc(
          sinDato.map((b) => b.nombre).join(", "),
        )} no ${sinDato.length === 1 ? "aparece" : "aparecen"}: ${
          sinDato.length === 1 ? "esa red no entrega" : "esas redes no entregan"
        } ${NOMBRE_METRICA[metrica].toLowerCase()}.</p>`
      : ""
  }
  ${
    hayNoComparable
      ? `<p class="sm" style="margin:6px 0 0">YouTube calcula el engagement sobre visualizaciones y el resto sobre alcance: esa barra no es comparable con las otras.</p>`
      : ""
  }`;
}
