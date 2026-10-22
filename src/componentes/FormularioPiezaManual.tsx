"use client";

import { useActionState, useId, useState } from "react";
import { useFormStatus } from "react-dom";
import { crearPiezaManual, type ResultadoPieza } from "@/lib/datos/acciones-marcas";
import { FORMATOS_PIEZA_MANUAL } from "@/lib/dominio/marcas";

function Guardar() {
  const { pending } = useFormStatus();
  return (
    <button type="submit" className="boton" disabled={pending}>
      {pending ? "Guardando…" : "Sumar al conteo"}
    </button>
  );
}

/**
 * Botón y formulario para sumar a mano una pieza de marca: lo que el global no
 * reconoce solo, como las historias, un video que se subió sin hashtag o una
 * acción en una cuenta que no está cargada.
 */
export function FormularioPiezaManual({
  marcas,
  cuentas,
  marcaFija,
  hoy,
}: {
  marcas: { id: string; nombre: string }[];
  cuentas: { id: string; nombre: string; red: string }[];
  /** En la página de una marca, la marca ya viene elegida. */
  marcaFija?: string;
  hoy: string;
}) {
  const [abierto, setAbierto] = useState(false);
  const [estado, accion] = useActionState<ResultadoPieza | null, FormData>(crearPiezaManual, null);
  const id = useId();

  if (!abierto) {
    return (
      <div className="flex flex-wrap items-center gap-3">
        <button type="button" className="boton" onClick={() => setAbierto(true)}>
          + Agregar pieza manual
        </button>
        {estado?.ok && estado.mensaje && (
          <p role="status" className="text-sm text-emerald-700">
            {estado.mensaje}
          </p>
        )}
      </div>
    );
  }

  return (
    <section className="tarjeta p-4">
      <h3 className="text-sm font-semibold">Agregar pieza manual</h3>
      <p className="mt-0.5 mb-3 text-[13px] text-[var(--color-tinta-suave)]">
        Para lo que no se reconoce solo: historias, videos sin hashtag o acciones en
        cuentas que no están cargadas. Si pones el enlace de una publicación que ya
        se contó sola, no se suma dos veces.
      </p>
      <form action={accion} className="space-y-3">
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-4">
          {marcaFija ? (
            <input type="hidden" name="marca_id" value={marcaFija} />
          ) : (
            <div className="space-y-1">
              <label className="etiqueta" htmlFor={`${id}-marca`}>
                Marca
              </label>
              <select id={`${id}-marca`} name="marca_id" required defaultValue="" className="campo">
                <option value="" disabled>
                  — elegir —
                </option>
                {marcas.map((m) => (
                  <option key={m.id} value={m.id}>
                    {m.nombre}
                  </option>
                ))}
              </select>
            </div>
          )}
          <div className="space-y-1">
            <label className="etiqueta" htmlFor={`${id}-fecha`}>
              Fecha
            </label>
            <input id={`${id}-fecha`} name="fecha" type="date" required defaultValue={hoy} className="campo" />
          </div>
          <div className="space-y-1">
            <label className="etiqueta" htmlFor={`${id}-cuenta`}>
              Cuenta <span className="normal-case">(opcional)</span>
            </label>
            <select id={`${id}-cuenta`} name="cuenta_id" defaultValue="" className="campo">
              <option value="">— sin cuenta —</option>
              {cuentas.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.nombre} · {c.red}
                </option>
              ))}
            </select>
          </div>
          <div className="space-y-1">
            <label className="etiqueta" htmlFor={`${id}-formato`}>
              Formato
            </label>
            <select id={`${id}-formato`} name="formato" defaultValue="Historia" className="campo">
              {FORMATOS_PIEZA_MANUAL.map((f) => (
                <option key={f} value={f}>
                  {f}
                </option>
              ))}
            </select>
          </div>
        </div>

        <div className="grid grid-cols-1 gap-3 sm:grid-cols-[6rem_minmax(0,1fr)_minmax(0,1fr)]">
          <div className="space-y-1">
            <label className="etiqueta" htmlFor={`${id}-cantidad`}>
              Cantidad
            </label>
            <input
              id={`${id}-cantidad`}
              name="cantidad"
              type="number"
              min={1}
              max={500}
              required
              defaultValue={1}
              className="campo"
            />
          </div>
          <div className="space-y-1">
            <label className="etiqueta" htmlFor={`${id}-descripcion`}>
              Qué se hizo
            </label>
            <input
              id={`${id}-descripcion`}
              name="descripcion"
              type="text"
              required
              maxLength={300}
              placeholder="Historias con Diegoat usando Crocs"
              className="campo"
            />
          </div>
          <div className="space-y-1">
            <label className="etiqueta" htmlFor={`${id}-enlace`}>
              Enlace <span className="normal-case">(opcional)</span>
            </label>
            <input
              id={`${id}-enlace`}
              name="enlace"
              type="url"
              maxLength={2000}
              placeholder="https://www.instagram.com/…"
              className="campo"
            />
          </div>
        </div>

        <div className="flex flex-wrap items-center gap-3">
          <Guardar />
          <button type="button" onClick={() => setAbierto(false)} className="boton-suave">
            Cerrar
          </button>
          {estado?.mensaje && (
            <p role="status" className={`text-sm ${estado.ok ? "text-emerald-700" : "text-red-700"}`}>
              {estado.mensaje}
            </p>
          )}
        </div>
      </form>
    </section>
  );
}
