"use client";

import Link from "next/link";
import { Fragment, useState } from "react";
import { Delta } from "@/componentes/Delta";
import {
  FormularioEdicionRegistro,
  type RangoVisible,
} from "@/componentes/FormularioEdicionRegistro";
import { Cifra, Pct } from "@/componentes/ui";
import type { BloqueDia, DetalleFila } from "@/lib/datos/consultas";
import { fechaHoraCorta } from "@/lib/dominio/formato";
import { tieneAlcanceRed } from "@/lib/dominio/redes";

const COLUMNAS = 12;
const COLUMNAS_DETALLE = 13;

/**
 * Un día del histórico: una fila por plataforma con su total, y al apretarla se
 * abre el desglose de cada carga con sus propios deltas. Cada carga se puede
 * editar ahí mismo, con el mismo formulario del registro diario.
 *
 * El desglose viene calculado del servidor, así que abrir y cerrar no dispara
 * ninguna petición.
 */
export function TablaHistoricoDia({
  bloques,
  rango,
}: {
  bloques: BloqueDia[];
  /** Rango filtrado, para avisar si una edición mueve la fila fuera de vista. */
  rango: { desde: string; hasta: string };
}) {
  const [abiertas, setAbiertas] = useState<Set<string>>(new Set());
  const [editando, setEditando] = useState<string | null>(null);

  const rangoVisible: RangoVisible = {
    desde: rango.desde,
    hasta: rango.hasta,
    enlaceAFecha: (f) => `/historico?desde=${f}&hasta=${f}`,
  };

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
            const abierta = abiertas.has(linea.cuenta.id);
            const conAlcance = tieneAlcanceRed(linea.cuenta.red);

            return (
              <Fragment key={linea.cuenta.id}>
                <tr
                  onClick={() => alternar(linea.cuenta.id)}
                  className="cursor-pointer border-b border-[var(--color-filete)] hover:bg-[var(--color-realce)]/50"
                >
                  <td className="td text-center">
                    <button
                      type="button"
                      aria-expanded={abierta}
                      aria-label={`${abierta ? "Ocultar" : "Ver"} el desglose de ${linea.cuenta.nombre}`}
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
                  <td className="td font-medium">{linea.cuenta.nombre}</td>
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
                        Desglose de {linea.cuenta.nombre} · valores por publicación
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
                              <th className="th sr-only">Acciones</th>
                            </tr>
                          </thead>
                          <tbody>
                            {detalle.map((d) =>
                              editando === d.registro.id ? (
                                <tr
                                  key={d.registro.id}
                                  className="border-b border-[var(--color-filete)] bg-white"
                                >
                                  <td colSpan={COLUMNAS_DETALLE} className="p-3">
                                    <FormularioEdicionRegistro
                                      registro={d.registro}
                                      onCerrar={() => setEditando(null)}
                                      rangoVisible={rangoVisible}
                                    />
                                  </td>
                                </tr>
                              ) : (
                                <FilaDetalle
                                  key={d.registro.id}
                                  d={d}
                                  conAlcance={conAlcance}
                                  cuenta={linea.cuenta.nombre}
                                  onEditar={() => setEditando(d.registro.id)}
                                />
                              ),
                            )}
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

function FilaDetalle({
  d,
  conAlcance,
  cuenta,
  onEditar,
}: {
  d: DetalleFila;
  conAlcance: boolean;
  cuenta: string;
  onEditar: () => void;
}) {
  const r = d.registro;

  return (
    <tr className="border-b border-[var(--color-filete)] last:border-0">
      <td className="td">
        {r.categoria ?? (
          <span className="text-[var(--color-tinta-tenue)]">sin categoría</span>
        )}
      </td>
      <td className="td text-right cifra">{r.publicaciones}</td>
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
              ? `No hay línea base para ${cuenta} · ${r.categoria ?? "sin categoría"}`
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
          {r.titulo_contenido ? (
            r.enlace ? (
              <Link
                href={r.enlace}
                target="_blank"
                rel="noopener noreferrer"
                className="truncate text-[13px] underline-offset-2 hover:underline"
                title={r.titulo_contenido}
              >
                {r.titulo_contenido}
              </Link>
            ) : (
              <span className="truncate text-[13px]" title={r.titulo_contenido}>
                {r.titulo_contenido}
              </span>
            )
          ) : (
            <span className="text-[13px] text-[var(--color-tinta-tenue)]">
              sin título
            </span>
          )}
          <span className="text-[11px] text-[var(--color-tinta-tenue)]">
            {r.autor?.nombre ?? "—"} · {fechaHoraCorta(r.created_at)}
            {r.updated_at !== r.created_at && " · editado"}
          </span>
        </div>
      </td>
      <td className="td">
        <button
          type="button"
          onClick={onEditar}
          className="text-[13px] text-[var(--color-tinta-suave)] underline-offset-2 hover:text-[var(--color-tinta)] hover:underline"
        >
          Editar
        </button>
      </td>
    </tr>
  );
}
