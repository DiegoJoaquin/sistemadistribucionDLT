"use client";

import { useId, useState } from "react";
import type { EvolucionSemanal } from "@/lib/dominio/analitica";
import { esPorcentaje, NOMBRE_METRICA } from "@/lib/dominio/analitica";
import { numero, numeroFino, porcentaje } from "@/lib/dominio/formato";
import { colorDe, EJE, GRILLA } from "@/lib/dominio/paleta";

/*
 * Medidas del dibujo. El alto incluye la banda del eje de abajo: si el
 * contenedor midiera solo el área de trazado, las etiquetas de las semanas
 * quedarían fuera y la tarjeta tendría su propio scroll vertical.
 */
const ANCHO = 900;
const ALTO = 300;
const MARGEN = { arriba: 16, derecha: 96, abajo: 34, izquierda: 60 };
const TRAZO_ANCHO = ANCHO - MARGEN.izquierda - MARGEN.derecha;
const TRAZO_ALTO = ALTO - MARGEN.arriba - MARGEN.abajo;

/** Redondea el tope a un número limpio, para que las marcas del eje se lean. */
function topeLimpio(max: number): number {
  if (max <= 0) return 1;
  const orden = 10 ** Math.floor(Math.log10(max));
  for (const paso of [1, 2, 2.5, 5, 10]) {
    const t = paso * orden;
    if (t >= max) return t;
  }
  return 10 * orden;
}

function etiquetaSemana(desde: string): string {
  const [, m, d] = desde.split("-").map(Number);
  const meses = ["ene", "feb", "mar", "abr", "may", "jun", "jul", "ago", "sep", "oct", "nov", "dic"];
  return `${d} ${meses[m - 1]}`;
}

function formatearValor(v: number | null, pct: boolean): string {
  if (v === null) return "—";
  return pct ? porcentaje(v) : v < 100 ? numeroFino(v) : numero(v);
}

/**
 * Evolución semanal: una línea por cuenta.
 *
 * Una semana sin publicaciones es un HUECO, no un cero (§9.4). Un cero dibuja
 * una caída a fondo que nunca ocurrió, que es la forma más fácil que tiene un
 * gráfico de mentir.
 *
 * Trae crosshair y tooltip porque un gráfico en pantalla que no responde al
 * puntero desperdicia la mitad de lo que puede decir. Pero el tooltip nunca es
 * la única vía: los valores están también en la tabla de abajo.
 */
export function Lineas({
  datos,
  colores,
  ocultas,
}: {
  datos: EvolucionSemanal;
  colores: Map<string, string>;
  /** Cuentas que el usuario apagó en la leyenda. */
  ocultas: Set<string>;
}) {
  const id = useId();
  const [activa, setActiva] = useState<number | null>(null);

  const visibles = datos.series.filter((s) => !ocultas.has(s.cuentaId));
  const pct = esPorcentaje(datos.metrica);

  const valores = visibles
    .flatMap((s) => s.puntos)
    .filter((v): v is number => v !== null);
  const tope = topeLimpio(valores.length > 0 ? Math.max(...valores) : 1);

  const n = datos.semanas.length;
  const x = (i: number) =>
    MARGEN.izquierda + (n <= 1 ? TRAZO_ANCHO / 2 : (i / (n - 1)) * TRAZO_ANCHO);
  const y = (v: number) => MARGEN.arriba + TRAZO_ALTO - (v / tope) * TRAZO_ALTO;

  /**
   * Cada tramo continuo va como su propio `path`.
   *
   * Es lo que deja el hueco visible: unir los puntos salteando los nulos
   * dibujaría una recta que cruza semanas sin datos como si hubiera medición.
   */
  const tramos = (puntos: (number | null)[]): string[] => {
    const salida: string[] = [];
    let actual: string[] = [];
    puntos.forEach((v, i) => {
      if (v === null) {
        if (actual.length > 1) salida.push(actual.join(" "));
        actual = [];
        return;
      }
      actual.push(`${actual.length === 0 ? "M" : "L"} ${x(i)} ${y(v)}`);
    });
    if (actual.length > 1) salida.push(actual.join(" "));
    return salida;
  };

  /** Los puntos sueltos (una semana con dato entre dos sin dato) igual se ven. */
  const sueltos = (puntos: (number | null)[]): number[] =>
    puntos.flatMap((v, i) =>
      v !== null && puntos[i - 1] == null && puntos[i + 1] == null ? [i] : [],
    );

  const marcas = [0, 0.25, 0.5, 0.75, 1].map((f) => tope * f);

  // Con muchas semanas no caben todas las etiquetas sin encimarse.
  const cadaCuantas = Math.max(1, Math.ceil(n / 12));

  return (
    <div className="relative">
      <svg
        viewBox={`0 0 ${ANCHO} ${ALTO}`}
        className="w-full"
        style={{ height: "auto" }}
        role="img"
        aria-label={`Evolución semanal de ${NOMBRE_METRICA[datos.metrica].toLowerCase()} por cuenta. Los valores están en la tabla que sigue.`}
        onMouseLeave={() => setActiva(null)}
      >
        {/* Grilla: hairline sólida, un paso sobre la superficie. */}
        {marcas.map((v) => (
          <g key={v}>
            <line
              x1={MARGEN.izquierda}
              x2={ANCHO - MARGEN.derecha}
              y1={y(v)}
              y2={y(v)}
              stroke={v === 0 ? EJE : GRILLA}
              strokeWidth={1}
            />
            <text
              x={MARGEN.izquierda - 8}
              y={y(v) + 4}
              textAnchor="end"
              className="fill-[var(--color-tinta-tenue)] text-[11px] tabular-nums"
            >
              {pct ? porcentaje(v, 0) : numero(v)}
            </text>
          </g>
        ))}

        {/* Semanas */}
        {datos.semanas.map((s, i) =>
          i % cadaCuantas === 0 || i === n - 1 ? (
            <text
              key={s.desde}
              x={x(i)}
              y={ALTO - 12}
              textAnchor="middle"
              className="fill-[var(--color-tinta-tenue)] text-[11px]"
            >
              {etiquetaSemana(s.desde)}
            </text>
          ) : null,
        )}

        {/* Crosshair de la semana bajo el puntero */}
        {activa !== null && (
          <line
            x1={x(activa)}
            x2={x(activa)}
            y1={MARGEN.arriba}
            y2={MARGEN.arriba + TRAZO_ALTO}
            stroke={EJE}
            strokeWidth={1}
          />
        )}

        {visibles.map((s) => {
          const color = colorDe(colores, s.cuentaId);
          const ultimo = [...s.puntos].reduce<number | null>(
            (acc, v, i) => (v !== null ? i : acc),
            null,
          );
          return (
            <g key={s.cuentaId}>
              {tramos(s.puntos).map((d, i) => (
                <path
                  key={`${id}-${s.cuentaId}-${i}`}
                  d={d}
                  fill="none"
                  stroke={color}
                  strokeWidth={2}
                  strokeLinecap="round"
                  strokeLinejoin="round"
                />
              ))}

              {sueltos(s.puntos).map((i) => (
                <circle
                  key={`s-${i}`}
                  cx={x(i)}
                  cy={y(s.puntos[i]!)}
                  r={4}
                  fill={color}
                  stroke="#ffffff"
                  strokeWidth={2}
                />
              ))}

              {/* Marcador y etiqueta directa al final de cada línea. */}
              {ultimo !== null && (
                <>
                  <circle
                    cx={x(ultimo)}
                    cy={y(s.puntos[ultimo]!)}
                    r={4}
                    fill={color}
                    stroke="#ffffff"
                    strokeWidth={2}
                  />
                  <text
                    x={x(ultimo) + 10}
                    y={y(s.puntos[ultimo]!) + 4}
                    className="fill-[var(--color-tinta-suave)] text-[11px] tabular-nums"
                  >
                    {formatearValor(s.puntos[ultimo], pct)}
                  </text>
                </>
              )}

              {/* El punto de la semana activa, resaltado. */}
              {activa !== null && s.puntos[activa] !== null && (
                <circle
                  cx={x(activa)}
                  cy={y(s.puntos[activa]!)}
                  r={5}
                  fill={color}
                  stroke="#ffffff"
                  strokeWidth={2}
                />
              )}
            </g>
          );
        })}

        {/*
          Zonas de contacto anchas: el objetivo no es el punto de 8px sino toda
          la franja de la semana, para que no haya que apuntar al milímetro.
        */}
        {datos.semanas.map((s, i) => (
          <rect
            key={`z-${s.desde}`}
            x={x(i) - (n <= 1 ? TRAZO_ANCHO / 2 : TRAZO_ANCHO / (n - 1) / 2)}
            y={MARGEN.arriba}
            width={n <= 1 ? TRAZO_ANCHO : TRAZO_ANCHO / (n - 1)}
            height={TRAZO_ALTO}
            fill="transparent"
            onMouseEnter={() => setActiva(i)}
          />
        ))}
      </svg>

      {activa !== null && (
        <div
          role="status"
          className="pointer-events-none absolute left-1/2 top-2 z-10 w-max max-w-xs -translate-x-1/2 rounded-md border border-[var(--color-filete-fuerte)] bg-white px-3 py-2 text-[13px] shadow-sm"
        >
          <p className="font-medium">
            Semana del {etiquetaSemana(datos.semanas[activa].desde)}
          </p>
          <ul className="mt-1 space-y-0.5">
            {visibles.map((s) => (
              <li key={s.cuentaId} className="flex items-center gap-2">
                <span
                  aria-hidden
                  className="inline-block size-2 shrink-0 rounded-full"
                  style={{ backgroundColor: colorDe(colores, s.cuentaId) }}
                />
                <span className="text-[var(--color-tinta-suave)]">{s.nombre}</span>
                <span className="ml-auto cifra font-medium">
                  {formatearValor(s.puntos[activa], pct)}
                </span>
                <span className="text-[11px] text-[var(--color-tinta-tenue)]">
                  {s.publicaciones[activa]} pub.
                </span>
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  );
}
