"use client";

import { useActionState, useState } from "react";
import { useFormStatus } from "react-dom";
import { importarArchivo, type ResultadoImportar } from "@/lib/datos/acciones";

function Boton() {
  const { pending } = useFormStatus();
  return (
    <button type="submit" className="boton" disabled={pending}>
      {pending ? "Leyendo archivo…" : "Importar"}
    </button>
  );
}

export function FormularioImportar({ mesPorDefecto }: { mesPorDefecto: string }) {
  const [estado, accion] = useActionState<ResultadoImportar | null, FormData>(
    importarArchivo,
    null,
  );
  const [nombre, setNombre] = useState<string | null>(null);

  return (
    <form action={accion} className="tarjeta p-4">
      <h2 className="text-sm font-semibold">Importar una exportación</h2>
      <p className="mt-1 text-sm text-[var(--color-tinta-suave)]">
        Sube el archivo tal cual lo entrega la plataforma. La cuenta y la red se
        detectan solas desde el propio archivo, así que no hay nada que elegir.
      </p>

      <div className="mt-3 grid grid-cols-1 gap-3 sm:grid-cols-[1fr_auto_auto] sm:items-end">
        <div className="space-y-1">
          <label className="etiqueta" htmlFor="archivo">
            Archivo (.csv de Meta o .xlsx de Iconosquare, TikTok o YouTube)
          </label>
          <input
            id="archivo"
            name="archivo"
            type="file"
            accept=".csv,.xlsx"
            required
            onChange={(e) => setNombre(e.target.files?.[0]?.name ?? null)}
            className="campo file:mr-3 file:rounded file:border-0 file:bg-[var(--color-realce)] file:px-2 file:py-1 file:text-sm"
          />
          {nombre && (
            <p className="truncate text-[11px] text-[var(--color-tinta-tenue)]">{nombre}</p>
          )}
        </div>

        <div className="space-y-1">
          <label className="etiqueta" htmlFor="mes">
            Mes de la línea base
          </label>
          <input
            id="mes"
            name="mes"
            type="month"
            required
            defaultValue={mesPorDefecto}
            className="campo"
          />
        </div>

        <Boton />
      </div>

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
            <ul className="mt-1.5 space-y-0.5 text-[13px]">
              <li>
                Plataforma: <strong>{estado.detalle.plataforma}</strong>
                {estado.detalle.cuenta && ` · ${estado.detalle.cuenta}`}
              </li>

              {estado.detalle.modo === "completar" && (
                <>
                  <li>
                    Ya había publicaciones de otra exportación para esta
                    plataforma, así que este archivo solo{" "}
                    <strong>completó campos vacíos</strong> — no agregó filas.
                  </li>
                  {estado.detalle.camposCompletados.length > 0 && (
                    <li>Campos completados → {estado.detalle.camposCompletados.join(" · ")}</li>
                  )}
                  {estado.detalle.desfaseHoras !== null && (
                    <li>
                      Desfase horario entre las dos fuentes:{" "}
                      <strong>
                        {estado.detalle.desfaseHoras > 0 ? "+" : ""}
                        {estado.detalle.desfaseHoras} h
                      </strong>{" "}
                      ({estado.detalle.desfaseSegun === "captions"
                        ? "estimado desde los propios textos"
                        : "valor por defecto"}
                      )
                    </li>
                  )}
                </>
              )}

              {estado.detalle.otroMes > 0 && (
                <li>
                  {estado.detalle.otroMes}{" "}
                  {estado.detalle.otroMes === 1
                    ? "publicación del archivo quedó fuera"
                    : "publicaciones del archivo quedaron fuera"}{" "}
                  por ser de otro mes.
                </li>
              )}

              {estado.detalle.advertencias.map((a) => (
                <li key={a} className="text-amber-900">
                  ⚠ {a}
                </li>
              ))}
            </ul>
          )}
        </div>
      )}
    </form>
  );
}
