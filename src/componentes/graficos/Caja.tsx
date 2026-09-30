"use client";

import { useState } from "react";
import {
  type Cajas,
  escribirEnEje,
  MINIMO_CAJA,
  NOMBRE_EJE,
} from "@/lib/dominio/rendimiento";
import { APAGADO, BARRA, EJE, GRILLA } from "@/lib/dominio/paleta";

const ANCHO = 860;
const MARGEN = { arriba: 16, derecha: 96, abajo: 44, izquierda: 150 };
const ALTO_FILA = 56;
const TRAZO_ANCHO = ANCHO - MARGEN.izquierda - MARGEN.derecha;

/**
 * Una caja por grupo: mediana, cuartiles y bigotes.
 *
 * Es el gráfico que contesta "¿qué tipo de post rinde mejor?" sin mentir. Una
 * barra con el promedio de cada grupo también lo contestaría, pero el promedio
 * de estos datos lo arrastran los virales: un grupo con nueve publicaciones
 * flojas y una que explotó da el mismo promedio que un grupo de diez buenas, y
 * no son lo mismo. Acá la caja es la MITAD del medio, la línea gruesa es la
 * mediana y los virales aparecen como los puntos sueltos que son.
 *
 * Un solo color para todas: los grupos ya están separados en el eje, y pintar
 * cada uno de un color codificaría dos veces el mismo dato.
 */
export function Caja({ datos }: { datos: Cajas }) {
  const [activa, setActiva] = useState<string | null>(null);

  const alto = MARGEN.arriba + datos.cajas.length * ALTO_FILA + MARGEN.abajo;
  const x = (v: number) => MARGEN.izquierda + datos.escala.posicion(v) * TRAZO_ANCHO;
  const yFila = (i: number) => MARGEN.arriba + i * ALTO_FILA + ALTO_FILA / 2;

  const escribir = (v: number) => escribirEnEje(v, datos.metrica);

  return (
    <div className="relative">
      <svg
        viewBox={`0 0 ${ANCHO} ${alto}`}
        className="w-full"
        style={{ height: "auto" }}
        role="img"
        aria-label={`Distribución de ${NOMBRE_EJE[datos.metrica].toLowerCase()} por grupo: mediana, cuartiles y valores atípicos. Los números están en la tabla que sigue.`}
        onMouseLeave={() => setActiva(null)}
      >
        {/* Grilla vertical, con las marcas de la métrica. */}
        {datos.escala.marcas.map((v) => (
          <g key={v}>
            <line
              x1={x(v)}
              x2={x(v)}
              y1={MARGEN.arriba}
              y2={alto - MARGEN.abajo}
              stroke={v === datos.escala.min && !datos.escala.log ? EJE : GRILLA}
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

        {datos.cajas.map((c, i) => {
          const y = yFila(i);
          const resaltada = activa === c.clave;

          return (
            <g key={c.clave}>
              {/* El nombre del grupo, con sobre cuántas publicaciones va. */}
              <text
                x={MARGEN.izquierda - 10}
                y={y - 2}
                textAnchor="end"
                className="fill-[var(--color-tinta)] text-[12px] font-medium"
              >
                {c.etiqueta}
              </text>
              <text
                x={MARGEN.izquierda - 10}
                y={y + 12}
                textAnchor="end"
                className="fill-[var(--color-tinta-tenue)] text-[10px]"
              >
                {c.n} {c.n === 1 ? "publicación" : "publicaciones"}
              </text>

              {/*
                Un grupo con muy pocas publicaciones no se dibuja como caja: los
                cuartiles de cuatro datos no describen nada, cada dato mueve la
                caja entera. Se muestran los valores tal cual.
              */}
              {c.pocas ? (
                <>
                  {c.valores.map((v, j) => (
                    <circle
                      key={j}
                      cx={x(v)}
                      cy={y}
                      r={4}
                      fill={BARRA}
                      fillOpacity={0.7}
                      stroke="#ffffff"
                      strokeWidth={1}
                    />
                  ))}
                  <text
                    x={x(c.valores[c.valores.length - 1]) + 12}
                    y={y + 4}
                    className="fill-[var(--color-tinta-tenue)] text-[10px]"
                  >
                    menos de {MINIMO_CAJA}: sin caja
                  </text>
                </>
              ) : (
                <>
                  {/* Bigotes: hasta el dato real más lejano dentro de 1,5 × RIC. */}
                  <line
                    x1={x(c.bigoteBajo)}
                    x2={x(c.bigoteAlto)}
                    y1={y}
                    y2={y}
                    stroke={EJE}
                    strokeWidth={1}
                  />
                  {[c.bigoteBajo, c.bigoteAlto].map((v, j) => (
                    <line
                      key={j}
                      x1={x(v)}
                      x2={x(v)}
                      y1={y - 7}
                      y2={y + 7}
                      stroke={EJE}
                      strokeWidth={1}
                    />
                  ))}

                  {/* La caja: la mitad del medio de las publicaciones. */}
                  <rect
                    x={x(c.q1)}
                    y={y - 13}
                    width={Math.max(1, x(c.q3) - x(c.q1))}
                    height={26}
                    fill={BARRA}
                    fillOpacity={resaltada ? 0.32 : 0.18}
                    stroke={BARRA}
                    strokeWidth={1}
                    rx={2}
                  />

                  {/* La mediana, que es lo que de verdad se compara entre filas. */}
                  <line
                    x1={x(c.mediana)}
                    x2={x(c.mediana)}
                    y1={y - 13}
                    y2={y + 13}
                    stroke={BARRA}
                    strokeWidth={3}
                  />

                  {/* Las virales, una por una. */}
                  {c.atipicos.map((d) => (
                    <circle
                      key={d.punto.id}
                      cx={x(d.x)}
                      cy={y}
                      r={3.5}
                      fill={APAGADO}
                      fillOpacity={0.8}
                      stroke="#ffffff"
                      strokeWidth={0.75}
                    />
                  ))}

                  {/* Etiqueta directa: la mediana del grupo, escrita. */}
                  <text
                    x={ANCHO - MARGEN.derecha + 10}
                    y={y - 1}
                    className="fill-[var(--color-tinta)] text-[12px] font-medium tabular-nums"
                  >
                    {escribir(c.mediana)}
                  </text>
                  <text
                    x={ANCHO - MARGEN.derecha + 10}
                    y={y + 12}
                    className="fill-[var(--color-tinta-tenue)] text-[10px]"
                  >
                    mediana
                  </text>
                </>
              )}

              {/* Franja de contacto de toda la fila, para no apuntar fino. */}
              <rect
                x={MARGEN.izquierda}
                y={MARGEN.arriba + i * ALTO_FILA}
                width={TRAZO_ANCHO}
                height={ALTO_FILA}
                fill="transparent"
                onMouseEnter={() => setActiva(c.clave)}
              />
            </g>
          );
        })}

        <text
          x={MARGEN.izquierda + TRAZO_ANCHO / 2}
          y={alto - 6}
          textAnchor="middle"
          className="fill-[var(--color-tinta-suave)] text-[12px] font-medium"
        >
          {NOMBRE_EJE[datos.metrica]}
          {datos.escala.log ? " (escala logarítmica)" : ""}
        </text>
      </svg>

      {activa !== null &&
        (() => {
          const c = datos.cajas.find((x) => x.clave === activa);
          if (!c || c.pocas) return null;
          return (
            <div
              role="status"
              className="pointer-events-none absolute left-1/2 top-2 z-10 w-max -translate-x-1/2 rounded-md border border-[var(--color-filete-fuerte)] bg-white px-3 py-2 text-[13px] shadow-sm"
            >
              <p className="font-medium">{c.etiqueta}</p>
              <ul className="mt-1 space-y-0.5 text-[12px]">
                <li className="flex gap-4">
                  <span className="text-[var(--color-tinta-suave)]">
                    La cuarta parte peor llega a
                  </span>
                  <span className="ml-auto cifra">{escribir(c.q1)}</span>
                </li>
                <li className="flex gap-4">
                  <span className="text-[var(--color-tinta-suave)]">
                    La del medio (mediana)
                  </span>
                  <span className="ml-auto cifra font-medium">{escribir(c.mediana)}</span>
                </li>
                <li className="flex gap-4">
                  <span className="text-[var(--color-tinta-suave)]">
                    La cuarta parte mejor pasa de
                  </span>
                  <span className="ml-auto cifra">{escribir(c.q3)}</span>
                </li>
                {c.atipicos.length > 0 && (
                  <li className="flex gap-4">
                    <span className="text-[var(--color-tinta-suave)]">
                      Se despegan del resto
                    </span>
                    <span className="ml-auto cifra">{c.atipicos.length}</span>
                  </li>
                )}
              </ul>
            </div>
          );
        })()}
    </div>
  );
}
