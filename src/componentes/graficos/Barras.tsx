"use client";

import { numero, numeroFino, porcentaje } from "@/lib/dominio/formato";
import { BARRA } from "@/lib/dominio/paleta";

export interface Barra {
  clave: string;
  etiqueta: string;
  valor: number | null;
  /** Debajo del nombre: publicaciones, denominador, lo que aclare la barra. */
  detalle?: string;
  /** Marca la barra como no comparable con las otras (§9.6). */
  aviso?: string;
}

function formatear(v: number | null, pct: boolean): string {
  if (v === null) return "—";
  return pct ? porcentaje(v) : v < 100 ? numeroFino(v) : numero(v);
}

/**
 * Barras horizontales para comparar magnitudes.
 *
 * Un color para todas y no un degradado por tamaño: las cuentas y los formatos
 * son categorías sin orden natural, y pintar la más alta más oscura codifica
 * dos veces lo mismo — el largo de la barra ya lo dice.
 *
 * Horizontal y no vertical porque los nombres son largos ("Instagram DBF",
 * "DiegoAT TikTok") y en columnas habría que girarlos.
 */
export function Barras({
  barras,
  porcentual = false,
  vacio = "Sin datos en el período.",
}: {
  barras: Barra[];
  porcentual?: boolean;
  vacio?: string;
}) {
  if (barras.length === 0) {
    return (
      <p className="px-4 py-6 text-sm text-[var(--color-tinta-suave)]">{vacio}</p>
    );
  }

  const max = Math.max(...barras.map((b) => b.valor ?? 0), 0);

  return (
    <ul className="space-y-2.5">
      {barras.map((b) => {
        // El ancho es proporcional al valor; sin valor, no hay barra.
        const ancho = b.valor === null || max <= 0 ? 0 : (b.valor / max) * 100;

        return (
          <li key={b.clave}>
            <div className="flex items-baseline justify-between gap-3">
              <span className="truncate text-[13px] font-medium">
                {b.etiqueta}
                {b.detalle && (
                  <span className="ml-1.5 font-normal text-[11px] text-[var(--color-tinta-tenue)]">
                    {b.detalle}
                  </span>
                )}
              </span>
              {/* Etiqueta directa: el valor nunca queda solo en un tooltip. */}
              <span className="cifra shrink-0 text-[13px] font-medium">
                {formatear(b.valor, porcentual)}
              </span>
            </div>

            <div className="mt-1 h-2.5 w-full overflow-hidden rounded-sm bg-[var(--color-realce)]">
              <div
                className="h-full rounded-r-sm"
                style={{ width: `${ancho}%`, backgroundColor: BARRA }}
              />
            </div>

            {b.aviso && (
              <p className="mt-0.5 text-[11px] text-[var(--color-tinta-tenue)]">
                {b.aviso}
              </p>
            )}
          </li>
        );
      })}
    </ul>
  );
}
