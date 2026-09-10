"use client";

import { useState } from "react";
import { Delta } from "@/componentes/Delta";
import {
  FormularioEdicionRegistro,
  type RangoVisible,
} from "@/componentes/FormularioEdicionRegistro";
import { Cifra } from "@/componentes/ui";
import { fechaCorta, fechaHoraCorta } from "@/lib/dominio/formato";
import type { RegistroConAutor } from "@/lib/supabase/tipos-db";

export interface FilaTabla {
  registro: RegistroConAutor;
  alcancePorPost: number | null;
  deltas: {
    alcance: number | null;
    visualizaciones: number | null;
    interacciones: number | null;
    nuevos_seguidores: number | null;
  };
  /** true si no hay línea base para esa plataforma y categoría. */
  sinBase: boolean;
}

const COLUMNAS = 15;

export function TablaRegistros({
  filas,
  rango,
}: {
  filas: FilaTabla[];
  /** Rango que está filtrado, para avisar si una edición mueve la fila fuera. */
  rango: { desde: string; hasta: string };
}) {
  const [editando, setEditando] = useState<string | null>(null);

  const rangoVisible: RangoVisible = {
    desde: rango.desde,
    hasta: rango.hasta,
    enlaceAFecha: (f) => `/registro?desde=${f}&hasta=${f}`,
  };

  return (
    <div className="tarjeta overflow-hidden">
      <div className="scroll-x">
        <table className="w-full border-collapse text-left">
          <thead className="border-b border-[var(--color-filete)] bg-[var(--color-realce)]/60">
            <tr>
              <th className="th">Fecha</th>
              <th className="th">Plataforma</th>
              <th className="th">Categoría</th>
              <th className="th text-right">Pub.</th>
              <th className="th text-right">Alcance</th>
              <th className="th text-right">Visualiz.</th>
              <th className="th text-right">Interacc.</th>
              <th className="th text-right">Seguidores</th>
              <th className="th text-right">Alcance/post</th>
              <th className="th">Δ Alcance</th>
              <th className="th">Δ Visualiz.</th>
              <th className="th">Δ Interacc.</th>
              <th className="th">Δ Seguidores</th>
              <th className="th">Cargado por</th>
              <th className="th sr-only">Acciones</th>
            </tr>
          </thead>
          <tbody>
            {filas.map((f) =>
              editando === f.registro.id ? (
                <tr
                  key={f.registro.id}
                  className="border-b border-[var(--color-filete)] bg-[var(--color-realce)]/50"
                >
                  <td colSpan={COLUMNAS} className="p-4">
                    <FormularioEdicionRegistro
                      registro={f.registro}
                      onCerrar={() => setEditando(null)}
                      rangoVisible={rangoVisible}
                    />
                  </td>
                </tr>
              ) : (
                <FilaLectura
                  key={f.registro.id}
                  fila={f}
                  onEditar={() => setEditando(f.registro.id)}
                />
              ),
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}

function FilaLectura({ fila, onEditar }: { fila: FilaTabla; onEditar: () => void }) {
  const r = fila.registro;
  const tienePerfil =
    r.visitas_perfil !== null ||
    r.vistas_seguidores !== null ||
    r.vistas_no_seguidores !== null;

  const tituloDelta = fila.sinBase
    ? "No hay línea base para esta plataforma y categoría"
    : undefined;

  return (
    <tr className="border-b border-[var(--color-filete)] last:border-0 hover:bg-[var(--color-realce)]/40">
      <td className="td text-[var(--color-tinta-suave)]">{fechaCorta(r.fecha)}</td>
      <td className="td font-medium">{r.plataforma}</td>
      <td className="td">
        {r.categoria ?? (
          <span className="text-[var(--color-tinta-tenue)]">sin categoría</span>
        )}
      </td>
      <td className="td text-right font-medium">{r.publicaciones}</td>
      <td className="td text-right">
        <Cifra valor={r.alcance} />
      </td>
      <td className="td text-right">
        <Cifra valor={r.visualizaciones} />
      </td>
      <td className="td text-right">
        <Cifra valor={r.interacciones} />
      </td>
      <td className="td text-right">
        <Cifra valor={r.nuevos_seguidores} />
      </td>
      <td className="td text-right text-[var(--color-tinta-suave)]">
        <Cifra valor={fila.alcancePorPost} />
      </td>
      <td className="td">
        <Delta valor={fila.deltas.alcance} titulo={tituloDelta} />
      </td>
      <td className="td">
        <Delta valor={fila.deltas.visualizaciones} titulo={tituloDelta} />
      </td>
      <td className="td">
        <Delta valor={fila.deltas.interacciones} titulo={tituloDelta} />
      </td>
      <td className="td">
        <Delta valor={fila.deltas.nuevos_seguidores} titulo={tituloDelta} />
      </td>
      <td className="td">
        <div className="flex flex-col leading-tight">
          <span className="text-[13px]">{r.autor?.nombre ?? "—"}</span>
          <span className="text-[11px] text-[var(--color-tinta-tenue)]">
            {fechaHoraCorta(r.created_at)}
            {r.updated_at !== r.created_at && " · editado"}
          </span>
        </div>
      </td>
      <td className="td">
        <div className="flex items-center gap-2">
          {tienePerfil && (
            <span
              title="Tiene métricas de perfil cargadas"
              className="text-[11px] text-[var(--color-tinta-tenue)]"
            >
              perfil
            </span>
          )}
          {r.titulo_contenido && (
            <span
              title={r.titulo_contenido}
              className="max-w-[10rem] truncate text-[11px] text-[var(--color-tinta-tenue)]"
            >
              {r.titulo_contenido}
            </span>
          )}
          <button
            type="button"
            onClick={onEditar}
            className="text-[13px] text-[var(--color-tinta-suave)] underline-offset-2 hover:text-[var(--color-tinta)] hover:underline"
          >
            Editar
          </button>
        </div>
      </td>
    </tr>
  );
}
