"use client";

import { useRef, useState } from "react";
import {
  type Dispersion as DatosDispersion,
  escribirEnEje,
  etiquetaDeGrupo,
  NOMBRE_EJE,
  type PuntoDibujado,
} from "@/lib/dominio/rendimiento";
import { fechaCorta } from "@/lib/dominio/formato";
import { APAGADO, EJE, GRILLA } from "@/lib/dominio/paleta";

/*
 * Medidas del dibujo. Más alto que las líneas y casi cuadrado: en una nube de
 * puntos las dos direcciones importan igual, y un panel apaisado achata la
 * relación entre los ejes y la hace parecer más plana de lo que es.
 */
const ANCHO = 860;
const ALTO = 560;
const MARGEN = { arriba: 18, derecha: 22, abajo: 56, izquierda: 74 };
const TRAZO_ANCHO = ANCHO - MARGEN.izquierda - MARGEN.derecha;
const TRAZO_ALTO = ALTO - MARGEN.arriba - MARGEN.abajo;

/** Radio de contacto: a más de esto del puntero, no se resalta nada. */
const RADIO_CONTACTO = 26;

/**
 * La nube de puntos: una publicación, un punto.
 *
 * Las líneas de la mediana son la mitad de la herramienta. Sin ellas hay que
 * estimar a ojo dónde está el medio de cada eje, y con ellas el panel queda
 * partido en cuatro cuadrantes que se leen directo: arriba a la derecha son las
 * publicaciones que rindieron por encima de la mediana en las dos cosas a la
 * vez, que es justamente la pregunta.
 *
 * El puntero resalta el punto más cercano en vez de exigir apuntarle: con
 * trescientos discos de ocho píxeles medio superpuestos, pedir precisión de un
 * píxel haría el gráfico inútil. Y el tooltip nunca es la única vía — los
 * mismos valores están en la tabla de abajo.
 */
export function Dispersion({ datos }: { datos: DatosDispersion }) {
  const svg = useRef<SVGSVGElement>(null);
  const [activo, setActivo] = useState<PuntoDibujado | null>(null);
  const [donde, setDonde] = useState<{ x: number; y: number }>({ x: 0, y: 0 });

  const x = (v: number) => MARGEN.izquierda + datos.escalaX.posicion(v) * TRAZO_ANCHO;
  const y = (v: number) => MARGEN.arriba + TRAZO_ALTO - datos.escalaY.posicion(v) * TRAZO_ALTO;

  /**
   * El punto más cercano al puntero, buscado a fuerza bruta.
   *
   * Tres mil distancias por movimiento del mouse no se notan, y una estructura
   * espacial acá sería complejidad sin beneficio medible.
   */
  function buscar(evento: React.MouseEvent<SVGSVGElement>) {
    const caja = svg.current?.getBoundingClientRect();
    if (!caja || caja.width === 0) return;

    // De píxeles de pantalla a las unidades del viewBox.
    const escala = ANCHO / caja.width;
    const px = (evento.clientX - caja.left) * escala;
    const py = (evento.clientY - caja.top) * escala;

    let cerca: PuntoDibujado | null = null;
    let mejor = RADIO_CONTACTO * RADIO_CONTACTO;
    for (const p of datos.puntos) {
      const dx = x(p.x) - px;
      const dy = y(p.y) - py;
      const d = dx * dx + dy * dy;
      if (d < mejor) {
        mejor = d;
        cerca = p;
      }
    }

    setActivo(cerca);
    if (cerca) setDonde({ x: x(cerca.x) / ANCHO, y: y(cerca.y) / ALTO });
  }

  const hayPuntos = datos.puntos.length > 0;

  return (
    <div className="relative">
      <svg
        ref={svg}
        viewBox={`0 0 ${ANCHO} ${ALTO}`}
        className="w-full"
        style={{ height: "auto" }}
        role="img"
        aria-label={`Dispersión de ${datos.puntos.length} publicaciones: ${NOMBRE_EJE[datos.ejeX]} en el eje horizontal y ${NOMBRE_EJE[datos.ejeY]} en el vertical. Los valores están en la tabla que sigue.`}
        onMouseMove={buscar}
        onMouseLeave={() => setActivo(null)}
      >
        {/* Grilla horizontal, con las marcas del eje Y. */}
        {datos.escalaY.marcas.map((v) => (
          <g key={`y-${v}`}>
            <line
              x1={MARGEN.izquierda}
              x2={ANCHO - MARGEN.derecha}
              y1={y(v)}
              y2={y(v)}
              stroke={v === datos.escalaY.min && !datos.escalaY.log ? EJE : GRILLA}
              strokeWidth={1}
            />
            <text
              x={MARGEN.izquierda - 8}
              y={y(v) + 4}
              textAnchor="end"
              className="fill-[var(--color-tinta-tenue)] text-[11px] tabular-nums"
            >
              {escribirEnEje(v, datos.ejeY, 0)}
            </text>
          </g>
        ))}

        {/* Grilla vertical, con las marcas del eje X. */}
        {datos.escalaX.marcas.map((v) => (
          <g key={`x-${v}`}>
            <line
              x1={x(v)}
              x2={x(v)}
              y1={MARGEN.arriba}
              y2={MARGEN.arriba + TRAZO_ALTO}
              stroke={v === datos.escalaX.min && !datos.escalaX.log ? EJE : GRILLA}
              strokeWidth={1}
            />
            <text
              x={x(v)}
              y={ALTO - MARGEN.abajo + 18}
              textAnchor="middle"
              className="fill-[var(--color-tinta-tenue)] text-[11px] tabular-nums"
            >
              {escribirEnEje(v, datos.ejeX, 0)}
            </text>
          </g>
        ))}

        {/*
          Las medianas. Sólidas y un paso más oscuras que la grilla: son una
          referencia, no un dato, pero tienen que leerse sin buscarlas.
        */}
        {hayPuntos && datos.medianaX !== null && (
          <>
            <line
              x1={x(datos.medianaX)}
              x2={x(datos.medianaX)}
              y1={MARGEN.arriba}
              y2={MARGEN.arriba + TRAZO_ALTO}
              stroke={EJE}
              strokeWidth={1.5}
            />
            <text
              x={x(datos.medianaX) + 5}
              y={MARGEN.arriba + 11}
              className="fill-[var(--color-tinta-tenue)] text-[10px]"
            >
              mediana
            </text>
          </>
        )}
        {hayPuntos && datos.medianaY !== null && (
          <line
            x1={MARGEN.izquierda}
            x2={ANCHO - MARGEN.derecha}
            y1={y(datos.medianaY)}
            y2={y(datos.medianaY)}
            stroke={EJE}
            strokeWidth={1.5}
          />
        )}

        {/*
          Los puntos. Semitransparentes porque se superponen: donde hay muchos
          juntos el color se acumula y eso mismo informa. El halo blanco los
          separa lo suficiente para contarlos cuando son pocos.
        */}
        {datos.puntos.map((p) => (
          <circle
            key={p.punto.id}
            cx={x(p.x)}
            cy={y(p.y)}
            r={4}
            fill={p.color ?? APAGADO}
            fillOpacity={0.62}
            stroke="#ffffff"
            strokeWidth={0.75}
            strokeOpacity={0.85}
          />
        ))}

        {/* El más cercano al puntero, opaco y más grande. */}
        {activo && (
          <circle
            cx={x(activo.x)}
            cy={y(activo.y)}
            r={6.5}
            fill={activo.color ?? APAGADO}
            stroke="#ffffff"
            strokeWidth={2}
          />
        )}

        {/* Títulos de los ejes: sin ellos el gráfico no dice qué mide. */}
        <text
          x={MARGEN.izquierda + TRAZO_ANCHO / 2}
          y={ALTO - 8}
          textAnchor="middle"
          className="fill-[var(--color-tinta-suave)] text-[12px] font-medium"
        >
          {NOMBRE_EJE[datos.ejeX]}
          {datos.escalaX.log ? " (escala logarítmica)" : ""}
        </text>
        <text
          transform={`rotate(-90 14 ${MARGEN.arriba + TRAZO_ALTO / 2})`}
          x={14}
          y={MARGEN.arriba + TRAZO_ALTO / 2}
          textAnchor="middle"
          className="fill-[var(--color-tinta-suave)] text-[12px] font-medium"
        >
          {NOMBRE_EJE[datos.ejeY]}
          {datos.escalaY.log ? " (escala logarítmica)" : ""}
        </text>
      </svg>

      {activo && (
        <div
          role="status"
          className="pointer-events-none absolute z-10 w-max max-w-xs rounded-md border border-[var(--color-filete-fuerte)] bg-white px-3 py-2 text-[13px] shadow-sm"
          style={{
            // Del lado que quede espacio, para que no se salga de la tarjeta.
            left: donde.x > 0.6 ? undefined : `${donde.x * 100}%`,
            right: donde.x > 0.6 ? `${(1 - donde.x) * 100}%` : undefined,
            top: donde.y > 0.6 ? undefined : `${donde.y * 100 + 4}%`,
            bottom: donde.y > 0.6 ? `${(1 - donde.y) * 100 + 4}%` : undefined,
          }}
        >
          <p className="font-medium leading-snug">
            {activo.punto.titulo ?? "Sin título"}
          </p>
          <p className="mt-0.5 text-[11px] text-[var(--color-tinta-tenue)]">
            {activo.punto.cuenta} · {fechaCorta(activo.punto.fecha)}
            {activo.punto.hashtag ? ` · ${activo.punto.hashtag}` : ""}
          </p>
          <ul className="mt-1.5 space-y-0.5">
            <li className="flex gap-3">
              <span className="text-[var(--color-tinta-suave)]">
                {NOMBRE_EJE[datos.ejeX]}
              </span>
              <span className="ml-auto cifra font-medium">
                {escribirEnEje(activo.x, datos.ejeX)}
              </span>
            </li>
            <li className="flex gap-3">
              <span className="text-[var(--color-tinta-suave)]">
                {NOMBRE_EJE[datos.ejeY]}
              </span>
              <span className="ml-auto cifra font-medium">
                {escribirEnEje(activo.y, datos.ejeY)}
              </span>
            </li>
          </ul>
          <p className="mt-1.5 flex items-center gap-1.5 text-[11px]">
            <span
              aria-hidden
              className="inline-block size-2 shrink-0 rounded-full"
              style={{ backgroundColor: activo.color ?? APAGADO }}
            />
            <span className="text-[var(--color-tinta-tenue)]">
              {etiquetaDeGrupo(activo.grupo, datos.agrupacion)}
            </span>
          </p>
        </div>
      )}
    </div>
  );
}
