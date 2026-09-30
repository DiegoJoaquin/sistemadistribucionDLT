"use client";

import { useState } from "react";
import {
  escribirEnEje,
  NOMBRE_EJE,
  type Telarana as DatosTelarana,
} from "@/lib/dominio/rendimiento";
import { porcentaje } from "@/lib/dominio/formato";
import { EJE, GRILLA } from "@/lib/dominio/paleta";

const ANCHO = 860;
const ALTO = 520;
const CENTRO = { x: 400, y: 262 };
const RADIO = 190;

/** Cómo se escribe una razón contra la línea: 1 → "100%". */
function razonTexto(v: number): string {
  return porcentaje(v, v < 0.1 ? 1 : 0);
}

/**
 * La telaraña: un radio por métrica, y el valor es cuánto se despegó la
 * publicación de su línea de comparación.
 *
 * Lo que hace posible el gráfico es que los radios NO llevan el número crudo.
 * Visualizaciones (decenas de miles) y engagement (0,05) no caben en la misma
 * figura: una taparía a la otra. Lo que se dibuja es la RAZÓN contra la línea,
 * que no tiene unidades, así que los seis radios hablan el mismo idioma.
 *
 * El anillo del 100% es la línea misma, y va más marcado que los demás: es el
 * único que significa algo. Dentro del anillo, la publicación rindió por debajo
 * de su serie, de su cuenta o del período; fuera, por encima. Los números
 * crudos están en la tabla de abajo, porque un porcentaje sin su base no se
 * puede auditar.
 */
export function Telarana({ datos }: { datos: DatosTelarana }) {
  const [activo, setActivo] = useState<number | null>(null);

  const n = datos.ejes.length;
  // El primer radio apunta hacia arriba, y de ahí en el sentido del reloj.
  const angulo = (i: number) => -Math.PI / 2 + (i * 2 * Math.PI) / n;
  const punto = (i: number, razon: number) => {
    const r = (Math.min(razon, datos.tope) / datos.tope) * RADIO;
    return [CENTRO.x + r * Math.cos(angulo(i)), CENTRO.y + r * Math.sin(angulo(i))] as const;
  };

  const anilloDe = (razon: number) =>
    datos.ejes
      .map((_, i) => {
        const [x, y] = punto(i, razon);
        return `${i === 0 ? "M" : "L"} ${x.toFixed(1)} ${y.toFixed(1)}`;
      })
      .join(" ") + " Z";

  if (n === 0) return null;

  return (
    <div className="relative">
      <svg
        viewBox={`0 0 ${ANCHO} ${ALTO}`}
        className="w-full"
        style={{ height: "auto" }}
        role="img"
        aria-label={`Telaraña de ${datos.poligonos.length} ${datos.poligonos.length === 1 ? "publicación" : "publicaciones"} contra ${datos.ejes.length} métricas. Los números están en la tabla que sigue.`}
      >
        {/* Los anillos de la escala, y sus rótulos sobre el radio de arriba. */}
        {datos.marcas.map((m) => (
          <g key={m}>
            <path
              d={anilloDe(m)}
              fill="none"
              stroke={GRILLA}
              strokeWidth={1}
            />
            <text
              x={CENTRO.x + 5}
              y={punto(0, m)[1] + 4}
              className="fill-[var(--color-tinta-tenue)] text-[10px] tabular-nums"
            >
              {razonTexto(m)}
            </text>
          </g>
        ))}

        {/*
          El anillo de la línea. Es el único que significa algo —"le fue igual
          al promedio"— así que va más marcado que los de la escala.
        */}
        <path d={anilloDe(1)} fill="none" stroke={EJE} strokeWidth={2} />

        {/* Un rayo por métrica, hasta el borde. */}
        {datos.ejes.map((eje, i) => {
          const [x, y] = punto(i, datos.tope);
          const fuera = 1.13;
          const ex = CENTRO.x + (x - CENTRO.x) * fuera;
          const ey = CENTRO.y + (y - CENTRO.y) * fuera;
          // Las etiquetas de los costados se alinean hacia afuera para no
          // meterse dentro de la figura.
          const dx = Math.cos(angulo(i));
          const anclaje = Math.abs(dx) < 0.25 ? "middle" : dx > 0 ? "start" : "end";

          return (
            <g key={eje}>
              <line
                x1={CENTRO.x}
                y1={CENTRO.y}
                x2={x}
                y2={y}
                stroke={GRILLA}
                strokeWidth={1}
              />
              <text
                x={ex}
                y={ey + 4}
                textAnchor={anclaje}
                className="fill-[var(--color-tinta-suave)] text-[11px] font-medium"
              >
                {NOMBRE_EJE[eje]}
              </text>
            </g>
          );
        })}

        {/* Las figuras. El relleno es tenue para que se vean las de atrás. */}
        {datos.poligonos.map((p, j) => {
          const d =
            p.radios
              .map((r, i) => {
                const [x, y] = punto(i, r.razon);
                return `${i === 0 ? "M" : "L"} ${x.toFixed(1)} ${y.toFixed(1)}`;
              })
              .join(" ") + " Z";
          const encendida = activo === null || activo === j;

          return (
            <g key={p.punto.id} opacity={encendida ? 1 : 0.25}>
              <path d={d} fill={p.color} fillOpacity={0.14} stroke={p.color} strokeWidth={2} />
              {p.radios.map((r, i) => {
                const [x, y] = punto(i, r.razon);
                return (
                  <circle
                    key={r.eje}
                    cx={x}
                    cy={y}
                    r={3.5}
                    fill={p.color}
                    stroke="#ffffff"
                    strokeWidth={1.5}
                  />
                );
              })}
            </g>
          );
        })}
      </svg>

      {/*
        La leyenda va acá abajo y no en el panel: identifica publicaciones, no
        grupos, y dice contra qué línea se comparó cada una — sin eso, un 140%
        no se sabe si es contra la serie o contra toda la cuenta.
      */}
      <ul className="mt-1 flex flex-wrap gap-x-5 gap-y-1.5 px-2 pb-1">
        {datos.poligonos.map((p, j) => (
          <li key={p.punto.id}>
            <button
              type="button"
              onMouseEnter={() => setActivo(j)}
              onMouseLeave={() => setActivo(null)}
              onFocus={() => setActivo(j)}
              onBlur={() => setActivo(null)}
              className="flex items-start gap-1.5 text-left text-[12px]"
            >
              <span
                aria-hidden
                className="mt-1 inline-block size-2.5 shrink-0 rounded-full"
                style={{ backgroundColor: p.color }}
              />
              <span>
                <span className="block max-w-xs truncate font-medium">
                  {p.punto.titulo ?? "Sin título"}
                </span>
                <span className="block text-[11px] text-[var(--color-tinta-tenue)]">
                  contra {p.referencia.etiqueta} · {p.referencia.n}{" "}
                  {p.referencia.n === 1 ? "publicación" : "publicaciones"}
                </span>
              </span>
            </button>
          </li>
        ))}
      </ul>
    </div>
  );
}

/**
 * Los números crudos detrás de la figura.
 *
 * Un porcentaje sin su base no se puede auditar: "140%" no dice si fueron 700
 * me gusta contra 500 o 7 contra 5, y la diferencia importa. Además es la vía
 * accesible, porque la figura sola no se puede leer sin ver.
 */
export function TablaTelarana({ datos }: { datos: DatosTelarana }) {
  return (
    <div className="scroll-x">
      <table className="w-full border-collapse text-left">
        <thead className="border-b border-[var(--color-filete)] bg-[var(--color-realce)]/60">
          <tr>
            <th className="th">Métrica</th>
            {datos.poligonos.map((p) => (
              <th key={p.punto.id} className="th text-right" colSpan={3}>
                <span className="flex items-center justify-end gap-1.5">
                  <span
                    aria-hidden
                    className="inline-block size-2 rounded-full"
                    style={{ backgroundColor: p.color }}
                  />
                  {(p.punto.titulo ?? "Sin título").slice(0, 34)}
                </span>
              </th>
            ))}
          </tr>
          <tr>
            <th className="th" />
            {datos.poligonos.flatMap((p) => [
              <th key={`${p.punto.id}-v`} className="th text-right">
                Tuvo
              </th>,
              <th key={`${p.punto.id}-b`} className="th text-right">
                Su línea
              </th>,
              <th key={`${p.punto.id}-r`} className="th text-right">
                Contra la línea
              </th>,
            ])}
          </tr>
        </thead>
        <tbody>
          {datos.ejes.map((eje, i) => (
            <tr key={eje} className="border-b border-[var(--color-filete)] last:border-0">
              <td className="td font-medium">{NOMBRE_EJE[eje]}</td>
              {datos.poligonos.flatMap((p) => {
                const r = p.radios[i];
                return [
                  <td key={`${p.punto.id}-v`} className="td cifra text-right">
                    {escribirEnEje(r.valor, eje)}
                  </td>,
                  <td
                    key={`${p.punto.id}-b`}
                    className="td cifra text-right text-[var(--color-tinta-tenue)]"
                  >
                    {escribirEnEje(r.base, eje)}
                  </td>,
                  <td
                    key={`${p.punto.id}-r`}
                    className="td cifra text-right font-medium"
                    style={{ color: r.razon >= 1 ? undefined : "var(--color-tinta-suave)" }}
                  >
                    {razonTexto(r.razon)}
                  </td>,
                ];
              })}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
