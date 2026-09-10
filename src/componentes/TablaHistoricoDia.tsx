"use client";

import Link from "next/link";
import { Fragment, useState } from "react";
import { Delta } from "@/componentes/Delta";
import { Cifra, Pct } from "@/componentes/ui";
import type { BloqueDia } from "@/lib/datos/consultas";
import { fechaHoraCorta } from "@/lib/dominio/formato";
import { tieneAlcance } from "@/lib/dominio/plataformas";

const COLUMNAS = 12;

/**
 * Un día del histórico: una fila por plataforma con su total, y al apretarla se
 * abre el desglose de cada carga con sus propios deltas.
 *
 * El desglose viene calculado del servidor, así que abrir y cerrar no dispara
 * ninguna petición.
 */
export function TablaHistoricoDia({ bloques }: { bloques: BloqueDia[] }) {
  const [abiertas, setAbiertas] = useState<Set<string>>(new Set());

  const alternar = (plataforma: string) =>
    setAbiertas((previas) => {
      const siguiente = new Set(previas);
      if (siguiente.has(plataforma)) siguiente.delete(plataforma);
      else siguiente.add(plataforma);
      return siguiente;
    });

  return (
    <div className="scroll-x">
      <table className="w-full border-collapse text-left">
        <thead className="border-b border-[var(--color-filete)]">
          <tr>
            <th className="th w-8" />
            <th className="th">Plataforma</th>
            <th className="th text-right">Pub.</th>
            <th className="th text-right">Alcance</th>
            <th className="th text-right">Visualiz.</th>
            <th className="th text-right">Interacc.</th>
            <th className="th text-right">Engagement</th>
            <th className="th text-right">Nuevos seg.</th>
            <th className="th">Δ Alcance</th>
            <th className="th">Δ Visualiz.</th>
            <th className="th">Δ Interacc.</th>
            <th className="th">Δ Seguidores</th>
          </tr>
        </thead>
        <tbody>
          {bloques.map(({ linea, detalle }) => {
            const abierta = abiertas.has(linea.plataforma);
            const conAlcance = tieneAlcance(linea.plataforma);

            return (
              <Fragment key={linea.plataforma}>
                <tr
                  onClick={() => alternar(linea.plataforma)}
                  className="cursor-pointer border-b border-[var(--color-filete)] hover:bg-[var(--color-realce)]/50"
                >
                  <td className="td text-center">
                    <button
                      type="button"
                      aria-expanded={abierta}
                      aria-label={`${abierta ? "Ocultar" : "Ver"} el desglose de ${linea.plataforma}`}
                      className="text-[var(--color-tinta-tenue)] transition hover:text-[var(--color-tinta)]"
                    >
                      <span
                        aria-hidden
                        className="inline-block transition-transform"
                        style={{ transform: abierta ? "rotate(90deg)" : "none" }}
                      >
                        ▸
                      </span>
                    </button>
                  </td>
                  <td className="td font-medium">{linea.plataforma}</td>
                  <td className="td text-right">
                    <span className="cifra">{linea.publicaciones}</span>
                    <span className="ml-1.5 text-[11px] text-[var(--color-tinta-tenue)]">
                      en {detalle.length} {detalle.length === 1 ? "carga" : "cargas"}
                    </span>
                  </td>
                  <td className="td text-right">
                    {conAlcance ? (
                      <Cifra valor={linea.dia.alcance} />
                    ) : (
                      <span
                        className="text-[var(--color-tinta-tenue)]"
                        title="YouTube no entrega alcance"
                      >
                        n/a
                      </span>
                    )}
                  </td>
                  <td className="td text-right">
                    <Cifra valor={linea.dia.visualizaciones} />
                  </td>
                  <td className="td text-right">
                    <Cifra valor={linea.dia.interacciones} />
                  </td>
                  <td className="td text-right">
                    <Pct valor={linea.dia.engagement} />
                  </td>
                  <td className="td text-right">
                    <Cifra valor={linea.dia.nuevos_seguidores} fino />
                  </td>
                  <td className="td">
                    <Delta valor={linea.deltas.alcance} />
                  </td>
                  <td className="td">
                    <Delta valor={linea.deltas.visualizaciones} />
                  </td>
                  <td className="td">
                    <Delta valor={linea.deltas.interacciones} />
                  </td>
                  <td className="td">
                    <Delta valor={linea.deltas.nuevos_seguidores} />
                  </td>
                </tr>

                {abierta && (
                  <tr className="border-b border-[var(--color-filete)]">
                    <td colSpan={COLUMNAS} className="bg-[var(--color-realce)]/40 px-3 py-3">
                      <p className="mb-2 px-1 text-[11px] font-semibold uppercase tracking-wide text-[var(--color-tinta-suave)]">
                        Desglose de {linea.plataforma} · valores por publicación
                        de cada carga
                      </p>

                      <div className="scroll-x">
                        <table className="w-full border-collapse text-left">
                          <thead>
                            <tr className="border-b border-[var(--color-filete-fuerte)]">
                              <th className="th">Categoría</th>
                              <th className="th text-right">Pub.</th>
                              <th className="th text-right">Alcance</th>
                              <th className="th text-right">Visualiz.</th>
                              <th className="th text-right">Interacc.</th>
                              <th className="th text-right">Engagement</th>
                              <th className="th text-right">Nuevos seg.</th>
                              <th className="th">Δ Alcance</th>
                              <th className="th">Δ Visualiz.</th>
                              <th className="th">Δ Interacc.</th>
                              <th className="th">Δ Seguidores</th>
                              <th className="th">Contenido</th>
                            </tr>
                          </thead>
                          <tbody>
                            {detalle.map((d) => (
                              <tr
                                key={d.id}
                                className="border-b border-[var(--color-filete)] last:border-0"
                              >
                                <td className="td">
                                  {d.categoria ?? (
                                    <span className="text-[var(--color-tinta-tenue)]">
                                      sin categoría
                                    </span>
                                  )}
                                </td>
                                <td className="td text-right cifra">{d.publicaciones}</td>
                                <td className="td text-right">
                                  {conAlcance ? (
                                    <Cifra valor={d.porPublicacion.alcance} />
                                  ) : (
                                    <span className="text-[var(--color-tinta-tenue)]">n/a</span>
                                  )}
                                </td>
                                <td className="td text-right">
                                  <Cifra valor={d.porPublicacion.visualizaciones} />
                                </td>
                                <td className="td text-right">
                                  <Cifra valor={d.porPublicacion.interacciones} />
                                </td>
                                <td className="td text-right">
                                  <Pct valor={d.porPublicacion.engagement} />
                                </td>
                                <td className="td text-right">
                                  <Cifra valor={d.porPublicacion.nuevos_seguidores} fino />
                                </td>
                                <td className="td">
                                  <Delta
                                    valor={d.deltas.alcance}
                                    titulo={
                                      d.sinBase
                                        ? `No hay línea base para ${linea.plataforma} · ${d.categoria ?? "sin categoría"}`
                                        : undefined
                                    }
                                  />
                                </td>
                                <td className="td">
                                  <Delta valor={d.deltas.visualizaciones} />
                                </td>
                                <td className="td">
                                  <Delta valor={d.deltas.interacciones} />
                                </td>
                                <td className="td">
                                  <Delta valor={d.deltas.nuevos_seguidores} />
                                </td>
                                <td className="td">
                                  <div className="flex max-w-[18rem] flex-col leading-tight">
                                    {d.titulo ? (
                                      d.enlace ? (
                                        <Link
                                          href={d.enlace}
                                          target="_blank"
                                          rel="noopener noreferrer"
                                          className="truncate text-[13px] underline-offset-2 hover:underline"
                                          title={d.titulo}
                                        >
                                          {d.titulo}
                                        </Link>
                                      ) : (
                                        <span className="truncate text-[13px]" title={d.titulo}>
                                          {d.titulo}
                                        </span>
                                      )
                                    ) : (
                                      <span className="text-[13px] text-[var(--color-tinta-tenue)]">
                                        sin título
                                      </span>
                                    )}
                                    <span className="text-[11px] text-[var(--color-tinta-tenue)]">
                                      {d.autor ?? "—"} · {fechaHoraCorta(d.creadoEn)}
                                      {d.editado && " · editado"}
                                    </span>
                                  </div>
                                </td>
                              </tr>
                            ))}
                          </tbody>
                        </table>
                      </div>
                    </td>
                  </tr>
                )}
              </Fragment>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}
