"use client";

import Link from "next/link";
import { useActionState, useEffect, useId, useRef, useState } from "react";
import { useFormStatus } from "react-dom";
import { crearRegistro, type Resultado } from "@/lib/datos/acciones";
import { estaEnRango, fechaCorta } from "@/lib/dominio/formato";
import {
  categoriasDe,
  PLATAFORMAS,
  type Plataforma,
  tieneAlcance,
} from "@/lib/dominio/plataformas";

function Guardar() {
  const { pending } = useFormStatus();
  return (
    <button type="submit" className="boton" disabled={pending}>
      {pending ? "Guardando…" : "Agregar registro"}
    </button>
  );
}

function CampoNumero({
  nombre,
  etiqueta,
  ayuda,
  deshabilitado,
}: {
  nombre: string;
  etiqueta: string;
  ayuda?: string;
  deshabilitado?: boolean;
}) {
  const id = useId();
  return (
    <div className="space-y-1">
      <label className="etiqueta" htmlFor={id}>
        {etiqueta}
      </label>
      <input
        id={id}
        name={nombre}
        type="number"
        min={0}
        step={1}
        inputMode="numeric"
        disabled={deshabilitado}
        placeholder={deshabilitado ? "no aplica" : "—"}
        className="campo cifra disabled:bg-[var(--color-realce)] disabled:text-[var(--color-tinta-tenue)]"
      />
      {ayuda && (
        <p className="text-[11px] leading-tight text-[var(--color-tinta-tenue)]">{ayuda}</p>
      )}
    </div>
  );
}

export function FormularioRegistro({
  hoy,
  rango,
}: {
  hoy: string;
  /** Rango que está filtrado en la tabla de abajo. */
  rango: { desde: string; hasta: string };
}) {
  const [estado, accion] = useActionState<Resultado | null, FormData>(
    crearRegistro,
    null,
  );
  const [plataforma, setPlataforma] = useState<Plataforma>("Instagram DLT");
  const [verPerfil, setVerPerfil] = useState(false);
  const form = useRef<HTMLFormElement>(null);

  const categorias = categoriasDe(plataforma);
  const conAlcance = tieneAlcance(plataforma);

  /*
   * Se guardó, pero en una fecha que la tabla de abajo no está mostrando. Sin
   * avisar, esto se ve como si el registro no se hubiera guardado.
   */
  const fueraDelRango =
    estado?.ok === true &&
    estado.fecha !== undefined &&
    !estaEnRango(estado.fecha, rango.desde, rango.hasta);

  // Al guardar bien, se limpian las métricas pero se mantienen fecha y
  // plataforma: casi siempre se cargan varias filas seguidas de lo mismo.
  useEffect(() => {
    if (estado?.ok && form.current) {
      const f = form.current;
      for (const campo of [
        "alcance",
        "visualizaciones",
        "interacciones",
        "nuevos_seguidores",
        "visitas_perfil",
        "vistas_seguidores",
        "vistas_no_seguidores",
        "titulo_contenido",
        "enlace",
      ]) {
        const el = f.elements.namedItem(campo);
        if (el instanceof HTMLInputElement) el.value = "";
      }
      const pub = f.elements.namedItem("publicaciones");
      if (pub instanceof HTMLInputElement) pub.value = "1";
    }
  }, [estado]);

  return (
    <form ref={form} action={accion} className="tarjeta p-4">
      <div className="mb-3 flex items-baseline justify-between gap-2">
        <h2 className="text-sm font-semibold">Agregar publicaciones del día</h2>
        <p className="text-xs text-[var(--color-tinta-tenue)]">
          Una fila por plataforma y categoría
        </p>
      </div>

      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        <div className="space-y-1">
          <label className="etiqueta" htmlFor="f-fecha">
            Fecha
          </label>
          <input
            id="f-fecha"
            name="fecha"
            type="date"
            required
            defaultValue={hoy}
            className="campo"
          />
        </div>

        <div className="space-y-1">
          <label className="etiqueta" htmlFor="f-plataforma">
            Plataforma
          </label>
          <select
            id="f-plataforma"
            name="plataforma"
            className="campo"
            value={plataforma}
            onChange={(e) => setPlataforma(e.target.value as Plataforma)}
          >
            {PLATAFORMAS.map((p) => (
              <option key={p} value={p}>
                {p}
              </option>
            ))}
          </select>
        </div>

        <div className="space-y-1">
          <label className="etiqueta" htmlFor="f-categoria">
            Categoría
          </label>
          <select
            id="f-categoria"
            name="categoria"
            /* La clave fuerza a React a reiniciar el select al cambiar de
               plataforma; si no, mantiene la opción elegida para la anterior. */
            key={plataforma}
            className="campo disabled:bg-[var(--color-realce)] disabled:text-[var(--color-tinta-tenue)]"
            disabled={categorias.length === 0}
          >
            {categorias.length === 0 ? (
              <option value="">sin categorías</option>
            ) : (
              <>
                {/* Con una sola categoría no hay nada que elegir: queda puesta.
                    TikTok es siempre Video. */}
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
          <label className="etiqueta" htmlFor="f-publicaciones">
            Publicaciones
          </label>
          <input
            id="f-publicaciones"
            name="publicaciones"
            type="number"
            min={1}
            step={1}
            required
            defaultValue={1}
            className="campo cifra"
          />
          <p className="text-[11px] leading-tight text-[var(--color-tinta-tenue)]">
            Cuántas representa esta fila
          </p>
        </div>
      </div>

      <div className="mt-3 grid grid-cols-2 gap-3 sm:grid-cols-4">
        <CampoNumero
          nombre="alcance"
          etiqueta="Alcance"
          deshabilitado={!conAlcance}
          ayuda={conAlcance ? undefined : "YouTube no lo entrega"}
        />
        <CampoNumero nombre="visualizaciones" etiqueta="Visualizaciones" />
        <CampoNumero nombre="interacciones" etiqueta="Interacciones" />
        <CampoNumero nombre="nuevos_seguidores" etiqueta="Nuevos seguidores" />
      </div>

      {/* §4.1 — los tres campos de perfil van visualmente separados: ninguna
          plataforma los entrega en su exportación, se ingresan a mano. */}
      <div className="mt-3 rounded-md border border-dashed border-[var(--color-filete-fuerte)] bg-[var(--color-realce)]/60 p-3">
        <button
          type="button"
          onClick={() => setVerPerfil((v) => !v)}
          className="flex w-full items-center justify-between text-left"
          aria-expanded={verPerfil}
        >
          <span className="text-xs font-medium text-[var(--color-tinta-suave)]">
            Métricas de perfil · opcionales, se ingresan a mano
          </span>
          <span className="text-xs text-[var(--color-tinta-tenue)]">
            {verPerfil ? "ocultar" : "mostrar"}
          </span>
        </button>

        {verPerfil && (
          <div className="mt-3 grid grid-cols-1 gap-3 sm:grid-cols-3">
            <CampoNumero nombre="visitas_perfil" etiqueta="Visitas al perfil" />
            <CampoNumero nombre="vistas_seguidores" etiqueta="Vistas de seguidores" />
            <CampoNumero
              nombre="vistas_no_seguidores"
              etiqueta="Vistas de no seguidores"
            />
          </div>
        )}
      </div>

      <div className="mt-3 grid grid-cols-1 gap-3 sm:grid-cols-2">
        <div className="space-y-1">
          <label className="etiqueta" htmlFor="f-titulo">
            Título del contenido <span className="normal-case">(opcional)</span>
          </label>
          <input
            id="f-titulo"
            name="titulo_contenido"
            type="text"
            maxLength={300}
            placeholder="Para identificarlo en el reporte"
            className="campo"
          />
        </div>
        <div className="space-y-1">
          <label className="etiqueta" htmlFor="f-enlace">
            Enlace <span className="normal-case">(opcional)</span>
          </label>
          <input
            id="f-enlace"
            name="enlace"
            type="url"
            placeholder="https://…"
            className="campo"
          />
        </div>
      </div>

      <div className="mt-4 flex flex-wrap items-center gap-3">
        <Guardar />
        {estado?.mensaje && !fueraDelRango && (
          <p
            role="status"
            className={`text-sm ${estado.ok ? "text-emerald-700" : "text-red-700"}`}
          >
            {estado.mensaje}
          </p>
        )}
      </div>

      {fueraDelRango && estado?.fecha && (
        <div
          role="status"
          className="mt-3 rounded-md border border-amber-300 bg-amber-50 px-3 py-2.5 text-sm text-amber-900"
        >
          <p className="font-medium">
            Registro guardado en el {fechaCorta(estado.fecha)}.
          </p>
          <p className="mt-1">
            La tabla de abajo está filtrada
            {rango.desde === rango.hasta
              ? ` al ${fechaCorta(rango.desde)}`
              : ` del ${fechaCorta(rango.desde)} al ${fechaCorta(rango.hasta)}`}
            , así que la fila no aparece ahí.
          </p>
          <Link
            href={`/registro?desde=${estado.fecha}&hasta=${estado.fecha}`}
            className="boton-suave mt-2.5"
          >
            Ver el {fechaCorta(estado.fecha)}
          </Link>
        </div>
      )}
    </form>
  );
}
