"use client";

import { useActionState, useState } from "react";
import { useFormStatus } from "react-dom";
import {
  importarRegistroHistorico,
  type ResultadoHistorico,
} from "@/lib/datos/acciones";
import { fechaCorta } from "@/lib/dominio/formato";

function Boton() {
  const { pending } = useFormStatus();
  return (
    <button type="submit" className="boton" disabled={pending}>
      {pending ? "Leyendo el Excel…" : "Importar histórico"}
    </button>
  );
}

export function FormularioHistorico() {
  const [estado, accion] = useActionState<ResultadoHistorico | null, FormData>(
    importarRegistroHistorico,
    null,
  );
  const [nombre, setNombre] = useState<string | null>(null);
  const [reemplazar, setReemplazar] = useState(false);

  return (
    <form action={accion} className="tarjeta p-4">
      <h2 className="text-sm font-semibold">Traer el histórico del Excel</h2>
      <p className="mt-1 text-sm text-[var(--color-tinta-suave)]">
        Sube el archivo <strong>KPIs diarios</strong> y se importa su hoja de
        registro completa. La hoja se busca sola, y las filas que traen datos
        que no calzan con las reglas se corrigen o se dejan fuera — al final se
        te dice exactamente qué pasó con cada una.
      </p>

      <div className="mt-3 grid grid-cols-1 gap-3 sm:grid-cols-[1fr_auto] sm:items-end">
        <div className="space-y-1">
          <label className="etiqueta" htmlFor="archivo-historico">
            Excel de KPIs (.xlsx)
          </label>
          <input
            id="archivo-historico"
            name="archivo"
            type="file"
            accept=".xlsx"
            required
            onChange={(e) => setNombre(e.target.files?.[0]?.name ?? null)}
            className="campo file:mr-3 file:rounded file:border-0 file:bg-[var(--color-realce)] file:px-2 file:py-1 file:text-sm"
          />
          {nombre && (
            <p className="truncate text-[11px] text-[var(--color-tinta-tenue)]">{nombre}</p>
          )}
        </div>
        <Boton />
      </div>

      <label className="mt-3 flex items-start gap-2 text-[13px] text-[var(--color-tinta-suave)]">
        <input
          type="checkbox"
          name="reemplazar"
          checked={reemplazar}
          onChange={(e) => setReemplazar(e.target.checked)}
          className="mt-0.5"
        />
        <span>
          Reemplazar lo que ya haya en esos días.{" "}
          {reemplazar ? (
            <strong className="text-red-700">
              Se borrarán los registros existentes de las fechas que traiga el
              archivo, incluidos los que hayan cargado a mano.
            </strong>
          ) : (
            <span className="text-[var(--color-tinta-tenue)]">
              Sin marcar, las filas idénticas a una que ya está se omiten, así
              importar dos veces no duplica nada.
            </span>
          )}
        </span>
      </label>

      {estado && (
        <div
          role="status"
          className={`mt-3 rounded-md border px-3 py-2 text-sm ${
            estado.ok
              ? "border-emerald-200 bg-emerald-50 text-emerald-900"
              : "border-red-200 bg-red-50 text-red-900"
          }`}
        >
          <p className="font-medium">{estado.mensaje}</p>

          {estado.detalle && (
            <div className="mt-2 space-y-2 text-[13px]">
              <p>
                {fechaCorta(estado.detalle.desde)} a {fechaCorta(estado.detalle.hasta)} ·{" "}
                {estado.detalle.dias} días
                {estado.detalle.omitidas > 0 &&
                  ` · ${estado.detalle.omitidas} filas ya estaban y se omitieron`}
                {estado.detalle.reemplazadas > 0 &&
                  ` · ${estado.detalle.reemplazadas} filas anteriores reemplazadas`}
              </p>

              {estado.detalle.correcciones.length > 0 && (
                <div>
                  <p className="font-medium">Correcciones aplicadas</p>
                  <ul className="mt-0.5 space-y-0.5">
                    {estado.detalle.correcciones.map((c) => (
                      <li key={c.motivo} className="text-amber-900">
                        {c.veces}× {c.motivo}
                      </li>
                    ))}
                  </ul>
                </div>
              )}

              {estado.detalle.descartadas.length > 0 && (
                <div>
                  <p className="font-medium">
                    Filas que quedaron fuera ({estado.detalle.descartadas.length})
                  </p>
                  <ul className="mt-0.5 space-y-0.5">
                    {estado.detalle.descartadas.slice(0, 12).map((d) => (
                      <li key={d.filaExcel} className="text-amber-900">
                        Fila {d.filaExcel} del Excel · {d.motivo} · {d.detalle}
                      </li>
                    ))}
                    {estado.detalle.descartadas.length > 12 && (
                      <li className="text-[var(--color-tinta-tenue)]">
                        y {estado.detalle.descartadas.length - 12} más
                      </li>
                    )}
                  </ul>
                </div>
              )}
            </div>
          )}
        </div>
      )}
    </form>
  );
}
