"use client";

import { useState } from "react";
import { type Distribucion, escribirEnEje, NOMBRE_EJE } from "@/lib/dominio/rendimiento";
import { BARRA, EJE, GRILLA, SERIES } from "@/lib/dominio/paleta";

const ANCHO = 860;
const ALTO = 420;
const MARGEN = { arriba: 40, derecha: 24, abajo: 56, izquierda: 56 };
const TRAZO_ANCHO = ANCHO - MARGEN.izquierda - MARGEN.derecha;
const TRAZO_ALTO = ALTO - MARGEN.arriba - MARGEN.abajo;

/** El color de la línea del promedio: distinto del de las barras, a propósito. */
const COLOR_PROMEDIO = SERIES[1];

/**
 * El histograma de una métrica: cuántas publicaciones caen en cada tramo.
 *
 * Contesta "¿cuánto rinde una publicación normal?", que hoy se responde con el
 * promedio del panel — y con estos datos el promedio casi nunca es la
 * publicación normal. Por eso la mediana y el promedio van dibujados juntos:
 * cuando están lejos, esa distancia ES el dato, y significa que al promedio lo
 * están empujando dos o tres virales.
 *
 * Un solo color: es una sola serie. Para ver un grupo por separado se apagan
 * los demás en la leyenda, que se lee mejor que tres histogramas encimados.
 */
export function Histograma({ datos }: { datos: Distribucion }) {
  const [activa, setActiva] = useState<number | null>(null);

  const x = (v: number) => MARGEN.izquierda + datos.escala.posicion(v) * TRAZO_ANCHO;
  const alturaDe = (n: number) => (datos.pico === 0 ? 0 : (n / datos.pico) * TRAZO_ALTO);
  const y = (n: number) => MARGEN.arriba + TRAZO_ALTO - alturaDe(n);

  /* Las marcas del eje vertical son cuentas: siempre enteras. */
  const marcasY = (() => {
    if (datos.pico <= 0) return [0];
    const paso = Math.max(1, Math.ceil(datos.pico / 5));
    const salida: number[] = [];
    for (let v = 0; v <= datos.pico; v += paso) salida.push(v);
    return salida;
  })();

  return (
    <div className="relative">
      <svg
        viewBox={`0 0 ${ANCHO} ${ALTO}`}
        className="w-full"
        style={{ height: "auto" }}
        role="img"
        aria-label={`Distribución de ${NOMBRE_EJE[datos.metrica].toLowerCase()} entre ${datos.n} publicaciones. Los valores están en la tabla que sigue.`}
        onMouseLeave={() => setActiva(null)}
      >
        {marcasY.map((n) => (
          <g key={n}>
            <line
              x1={MARGEN.izquierda}
              x2={ANCHO - MARGEN.derecha}
              y1={y(n)}
              y2={y(n)}
              stroke={n === 0 ? EJE : GRILLA}
              strokeWidth={1}
            />
            <text
              x={MARGEN.izquierda - 8}
              y={y(n) + 4}
              textAnchor="end"
              className="fill-[var(--color-tinta-tenue)] text-[11px] tabular-nums"
            >
              {n}
            </text>
          </g>
        ))}

        {datos.escala.marcas.map((v) => (
          <text
            key={v}
            x={x(v)}
            y={ALTO - MARGEN.abajo + 18}
            textAnchor="middle"
            className="fill-[var(--color-tinta-tenue)] text-[11px] tabular-nums"
          >
            {escribirEnEje(v, datos.metrica, 0)}
          </text>
        ))}

        {/* Las columnas. Un hueco de un píxel para que se cuenten. */}
        {datos.barras.map((b, i) => {
          const izquierda = x(b.desde);
          const ancho = Math.max(1, x(b.hasta) - izquierda - 1);
          return (
            <g key={i}>
              {b.n > 0 && (
                <rect
                  x={izquierda}
                  y={y(b.n)}
                  width={ancho}
                  height={alturaDe(b.n)}
                  fill={BARRA}
                  fillOpacity={activa === i ? 1 : 0.82}
                  rx={1}
                />
              )}
              <rect
                x={izquierda}
                y={MARGEN.arriba}
                width={ancho + 1}
                height={TRAZO_ALTO}
                fill="transparent"
                onMouseEnter={() => setActiva(i)}
              />
            </g>
          );
        })}

        {/*
          Mediana y promedio, uno al lado del otro. Cuando se separan mucho, esa
          separación es la noticia: el promedio no describe a la publicación
          típica porque lo empujan las virales.
        */}
        {datos.mediana !== null && (
          <>
            <line
              x1={x(datos.mediana)}
              x2={x(datos.mediana)}
              y1={MARGEN.arriba - 14}
              y2={MARGEN.arriba + TRAZO_ALTO}
              stroke={EJE}
              strokeWidth={1.5}
            />
            <text
              x={x(datos.mediana)}
              y={MARGEN.arriba - 20}
              textAnchor="middle"
              className="fill-[var(--color-tinta-suave)] text-[11px] font-medium"
            >
              mediana {escribirEnEje(datos.mediana, datos.metrica)}
            </text>
          </>
        )}
        {datos.promedio !== null && (
          <>
            <line
              x1={x(datos.promedio)}
              x2={x(datos.promedio)}
              y1={MARGEN.arriba - 2}
              y2={MARGEN.arriba + TRAZO_ALTO}
              stroke={COLOR_PROMEDIO}
              strokeWidth={1.5}
            />
            <text
              x={x(datos.promedio)}
              y={MARGEN.arriba - 6}
              textAnchor="middle"
              className="text-[11px] font-medium"
              fill={COLOR_PROMEDIO}
            >
              promedio {escribirEnEje(datos.promedio, datos.metrica)}
            </text>
          </>
        )}

        <text
          x={MARGEN.izquierda + TRAZO_ANCHO / 2}
          y={ALTO - 8}
          textAnchor="middle"
          className="fill-[var(--color-tinta-suave)] text-[12px] font-medium"
        >
          {NOMBRE_EJE[datos.metrica]}
          {datos.escala.log ? " (escala logarítmica)" : ""}
        </text>
        <text
          transform={`rotate(-90 14 ${MARGEN.arriba + TRAZO_ALTO / 2})`}
          x={14}
          y={MARGEN.arriba + TRAZO_ALTO / 2}
          textAnchor="middle"
          className="fill-[var(--color-tinta-suave)] text-[12px] font-medium"
        >
          Publicaciones
        </text>
      </svg>

      {activa !== null && datos.barras[activa] && (
        <div
          role="status"
          className="pointer-events-none absolute left-1/2 top-2 z-10 w-max -translate-x-1/2 rounded-md border border-[var(--color-filete-fuerte)] bg-white px-3 py-2 text-[13px] shadow-sm"
        >
          <p className="cifra font-medium">
            {escribirEnEje(datos.barras[activa].desde, datos.metrica, 0)} —{" "}
            {escribirEnEje(datos.barras[activa].hasta, datos.metrica, 0)}
          </p>
          <p className="mt-0.5 text-[var(--color-tinta-suave)]">
            {datos.barras[activa].n}{" "}
            {datos.barras[activa].n === 1 ? "publicación" : "publicaciones"}
            {datos.n > 0 && (
              <span className="text-[var(--color-tinta-tenue)]">
                {" "}
                · {Math.round((datos.barras[activa].n / datos.n) * 100)}% del total
              </span>
            )}
          </p>
        </div>
      )}
    </div>
  );
}
