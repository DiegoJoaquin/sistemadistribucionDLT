"use client";

import Link from "next/link";
import { useActionState, useEffect, useState } from "react";
import { useFormStatus } from "react-dom";
import {
  actualizarRegistro,
  borrarRegistro,
  type Resultado,
} from "@/lib/datos/acciones";
import { estaEnRango, fechaCorta, fechaHoraCorta } from "@/lib/dominio/formato";
import {
  type Categoria,
  categoriasDe,
  PLATAFORMAS,
  type Plataforma,
  tieneAlcance,
} from "@/lib/dominio/plataformas";
import type { RegistroConAutor } from "@/lib/supabase/tipos-db";

/**
 * Formulario de edición de un registro.
 *
 * Vive aparte porque lo usan dos vistas: la tabla del registro diario y el
 * desglose del histórico. Duplicarlo habría garantizado que se desfasaran.
 */

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

export interface RangoVisible {
  desde: string;
  hasta: string;
  /** A dónde mandar para ver la fecha que quedó fuera del rango. */
  enlaceAFecha: (fecha: string) => string;
}

export function FormularioEdicionRegistro({
  registro,
  onCerrar,
  rangoVisible,
}: {
  registro: RegistroConAutor;
  onCerrar: () => void;
  rangoVisible?: RangoVisible;
}) {
  const [estado, accion] = useActionState<Resultado | null, FormData>(
    actualizarRegistro,
    null,
  );
  const [plataforma, setPlataforma] = useState<Plataforma>(registro.plataforma);
  const [categoria, setCategoria] = useState<Categoria | "">(registro.categoria ?? "");

  /*
   * Se guardó bien, pero la fecha quedó fuera del rango que se está viendo: la
   * fila desaparece de la tabla. Antes eso pasaba en silencio y parecía que la
   * edición no se había aplicado.
   */
  const seFueDelRango =
    estado?.ok === true &&
    estado.fecha !== undefined &&
    rangoVisible !== undefined &&
    !estaEnRango(estado.fecha, rangoVisible.desde, rangoVisible.hasta);

  useEffect(() => {
    if (estado?.ok && !seFueDelRango) onCerrar();
  }, [estado, seFueDelRango, onCerrar]);

  const categorias = categoriasDe(plataforma);
  const conAlcance = tieneAlcance(plataforma);

  if (seFueDelRango && estado?.fecha) {
    return (
      <div className="rounded-md border border-amber-300 bg-amber-50 p-3 text-sm text-amber-900">
        <p className="font-medium">
          Guardado, pero quedó en el {fechaCorta(estado.fecha)}.
        </p>
        <p className="mt-1">
          Esa fecha está fuera del rango que estás viendo, así que la fila ya no
          aparece en esta tabla.
        </p>
        <div className="mt-2.5 flex flex-wrap items-center gap-3">
          <Link
            href={rangoVisible.enlaceAFecha(estado.fecha)}
            className="boton-suave"
          >
            Ver el {fechaCorta(estado.fecha)}
          </Link>
          <button type="button" onClick={onCerrar} className="text-[13px] underline-offset-2 hover:underline">
            Entendido
          </button>
        </div>
      </div>
    );
  }

  return (
    <form action={accion} className="space-y-3">
      <input type="hidden" name="id" value={registro.id} />

      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        <div className="space-y-1">
          <label className="etiqueta">Fecha</label>
          <input
            name="fecha"
            type="date"
            required
            defaultValue={registro.fecha}
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
            defaultValue={registro.publicaciones}
            className="campo cifra"
          />
        </div>
      </div>

      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        <Num
          nombre="alcance"
          etiqueta="Alcance"
          valor={conAlcance ? registro.alcance : null}
          deshabilitado={!conAlcance}
        />
        <Num
          nombre="visualizaciones"
          etiqueta="Visualizaciones"
          valor={registro.visualizaciones}
        />
        <Num
          nombre="interacciones"
          etiqueta="Interacciones"
          valor={registro.interacciones}
        />
        <Num
          nombre="nuevos_seguidores"
          etiqueta="Nuevos seguidores"
          valor={registro.nuevos_seguidores}
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
            valor={registro.visitas_perfil}
          />
          <Num
            nombre="vistas_seguidores"
            etiqueta="Vistas de seguidores"
            valor={registro.vistas_seguidores}
          />
          <Num
            nombre="vistas_no_seguidores"
            etiqueta="Vistas de no seguidores"
            valor={registro.vistas_no_seguidores}
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
            defaultValue={registro.titulo_contenido ?? ""}
            className="campo"
          />
        </div>
        <div className="space-y-1">
          <label className="etiqueta">Enlace</label>
          <input
            name="enlace"
            type="url"
            defaultValue={registro.enlace ?? ""}
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
          Cargado por {registro.autor?.nombre ?? "—"} el{" "}
          {fechaHoraCorta(registro.created_at)}
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
  );
}
