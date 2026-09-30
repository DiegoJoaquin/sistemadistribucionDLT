"use client";

import {
  escribirEnEje,
  etiquetaDeGrupo,
  NOMBRE_EJE,
  type Ranking,
} from "@/lib/dominio/rendimiento";
import { fechaCorta } from "@/lib/dominio/formato";
import { APAGADO, EJE, GRILLA } from "@/lib/dominio/paleta";

const ANCHO = 860;
const MARGEN = { arriba: 22, derecha: 96, abajo: 40, izquierda: 300 };
/*
 * Cada fila lleva DOS líneas de texto —el título y la línea de cuenta, fecha y
 * grupo—, así que necesita más alto del que pide una barra sola. Con 30 las dos
 * líneas se tocaban.
 */
const ALTO_FILA = 36;
const TRAZO_ANCHO = ANCHO - MARGEN.izquierda - MARGEN.derecha;

/** Corta el título sin partir un emoji por la mitad. */
function recortar(texto: string, largo: number): string {
  const piezas = [...texto];
  return piezas.length <= largo ? texto : `${piezas.slice(0, largo - 1).join("")}…`;
}

/**
 * Las publicaciones que más rindieron, de mayor a menor.
 *
 * La línea de la mediana no es decoración: sin ella, veinte barras ordenadas de
 * mayor a menor siempre parecen un buen período. Con ella se ve de un vistazo
 * cuánto se despegan las mejores del resto — y si la vigésima ya está por
 * debajo de la mitad, eso también es una respuesta.
 *
 * La escala sale de TODAS las publicaciones y no solo de las veinte mostradas:
 * si saliera del máximo de la lista, la última barra ocuparía media pantalla y
 * parecería que rindió bien.
 */
export function RankingPosts({ datos }: { datos: Ranking }) {
  const alto = MARGEN.arriba + datos.mejores.length * ALTO_FILA + MARGEN.abajo;
  const x = (v: number) => MARGEN.izquierda + datos.escala.posicion(v) * TRAZO_ANCHO;

  return (
    <svg
      viewBox={`0 0 ${ANCHO} ${alto}`}
      className="w-full"
      style={{ height: "auto" }}
      role="img"
      aria-label={`Las ${datos.mejores.length} publicaciones con más ${NOMBRE_EJE[datos.metrica].toLowerCase()}. Los nombres y enlaces están en la tabla que sigue.`}
    >
      {datos.escala.marcas.map((v) => (
        <g key={v}>
          <line
            x1={x(v)}
            x2={x(v)}
            y1={MARGEN.arriba}
            y2={alto - MARGEN.abajo}
            stroke={v === 0 ? EJE : GRILLA}
            strokeWidth={1}
          />
          <text
            x={x(v)}
            y={alto - MARGEN.abajo + 18}
            textAnchor="middle"
            className="fill-[var(--color-tinta-tenue)] text-[11px] tabular-nums"
          >
            {escribirEnEje(v, datos.metrica, 0)}
          </text>
        </g>
      ))}

      {datos.mejores.map((d, i) => {
        const y = MARGEN.arriba + i * ALTO_FILA;
        const ancho = Math.max(2, x(d.x) - MARGEN.izquierda);

        return (
          <g key={d.punto.id}>
            <text
              x={MARGEN.izquierda - 10}
              y={y + 14}
              textAnchor="end"
              className="fill-[var(--color-tinta)] text-[11px]"
            >
              {recortar(d.punto.titulo ?? "Sin título", 46)}
            </text>
            <text
              x={MARGEN.izquierda - 10}
              y={y + 28}
              textAnchor="end"
              className="fill-[var(--color-tinta-tenue)] text-[10px]"
            >
              {d.punto.cuenta} · {fechaCorta(d.punto.fecha)} · {etiquetaDeGrupo(d.grupo, datos.agrupacion)}
            </text>

            <rect
              x={MARGEN.izquierda}
              y={y + 9}
              width={ancho}
              height={ALTO_FILA - 18}
              fill={d.color ?? APAGADO}
              rx={2}
            />

            {/* Etiqueta directa: el valor al final de su propia barra. */}
            <text
              x={MARGEN.izquierda + ancho + 8}
              y={y + ALTO_FILA / 2 + 3}
              className="fill-[var(--color-tinta)] text-[11px] font-medium tabular-nums"
            >
              {escribirEnEje(d.x, datos.metrica)}
            </text>
          </g>
        );
      })}

      {/* La mediana de TODAS las publicaciones del período, no de estas veinte. */}
      {datos.mediana !== null && datos.mediana > 0 && (
        <>
          <line
            x1={x(datos.mediana)}
            x2={x(datos.mediana)}
            y1={MARGEN.arriba - 2}
            y2={alto - MARGEN.abajo}
            stroke={EJE}
            strokeWidth={1.5}
          />
          {/*
            La etiqueta va ARRIBA de la primera fila. Abajo quedaba encima de la
            última barra, que es justo la más corta y la que más la tapaba.
          */}
          <text
            x={x(datos.mediana) + 5}
            y={MARGEN.arriba - 5}
            className="fill-[var(--color-tinta-tenue)] text-[10px]"
          >
            mediana del período
          </text>
        </>
      )}

      <text
        x={MARGEN.izquierda + TRAZO_ANCHO / 2}
        y={alto - 6}
        textAnchor="middle"
        className="fill-[var(--color-tinta-suave)] text-[12px] font-medium"
      >
        {NOMBRE_EJE[datos.metrica]}
      </text>
    </svg>
  );
}
