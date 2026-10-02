"use client";

import { useMemo, useState } from "react";
import {
  candidatas,
  type Eje,
  escribirEnEje,
  etiquetaDeGrupo,
  MAXIMO_POLIGONOS,
  NOMBRE_EJE,
  type PublicacionPunto,
  seriesDisponibles,
  SIN_CLASIFICAR,
  valorEnEje,
} from "@/lib/dominio/rendimiento";
import { fechaCorta } from "@/lib/dominio/formato";
import { SERIES } from "@/lib/dominio/paleta";

/**
 * Cuántas filas se dibujan de la lista.
 *
 * El filtro ya acotó el conjunto; esto es solo para no meter tres mil botones
 * en el DOM. Cuando hay más, se dice cuántas quedaron y cómo llegar a ellas.
 */
const FILAS_VISIBLES = 60;

/**
 * Elegir hasta tres publicaciones entre las miles del período.
 *
 * Antes eran tres menús desplegables con un tope de trescientas opciones cada
 * uno, ordenadas por una métrica. Eso no se puede recorrer: para encontrar una
 * publicación de una serie concreta había que bajar a ojo por una lista de
 * títulos, y las que no entraban en las trescientas primeras eran
 * inalcanzables.
 *
 * Ahora hay tres formas de llegar, y se combinan:
 *
 *  - las series del período a la vista, con cuántas publicaciones tiene cada
 *    una — que además responde "¿qué hashtags hay?", que no se podía saber;
 *  - un buscador que mira título, hashtag, cuenta y fecha;
 *  - la lista, ordenada por la métrica, para cuando lo que se busca es
 *    "la que mejor le fue".
 *
 * Las elegidas van arriba y con su color, el mismo que tendrán en el gráfico:
 * así se sabe qué figura es cuál antes de mirar la leyenda.
 */
export function SelectorPublicaciones({
  puntos,
  metrica,
  elegidasIds,
  alAlternar,
  alLimpiar,
}: {
  puntos: PublicacionPunto[];
  metrica: Eje;
  /** En orden: el primero lleva el primer color. */
  elegidasIds: string[];
  alAlternar: (id: string) => void;
  alLimpiar: () => void;
}) {
  const [consulta, setConsulta] = useState("");
  const [series, setSeries] = useState<Set<string>>(new Set());

  const disponibles = useMemo(() => seriesDisponibles(puntos), [puntos]);

  const lista = useMemo(
    () => candidatas(puntos, { metrica, consulta, series }),
    [puntos, metrica, consulta, series],
  );

  const porId = useMemo(() => new Map(puntos.map((p) => [p.id, p])), [puntos]);
  const elegidas = elegidasIds.flatMap((id) => {
    const p = porId.get(id);
    return p ? [p] : [];
  });

  const lleno = elegidas.length >= MAXIMO_POLIGONOS;

  const alternarSerie = (clave: string) =>
    setSeries((previas) => {
      const nuevas = new Set(previas);
      if (nuevas.has(clave)) nuevas.delete(clave);
      else nuevas.add(clave);
      return nuevas;
    });

  return (
    <div className="tarjeta space-y-3 p-3">
      {/* El buscador primero: es la vía más rápida cuando ya se sabe qué se busca. */}
      <div className="flex flex-wrap items-end gap-3">
        <div className="min-w-0 flex-1 space-y-1" style={{ minWidth: "18rem" }}>
          <label className="etiqueta" htmlFor="buscar-pub">
            Buscar publicación
          </label>
          <input
            id="buscar-pub"
            type="search"
            value={consulta}
            onChange={(e) => setConsulta(e.target.value)}
            placeholder="Título, hashtag, cuenta o fecha"
            className="campo w-full"
          />
        </div>
        <p className="text-[11px] text-[var(--color-tinta-tenue)]">
          {lista.length === puntos.filter((p) => p.publicaciones === 1).length
            ? `${lista.length} publicaciones en el período`
            : `${lista.length} de ${puntos.filter((p) => p.publicaciones === 1).length}`}
        </p>
      </div>

      {/* Las series disponibles. Es lo que no se podía ver desde ningún lado. */}
      {disponibles.length > 0 && (
        <div>
          <p className="etiqueta mb-1">
            Series del período{" "}
            <span className="font-normal text-[var(--color-tinta-tenue)]">
              ({disponibles.length}
              {series.size > 0 ? `, ${series.size} elegida${series.size === 1 ? "" : "s"}` : ""}
              )
            </span>
          </p>
          <div
            className="flex flex-wrap gap-1.5 overflow-y-auto"
            style={{ maxHeight: "6.5rem" }}
          >
            {disponibles.map((s) => {
              const puesta = series.has(s.clave);
              return (
                <button
                  key={s.clave}
                  type="button"
                  onClick={() => alternarSerie(s.clave)}
                  aria-pressed={puesta}
                  className={`rounded border px-2 py-1 text-[11px] transition ${
                    puesta
                      ? "border-[var(--color-tinta)] bg-[var(--color-tinta)] text-white"
                      : "border-[var(--color-filete-fuerte)] text-[var(--color-tinta-suave)] hover:bg-[var(--color-realce)]"
                  }`}
                >
                  <span className="font-medium">
                    {s.clave === SIN_CLASIFICAR
                      ? etiquetaDeGrupo(SIN_CLASIFICAR, "serie")
                      : `#${s.etiqueta}`}
                  </span>{" "}
                  <span className={puesta ? "opacity-70" : "text-[var(--color-tinta-tenue)]"}>
                    {s.n}
                  </span>
                </button>
              );
            })}
            {series.size > 0 && (
              <button
                type="button"
                onClick={() => setSeries(new Set())}
                className="rounded px-2 py-1 text-[11px] underline underline-offset-2 text-[var(--color-tinta-suave)]"
              >
                Ver todas
              </button>
            )}
          </div>
        </div>
      )}

      {/* Las elegidas, con el color que van a tener en el gráfico. */}
      <div>
        <p className="etiqueta mb-1">
          Elegidas{" "}
          <span className="font-normal text-[var(--color-tinta-tenue)]">
            ({elegidas.length} de {MAXIMO_POLIGONOS})
          </span>
        </p>
        {elegidas.length === 0 ? (
          <p className="text-[12px] text-[var(--color-tinta-tenue)]">
            Ninguna todavía: elige una de la lista de abajo.
          </p>
        ) : (
          <div className="flex flex-wrap items-center gap-1.5">
            {elegidas.map((p, i) => (
              <button
                key={p.id}
                type="button"
                onClick={() => alAlternar(p.id)}
                title="Quitar de la comparación"
                className="flex max-w-xs items-center gap-1.5 rounded border border-[var(--color-filete-fuerte)] bg-white px-2 py-1 text-[12px] transition hover:bg-[var(--color-realce)]"
              >
                <span
                  aria-hidden
                  className="inline-block size-2.5 shrink-0 rounded-full"
                  style={{ backgroundColor: SERIES[i] }}
                />
                <span className="truncate">{p.titulo ?? "Sin título"}</span>
                <span aria-hidden className="text-[var(--color-tinta-tenue)]">
                  ×
                </span>
                <span className="sr-only">Quitar</span>
              </button>
            ))}
            {elegidas.length > 1 && (
              <button
                type="button"
                onClick={alLimpiar}
                className="rounded px-2 py-1 text-[11px] underline underline-offset-2 text-[var(--color-tinta-suave)]"
              >
                Quitar todas
              </button>
            )}
          </div>
        )}
      </div>

      {/* La lista. Ordenada por la métrica: arriba va la que mejor le fue. */}
      <div>
        <p className="etiqueta mb-1">
          Publicaciones{" "}
          <span className="font-normal text-[var(--color-tinta-tenue)]">
            de más a menos {NOMBRE_EJE[metrica].toLowerCase()}
          </span>
        </p>

        {lista.length === 0 ? (
          <p className="py-4 text-center text-[12px] text-[var(--color-tinta-suave)]">
            Ninguna publicación calza con la búsqueda.
          </p>
        ) : (
          <>
            <ul
              className="divide-y divide-[var(--color-filete)] overflow-y-auto rounded border border-[var(--color-filete)]"
              style={{ maxHeight: "16rem" }}
            >
              {lista.slice(0, FILAS_VISIBLES).map((p) => {
                const puesto = elegidasIds.indexOf(p.id);
                const elegida = puesto >= 0;
                const valor = valorEnEje(p, metrica);

                return (
                  <li key={p.id}>
                    <button
                      type="button"
                      onClick={() => alAlternar(p.id)}
                      // Con tres ya puestas, agregar una cuarta no haría nada
                      // visible: es mejor que el botón lo diga.
                      disabled={!elegida && lleno}
                      aria-pressed={elegida}
                      className={`flex w-full items-center gap-2 px-2.5 py-1.5 text-left text-[12px] transition ${
                        elegida
                          ? "bg-[var(--color-realce)]"
                          : lleno
                            ? "cursor-not-allowed opacity-45"
                            : "hover:bg-[var(--color-realce)]"
                      }`}
                      title={
                        elegida
                          ? "Quitar de la comparación"
                          : lleno
                            ? `Ya hay ${MAXIMO_POLIGONOS} elegidas: quita una para agregar otra`
                            : "Agregar a la comparación"
                      }
                    >
                      <span
                        aria-hidden
                        className="inline-block size-2.5 shrink-0 rounded-full"
                        style={{
                          backgroundColor: elegida
                            ? SERIES[puesto]
                            : "var(--color-filete-fuerte)",
                        }}
                      />
                      <span className="min-w-0 flex-1">
                        <span className="block truncate">{p.titulo ?? "Sin título"}</span>
                        <span className="block text-[10px] text-[var(--color-tinta-tenue)]">
                          {p.cuenta} · {fechaCorta(p.fecha)}
                          {p.hashtag ? ` · #${p.hashtag}` : ""}
                        </span>
                      </span>
                      <span className="cifra shrink-0 font-medium">
                        {escribirEnEje(valor, metrica)}
                      </span>
                    </button>
                  </li>
                );
              })}
            </ul>

            {lista.length > FILAS_VISIBLES && (
              <p className="mt-1 text-[11px] text-[var(--color-tinta-tenue)]">
                Se muestran las primeras {FILAS_VISIBLES} de {lista.length}. Usa el
                buscador o elige una serie para llegar al resto.
              </p>
            )}
          </>
        )}
      </div>
    </div>
  );
}
