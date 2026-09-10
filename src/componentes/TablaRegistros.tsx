"use client";

import { useActionState, useEffect, useState } from "react";
import { useFormStatus } from "react-dom";
import { Delta } from "@/componentes/Delta";
import { Cifra } from "@/componentes/ui";
import {
  actualizarRegistro,
  borrarRegistro,
  type Resultado,
} from "@/lib/datos/acciones";
import { fechaCorta, fechaHoraCorta } from "@/lib/dominio/formato";
import {
  categoriasDe,
  type Categoria,
  PLATAFORMAS,
  type Plataforma,
  tieneAlcance,
} from "@/lib/dominio/plataformas";
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

export function TablaRegistros({ filas }: { filas: FilaTabla[] }) {
  const [editando, setEditando] = useState<string | null>(null);

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
                <FilaEdicion
                  key={f.registro.id}
                  fila={f}
                  onCerrar={() => setEditando(null)}
                />
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

function BotonGuardar() {
  const { pending } = useFormStatus();
  return (
    <button type="submit" className="boton" disabled={pending}>
      {pending ? "Guardando…" : "Guardar"}
    </button>
  );
}

function Num({
  nombre,
  etiqueta,
  valor,
  deshabilitado,
}: {
  nombre: string;
  etiqueta: string;
  valor: number | null;
  deshabilitado?: boolean;
}) {
  return (
    <div className="space-y-1">
      <label className="etiqueta">{etiqueta}</label>
      <input
        name={nombre}
        type="number"
        min={0}
        step={1}
        defaultValue={valor ?? ""}
        disabled={deshabilitado}
        placeholder={deshabilitado ? "no aplica" : "—"}
        className="campo cifra disabled:bg-[var(--color-realce)] disabled:text-[var(--color-tinta-tenue)]"
      />
    </div>
  );
}

function FilaEdicion({ fila, onCerrar }: { fila: FilaTabla; onCerrar: () => void }) {
  const r = fila.registro;
  const [estado, accion] = useActionState<Resultado | null, FormData>(
    actualizarRegistro,
    null,
  );
  const [plataforma, setPlataforma] = useState<Plataforma>(r.plataforma);
  const [categoria, setCategoria] = useState<Categoria | "">(r.categoria ?? "");

  useEffect(() => {
    if (estado?.ok) onCerrar();
  }, [estado, onCerrar]);

  const categorias = categoriasDe(plataforma);
  const conAlcance = tieneAlcance(plataforma);

  return (
    <tr className="border-b border-[var(--color-filete)] bg-[var(--color-realce)]/50">
      <td colSpan={COLUMNAS} className="p-4">
        <form action={accion} className="space-y-3">
          <input type="hidden" name="id" value={r.id} />

          <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
            <div className="space-y-1">
              <label className="etiqueta">Fecha</label>
              <input
                name="fecha"
                type="date"
                required
                defaultValue={r.fecha}
                className="campo"
              />
            </div>
            <div className="space-y-1">
              <label className="etiqueta">Plataforma</label>
              <select
                name="plataforma"
                className="campo"
                value={plataforma}
                onChange={(e) => {
                  const nueva = e.target.value as Plataforma;
                  setPlataforma(nueva);
                  // Con una sola categoría queda puesta sola (TikTok es Video).
                  const suyas = categoriasDe(nueva);
                  setCategoria(suyas.length === 1 ? suyas[0] : "");
                }}
              >
                {PLATAFORMAS.map((p) => (
                  <option key={p} value={p}>
                    {p}
                  </option>
                ))}
              </select>
            </div>
            <div className="space-y-1">
              <label className="etiqueta">Categoría</label>
              <select
                name="categoria"
                className="campo disabled:bg-[var(--color-realce)]"
                disabled={categorias.length === 0}
                value={categoria}
                onChange={(e) => setCategoria(e.target.value as Categoria | "")}
              >
                {categorias.length === 0 ? (
                  <option value="">sin categorías</option>
                ) : (
                  <>
                    {categorias.length > 1 && <option value="">— elegir —</option>}
                    {categorias.map((c) => (
                      <option key={c} value={c}>
                        {c}
                      </option>
                    ))}
                  </>
                )}
              </select>
            </div>
            <div className="space-y-1">
              <label className="etiqueta">Publicaciones</label>
              <input
                name="publicaciones"
                type="number"
                min={1}
                step={1}
                required
                defaultValue={r.publicaciones}
                className="campo cifra"
              />
            </div>
          </div>

          <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
            <Num
              nombre="alcance"
              etiqueta="Alcance"
              valor={conAlcance ? r.alcance : null}
              deshabilitado={!conAlcance}
            />
            <Num
              nombre="visualizaciones"
              etiqueta="Visualizaciones"
              valor={r.visualizaciones}
            />
            <Num nombre="interacciones" etiqueta="Interacciones" valor={r.interacciones} />
            <Num
              nombre="nuevos_seguidores"
              etiqueta="Nuevos seguidores"
              valor={r.nuevos_seguidores}
            />
          </div>

          <div className="rounded-md border border-dashed border-[var(--color-filete-fuerte)] bg-white/70 p-3">
            <p className="mb-2 text-xs font-medium text-[var(--color-tinta-suave)]">
              Métricas de perfil · se ingresan a mano
            </p>
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
              <Num
                nombre="visitas_perfil"
                etiqueta="Visitas al perfil"
                valor={r.visitas_perfil}
              />
              <Num
                nombre="vistas_seguidores"
                etiqueta="Vistas de seguidores"
                valor={r.vistas_seguidores}
              />
              <Num
                nombre="vistas_no_seguidores"
                etiqueta="Vistas de no seguidores"
                valor={r.vistas_no_seguidores}
              />
            </div>
          </div>

          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            <div className="space-y-1">
              <label className="etiqueta">Título del contenido</label>
              <input
                name="titulo_contenido"
                type="text"
                maxLength={300}
                defaultValue={r.titulo_contenido ?? ""}
                className="campo"
              />
            </div>
            <div className="space-y-1">
              <label className="etiqueta">Enlace</label>
              <input
                name="enlace"
                type="url"
                defaultValue={r.enlace ?? ""}
                className="campo"
              />
            </div>
          </div>

          <div className="flex flex-wrap items-center gap-3">
            <BotonGuardar />
            <button type="button" onClick={onCerrar} className="boton-suave">
              Cancelar
            </button>
            <span className="flex-1" />
            <span className="text-xs text-[var(--color-tinta-tenue)]">
              Cargado por {r.autor?.nombre ?? "—"} el {fechaHoraCorta(r.created_at)}
            </span>
            <button
              type="submit"
              formAction={borrarRegistro}
              formNoValidate
              className="text-[13px] text-red-700 underline-offset-2 hover:underline"
            >
              Borrar
            </button>
          </div>

          {estado?.mensaje && !estado.ok && (
            <p role="alert" className="text-sm text-red-700">
              {estado.mensaje}
            </p>
          )}
        </form>
      </td>
    </tr>
  );
}
