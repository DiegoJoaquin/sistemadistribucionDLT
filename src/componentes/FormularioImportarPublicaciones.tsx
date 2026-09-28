"use client";

import Link from "next/link";
import { useState } from "react";
import { useFormStatus } from "react-dom";
import { useActionState } from "react";
import {
  importarPublicaciones,
  type ResultadoImportRegistro,
} from "@/lib/datos/acciones";
import { fechaCorta } from "@/lib/dominio/formato";
import type { ResultadoImport } from "@/lib/importar/tipos";

function Boton({ leyendo }: { leyendo: boolean }) {
  const { pending } = useFormStatus();
  return (
    <button type="submit" className="boton" disabled={pending || leyendo}>
      {pending ? "Guardando…" : leyendo ? "Leyendo archivo…" : "Cargar publicaciones"}
    </button>
  );
}

const NOMBRE_FUENTE: Record<string, string> = {
  meta: "Meta Business Suite",
  iconosquare: "Iconosquare",
  tiktok: "TikTok",
  youtube: "YouTube",
  manual: "carga a mano",
};

/**
 * Subir la exportación y que el registro se llene solo.
 *
 * El archivo se lee ACÁ, en el navegador, y al servidor solo viajan las filas
 * extraídas. Antes se subía el archivo entero a una acción de servidor, y con
 * un export de varios meses la página se ponía en blanco: Next rechaza los
 * cuerpos de más de 1 MB antes de ejecutar la acción, así que no había forma de
 * mostrar un error.
 *
 * De paso se gana algo: como el archivo ya está leído, se puede mostrar qué
 * trae —cuenta, publicaciones, período— ANTES de escribir nada.
 */
export function FormularioImportarPublicaciones({
  rango,
}: {
  /** El rango que está filtrado abajo: se propone como rango a importar. */
  rango: { desde: string; hasta: string };
}) {
  const [estado, accion] = useActionState<ResultadoImportRegistro | null, FormData>(
    importarPublicaciones,
    null,
  );
  const [abierto, setAbierto] = useState(false);
  const [limitar, setLimitar] = useState(false);

  const [nombre, setNombre] = useState<string | null>(null);
  const [leyendo, setLeyendo] = useState(false);
  const [lectura, setLectura] = useState<ResultadoImport | null>(null);
  const [payload, setPayload] = useState<string | null>(null);
  const [errorLectura, setErrorLectura] = useState<string | null>(null);

  const elegir = async (archivo: File | undefined) => {
    setLectura(null);
    setPayload(null);
    setErrorLectura(null);
    setNombre(archivo?.name ?? null);
    if (!archivo) return;

    setLeyendo(true);
    try {
      // Import dinámico: el megabyte de `xlsx` solo se carga si hay archivo.
      const { aPayload, leerEnNavegador } = await import("@/lib/importar/en-navegador");
      const r = await leerEnNavegador(archivo);
      if (!r.ok) {
        setErrorLectura(r.mensaje);
        return;
      }
      const p = aPayload(r.resultado);
      if (!p.ok) {
        setErrorLectura(p.mensaje);
        return;
      }
      setLectura(r.resultado);
      setPayload(p.datos);
    } finally {
      setLeyendo(false);
    }
  };

  return (
    <div className="tarjeta p-4">
      <button
        type="button"
        onClick={() => setAbierto((v) => !v)}
        className="flex w-full items-center justify-between gap-2 text-left"
        aria-expanded={abierto}
      >
        <span>
          <span className="text-sm font-semibold">Cargar desde una exportación</span>
          <span className="mt-0.5 block text-xs text-[var(--color-tinta-tenue)]">
            Sube el archivo de Meta, Iconosquare, TikTok o YouTube y las filas se
            crean solas, una por publicación
          </span>
        </span>
        <span className="shrink-0 text-xs text-[var(--color-tinta-tenue)]">
          {abierto ? "ocultar" : "mostrar"}
        </span>
      </button>

      {abierto && (
        <form
          action={(fd) => {
            if (payload) fd.set("datos", payload);
            return accion(fd);
          }}
          className="mt-3 border-t border-[var(--color-filete)] pt-3"
        >
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-[1fr_auto] sm:items-end">
            <div className="space-y-1">
              <label className="etiqueta" htmlFor="imp-archivo">
                Archivo (.csv de Meta o .xlsx de Iconosquare, TikTok o YouTube)
              </label>
              <input
                id="imp-archivo"
                type="file"
                accept=".csv,.xlsx"
                required
                onChange={(e) => void elegir(e.target.files?.[0])}
                className="campo file:mr-3 file:rounded file:border-0 file:bg-[var(--color-realce)] file:px-2 file:py-1 file:text-sm"
              />
              {nombre && (
                <p className="truncate text-[11px] text-[var(--color-tinta-tenue)]">
                  {nombre}
                </p>
              )}
            </div>
            <Boton leyendo={leyendo} />
          </div>

          <p className="mt-2 text-[11px] leading-relaxed text-[var(--color-tinta-tenue)]">
            La cuenta se detecta por el <strong>@usuario</strong> que trae el
            propio archivo, así que tiene que estar cargado en{" "}
            <Link href="/cuentas" className="underline underline-offset-2">
              Cuentas
            </Link>
            . Subir dos veces el mismo archivo no duplica nada: actualiza las
            publicaciones que ya estaban.
          </p>

          {leyendo && (
            <p className="mt-2 text-[13px] text-[var(--color-tinta-suave)]">
              Leyendo el archivo…
            </p>
          )}

          {errorLectura && (
            <p
              role="alert"
              className="mt-3 rounded-md border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-900"
            >
              {errorLectura}
            </p>
          )}

          {/* Ya se leyó: se puede decir qué trae antes de escribir nada. */}
          {lectura && (
            <p className="mt-3 rounded-md border border-[var(--color-filete)] bg-[var(--color-realce)] px-3 py-2 text-[13px]">
              <strong>{lectura.publicaciones.length}</strong>{" "}
              {lectura.publicaciones.length === 1 ? "publicación" : "publicaciones"} de{" "}
              <strong>@{(lectura.cuenta ?? "").replace(/^@/, "")}</strong> ·{" "}
              {lectura.detectada.red}
              {lectura.meses.length > 0 && (
                <>
                  {" "}
                  · {lectura.meses[0]}
                  {lectura.meses.length > 1 && ` a ${lectura.meses.at(-1)}`}
                </>
              )}
            </p>
          )}

          <div className="mt-3">
            <label className="flex items-center gap-2 text-[13px]">
              <input
                type="checkbox"
                checked={limitar}
                onChange={(e) => setLimitar(e.target.checked)}
                className="size-3.5"
              />
              Importar solo un rango de fechas
            </label>

            {limitar && (
              <div className="mt-2 flex flex-wrap items-end gap-3">
                <div className="space-y-1">
                  <label className="etiqueta" htmlFor="imp-desde">
                    Desde
                  </label>
                  <input
                    id="imp-desde"
                    name="desde"
                    type="date"
                    defaultValue={rango.desde}
                    className="campo"
                  />
                </div>
                <div className="space-y-1">
                  <label className="etiqueta" htmlFor="imp-hasta">
                    Hasta
                  </label>
                  <input
                    id="imp-hasta"
                    name="hasta"
                    type="date"
                    defaultValue={rango.hasta}
                    className="campo"
                  />
                </div>
                <p className="text-[11px] text-[var(--color-tinta-tenue)]">
                  Sin marcar, se importa todo lo que traiga el archivo.
                </p>
              </div>
            )}
          </div>

          {estado && <Resumen estado={estado} />}
        </form>
      )}
    </div>
  );
}

function Resumen({ estado }: { estado: ResultadoImportRegistro }) {
  const d = estado.detalle;

  return (
    <div
      role="status"
      className={`mt-3 rounded-md border px-3 py-2.5 text-sm ${
        estado.ok
          ? "border-emerald-200 bg-emerald-50 text-emerald-900"
          : "border-red-200 bg-red-50 text-red-900"
      }`}
    >
      <p className="font-medium">{estado.mensaje}</p>

      {d && (
        <>
          <ul className="mt-1.5 space-y-0.5 text-[13px]">
            <li>
              Cuenta: <strong>{d.cuenta}</strong> · {d.red} ·{" "}
              {NOMBRE_FUENTE[d.fuente] ?? d.fuente}
            </li>
            <li>
              Días cubiertos: {fechaCorta(d.desde)}
              {d.desde !== d.hasta && ` — ${fechaCorta(d.hasta)}`}
            </li>
            {d.sinFecha > 0 && (
              <li>
                {d.sinFecha}{" "}
                {d.sinFecha === 1
                  ? "publicación no traía fecha y quedó fuera"
                  : "publicaciones no traían fecha y quedaron fuera"}
                .
              </li>
            )}
            {d.fueraDeRango > 0 && (
              <li>{d.fueraDeRango} quedaron fuera del rango que pediste.</li>
            )}
            {d.repetidasEnArchivo > 0 && (
              <li>
                {d.repetidasEnArchivo} venían repetidas dentro del propio archivo
                y se contaron una sola vez.
              </li>
            )}
          </ul>

          {d.hashtags.length > 0 && (
            <div className="mt-2">
              <p className="text-[11px] font-medium uppercase tracking-wide opacity-70">
                Hashtags de este lote
              </p>
              <ul className="mt-1 flex flex-wrap gap-1.5">
                {d.hashtags.map((h) => (
                  <li
                    key={h.hashtag ?? "sin"}
                    className="rounded border border-current/20 bg-white/60 px-1.5 py-0.5 text-[12px]"
                  >
                    {h.hashtag ? `#${h.hashtag}` : "sin hashtag"}
                    <span className="ml-1 opacity-60">{h.n}</span>
                  </li>
                ))}
              </ul>
            </div>
          )}

          {d.advertencias.length > 0 && (
            <ul className="mt-2 space-y-0.5 text-[13px] text-amber-900">
              {d.advertencias.map((a) => (
                <li key={a}>⚠ {a}</li>
              ))}
            </ul>
          )}

          {estado.ok && (
            <p className="mt-2 text-[12px] opacity-80">
              Las métricas de perfil (visitas, vistas de seguidores y de no
              seguidores) no vienen en ninguna exportación: esas siguen yendo a
              mano.
            </p>
          )}
        </>
      )}
    </div>
  );
}
