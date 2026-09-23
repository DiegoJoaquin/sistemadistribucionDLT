"use client";

import Link from "next/link";
import { useActionState, useEffect, useId, useRef, useState } from "react";
import { useFormStatus } from "react-dom";
import { SelectorCuenta } from "@/componentes/SelectorCuenta";
import { crearRegistro, type Resultado } from "@/lib/datos/acciones";
import { TIPOS_INSTAGRAM } from "@/lib/dominio/categorias";
import { estaEnRango, fechaCorta } from "@/lib/dominio/formato";
import { categoriasDeRed, tieneAlcanceRed } from "@/lib/dominio/redes";
import type { CuentaRow } from "@/lib/supabase/tipos-db";

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
  cuentas,
}: {
  hoy: string;
  /** Rango que está filtrado en la tabla de abajo. */
  rango: { desde: string; hasta: string };
  /** Cuentas activas, las únicas que se pueden elegir al cargar. */
  cuentas: CuentaRow[];
}) {
  const [estado, accion] = useActionState<Resultado | null, FormData>(
    crearRegistro,
    null,
  );
  const [cuentaId, setCuentaId] = useState<string>(cuentas[0]?.id ?? "");
  const [verPerfil, setVerPerfil] = useState(false);
  const form = useRef<HTMLFormElement>(null);

  const cuenta = cuentas.find((c) => c.id === cuentaId);
  const categorias = cuenta ? categoriasDeRed(cuenta.red) : [];
  const conAlcance = cuenta ? tieneAlcanceRed(cuenta.red) : true;
  // §3.2 — Reactivo/Normal solo existe en Instagram.
  const conTipo = cuenta?.red === "Instagram";

  /*
   * Se guardó, pero en una fecha que la tabla de abajo no está mostrando. Sin
   * avisar, esto se ve como si el registro no se hubiera guardado.
   */
  const fueraDelRango =
    estado?.ok === true &&
    estado.fecha !== undefined &&
    !estaEnRango(estado.fecha, rango.desde, rango.hasta);

  // Al guardar bien se limpian las métricas pero se mantienen fecha y cuenta:
  // casi siempre se cargan varias publicaciones seguidas de la misma cuenta.
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
        "hashtag",
      ]) {
        const el = f.elements.namedItem(campo);
        if (el instanceof HTMLInputElement) el.value = "";
      }
      const pub = f.elements.namedItem("publicaciones");
      if (pub instanceof HTMLInputElement) pub.value = "1";
    }
  }, [estado]);

  if (cuentas.length === 0) {
    return (
      <div className="tarjeta p-4">
        <p className="text-sm text-[var(--color-tinta-suave)]">
          No hay ninguna cuenta activa.{" "}
          <Link href="/cuentas" className="underline underline-offset-2">
            Agrega una en Cuentas
          </Link>{" "}
          para poder registrar publicaciones.
        </p>
      </div>
    );
  }

  return (
    <form ref={form} action={accion} className="tarjeta p-4">
      <div className="mb-3 flex items-baseline justify-between gap-2">
        <h2 className="text-sm font-semibold">Agregar publicaciones del día</h2>
        <p className="text-xs text-[var(--color-tinta-tenue)]">
          Una fila por publicación
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
          <label className="etiqueta" htmlFor="f-cuenta">
            Cuenta
          </label>
          <SelectorCuenta
            id="f-cuenta"
            cuentas={cuentas}
            valor={cuentaId}
            onCambio={setCuentaId}
          />
        </div>

        <div className="space-y-1">
          <label className="etiqueta" htmlFor="f-categoria">
            Formato
          </label>
          <select
            id="f-categoria"
            name="categoria"
            /* La clave reinicia el selector al cambiar de cuenta; si no,
               mantendría la opción elegida para la red anterior. */
            key={cuenta?.red ?? "sin-cuenta"}
            className="campo disabled:bg-[var(--color-realce)] disabled:text-[var(--color-tinta-tenue)]"
            disabled={categorias.length === 0}
          >
            {categorias.length === 0 ? (
              <option value="">sin categorías</option>
            ) : (
              <>
                {/* Con una sola categoría no hay nada que elegir. */}
                {categorias.length > 1 && <option value="">— elegir —</option>}
                {categorias
                  // En Instagram el tipo va en su propio campo.
                  .filter((c) => !TIPOS_INSTAGRAM.includes(c as never))
                  .map((c) => (
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
        {/* §3.2 — la otra clasificación de Instagram, en su propio campo. */}
        <div className="space-y-1">
          <label className="etiqueta" htmlFor="f-tipo">
            Tipo
          </label>
          <select
            id="f-tipo"
            name="tipo"
            key={`tipo-${cuenta?.red ?? "sin"}`}
            className="campo disabled:bg-[var(--color-realce)] disabled:text-[var(--color-tinta-tenue)]"
            disabled={!conTipo}
          >
            {conTipo ? (
              <>
                <option value="">— sin clasificar —</option>
                {TIPOS_INSTAGRAM.map((t) => (
                  <option key={t} value={t}>
                    {t}
                  </option>
                ))}
              </>
            ) : (
              <option value="">solo en Instagram</option>
            )}
          </select>
        </div>

        <div className="space-y-1">
          <label className="etiqueta" htmlFor="f-hashtag">
            Hashtag o serie
          </label>
          <input
            id="f-hashtag"
            name="hashtag"
            type="text"
            maxLength={120}
            placeholder="#FECHA21xDLT"
            className="campo"
          />
          <p className="text-[11px] leading-tight text-[var(--color-tinta-tenue)]">
            Es el corte del reporte semanal
          </p>
        </div>

        <CampoNumero
          nombre="alcance"
          etiqueta="Alcance"
          deshabilitado={!conAlcance}
          ayuda={conAlcance ? undefined : "YouTube no lo entrega"}
        />
        <CampoNumero nombre="visualizaciones" etiqueta="Visualizaciones" />
      </div>

      <div className="mt-3 grid grid-cols-2 gap-3 sm:grid-cols-4">
        <CampoNumero nombre="interacciones" etiqueta="Interacciones" />
        <CampoNumero nombre="nuevos_seguidores" etiqueta="Nuevos seguidores" />
        <div className="space-y-1 sm:col-span-2">
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

      <div className="mt-3">
        <label className="etiqueta" htmlFor="f-enlace">
          Enlace <span className="normal-case">(opcional)</span>
        </label>
        <input
          id="f-enlace"
          name="enlace"
          type="url"
          placeholder="https://…"
          className="campo mt-1"
        />
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
