"use client";

import Link from "next/link";
import { useState } from "react";
import {
  importarPublicaciones,
  type ResultadoImportRegistro,
} from "@/lib/datos/acciones";
import { fechaCorta } from "@/lib/dominio/formato";
import type { ResultadoImport } from "@/lib/importar/tipos";

const NOMBRE_FUENTE: Record<string, string> = {
  meta: "Meta Business Suite",
  iconosquare: "Iconosquare",
  tiktok: "TikTok",
  youtube: "YouTube",
  manual: "carga a mano",
};

/** Un archivo elegido, desde que se lee hasta que se carga. */
interface Archivo {
  nombre: string;
  lectura: ResultadoImport | null;
  payload: string | null;
  error: string | null;
  resultado: ResultadoImportRegistro | null;
}

/**
 * Subir las exportaciones y que el registro se llene solo.
 *
 * Se pueden elegir varios archivos a la vez —los de cada red de la semana— y
 * cada uno se reconoce solo: la red y la cuenta salen del propio archivo. Se
 * cargan uno tras otro y cada uno muestra su resultado.
 *
 * Los archivos se leen ACÁ, en el navegador, y al servidor solo viajan las
 * filas extraídas. Antes se subía el archivo entero a una acción de servidor, y
 * con un export de varios meses la página se ponía en blanco: Next rechaza los
 * cuerpos de más de 1 MB antes de ejecutar la acción, así que no había forma de
 * mostrar un error.
 */
export function FormularioImportarPublicaciones({
  rango,
}: {
  /** El rango que está filtrado abajo: se propone como rango a importar. */
  rango: { desde: string; hasta: string };
}) {
  const [abierto, setAbierto] = useState(false);
  const [limitar, setLimitar] = useState(false);
  const [leyendo, setLeyendo] = useState(false);
  const [cargando, setCargando] = useState(false);
  const [archivos, setArchivos] = useState<Archivo[]>([]);

  const elegir = async (lista: FileList | null) => {
    const elegidos = lista ? [...lista] : [];
    setArchivos(elegidos.map((f) => ({ nombre: f.name, lectura: null, payload: null, error: null, resultado: null })));
    if (elegidos.length === 0) return;

    setLeyendo(true);
    try {
      // Import dinámico: el megabyte de `xlsx` solo se carga si hay archivo.
      const { aPayload, leerEnNavegador } = await import("@/lib/importar/en-navegador");
      const leidos: Archivo[] = [];
      for (const f of elegidos) {
        const r = await leerEnNavegador(f);
        if (!r.ok) {
          leidos.push({ nombre: f.name, lectura: null, payload: null, error: r.mensaje, resultado: null });
          continue;
        }
        const p = aPayload(r.resultado);
        leidos.push({
          nombre: f.name,
          lectura: r.resultado,
          payload: p.ok ? p.datos : null,
          error: p.ok ? null : p.mensaje,
          resultado: null,
        });
      }
      setArchivos(leidos);
    } finally {
      setLeyendo(false);
    }
  };

  const cargar = async (form: HTMLFormElement) => {
    setCargando(true);
    try {
      const desde = (form.elements.namedItem("desde") as HTMLInputElement | null)?.value ?? "";
      const hasta = (form.elements.namedItem("hasta") as HTMLInputElement | null)?.value ?? "";
      for (let i = 0; i < archivos.length; i++) {
        const a = archivos[i];
        if (!a.payload || a.resultado?.ok) continue;
        const fd = new FormData();
        fd.set("datos", a.payload);
        if (limitar) {
          fd.set("desde", desde);
          fd.set("hasta", hasta);
        }
        let resultado: ResultadoImportRegistro;
        try {
          resultado = await importarPublicaciones(null, fd);
        } catch (e) {
          resultado = { ok: false, mensaje: e instanceof Error ? e.message : "No se pudo cargar." };
        }
        setArchivos((previos) => previos.map((x, k) => (k === i ? { ...x, resultado } : x)));
      }
    } finally {
      setCargando(false);
    }
  };

  const listos = archivos.filter((a) => a.payload && !a.resultado?.ok).length;

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
            Sube los archivos de Meta, Iconosquare, TikTok, YouTube o YouTube Studio —varios a la vez— y
            las filas se crean solas, una por publicación
          </span>
        </span>
        <span className="shrink-0 text-xs text-[var(--color-tinta-tenue)]">
          {abierto ? "ocultar" : "mostrar"}
        </span>
      </button>

      {abierto && (
        <form
          onSubmit={(e) => {
            e.preventDefault();
            void cargar(e.currentTarget);
          }}
          className="mt-3 border-t border-[var(--color-filete)] pt-3"
        >
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-[1fr_auto] sm:items-end">
            <div className="space-y-1">
              <label className="etiqueta" htmlFor="imp-archivo">
                Archivos (.csv de Meta o .xlsx de Iconosquare, TikTok, YouTube o YouTube Studio)
              </label>
              <input
                id="imp-archivo"
                type="file"
                accept=".csv,.xlsx"
                multiple
                required
                onChange={(e) => void elegir(e.target.files)}
                className="campo file:mr-3 file:rounded file:border-0 file:bg-[var(--color-realce)] file:px-2 file:py-1 file:text-sm"
              />
            </div>
            <button type="submit" className="boton" disabled={cargando || leyendo || listos === 0}>
              {cargando
                ? "Cargando…"
                : leyendo
                  ? "Leyendo archivos…"
                  : listos > 1
                    ? `Cargar ${listos} archivos`
                    : "Cargar publicaciones"}
            </button>
          </div>

          <p className="mt-2 text-[11px] leading-relaxed text-[var(--color-tinta-tenue)]">
            Puedes elegir los archivos de todas las redes de la semana juntos: cada uno se reconoce
            solo. La cuenta se detecta por el <strong>@usuario</strong> que trae el propio archivo,
            así que tiene que estar cargado en{" "}
            <Link href="/cuentas" className="underline underline-offset-2">
              Cuentas
            </Link>
            . Subir dos veces el mismo archivo no duplica nada: actualiza las publicaciones que ya
            estaban.
          </p>

          {archivos.length > 0 && (
            <ul className="mt-3 space-y-2">
              {archivos.map((a, i) => (
                <li key={`${a.nombre}-${i}`}>
                  <LineaArchivo a={a} />
                </li>
              ))}
            </ul>
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
                  <input id="imp-desde" name="desde" type="date" defaultValue={rango.desde} className="campo" />
                </div>
                <div className="space-y-1">
                  <label className="etiqueta" htmlFor="imp-hasta">
                    Hasta
                  </label>
                  <input id="imp-hasta" name="hasta" type="date" defaultValue={rango.hasta} className="campo" />
                </div>
                <p className="text-[11px] text-[var(--color-tinta-tenue)]">
                  Sin marcar, se importa todo lo que traiga cada archivo.
                </p>
              </div>
            )}
          </div>
        </form>
      )}
    </div>
  );
}

/** Lo que trae un archivo antes de cargarlo y, después, qué pasó. */
function LineaArchivo({ a }: { a: Archivo }) {
  if (a.resultado) return <Resumen nombre={a.nombre} estado={a.resultado} />;
  if (a.error) {
    return (
      <p role="alert" className="rounded-md border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-900">
        <span className="font-medium">{a.nombre}:</span> {a.error}
      </p>
    );
  }
  if (!a.lectura) {
    return <p className="text-[13px] text-[var(--color-tinta-suave)]">{a.nombre} · leyendo…</p>;
  }
  const l = a.lectura;
  return (
    <p className="rounded-md border border-[var(--color-filete)] bg-[var(--color-realce)] px-3 py-2 text-[13px]">
      <span className="text-[var(--color-tinta-tenue)]">{a.nombre}</span>
      <br />
      <strong>{l.publicaciones.length}</strong> {l.publicaciones.length === 1 ? "publicación" : "publicaciones"}{" "}
      {l.detectada.usuario ? (
        <>
          de <strong>@{l.detectada.usuario.replace(/^@/, "")}</strong>
        </>
      ) : (
        <>de {l.cuenta ?? "la cuenta"}</>
      )}{" "}
      · {l.detectada.red}
      {l.meses.length > 0 && (
        <>
          {" "}
          · {l.meses[0]}
          {l.meses.length > 1 && ` a ${l.meses.at(-1)}`}
        </>
      )}
    </p>
  );
}

function Resumen({ nombre, estado }: { nombre: string; estado: ResultadoImportRegistro }) {
  const d = estado.detalle;

  return (
    <div
      role="status"
      className={`rounded-md border px-3 py-2.5 text-sm ${
        estado.ok
          ? "border-emerald-200 bg-emerald-50 text-emerald-900"
          : "border-red-200 bg-red-50 text-red-900"
      }`}
    >
      <p className="text-[11px] opacity-70">{nombre}</p>
      <p className="font-medium">{estado.mensaje}</p>

      {d && (
        <>
          <ul className="mt-1.5 space-y-0.5 text-[13px]">
            <li>
              Cuenta: <strong>{d.cuenta}</strong> · {d.red} · {NOMBRE_FUENTE[d.fuente] ?? d.fuente}
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
            {d.fueraDeRango > 0 && <li>{d.fueraDeRango} quedaron fuera del rango que pediste.</li>}
            {d.repetidasEnArchivo > 0 && (
              <li>
                {d.repetidasEnArchivo} venían repetidas dentro del propio archivo y se contaron una sola
                vez.
              </li>
            )}
          </ul>

          {d.hashtags.length > 0 && (
            <div className="mt-2">
              <p className="text-[11px] font-medium uppercase tracking-wide opacity-70">Hashtags de este lote</p>
              <ul className="mt-1 flex flex-wrap gap-1.5">
                {d.hashtags.slice(0, 40).map((h) => (
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
        </>
      )}
    </div>
  );
}
