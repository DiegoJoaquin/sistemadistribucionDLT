"use client";

import { useActionState, useState } from "react";
import { useFormStatus } from "react-dom";
import {
  crearLineaBaseDesdeRegistro,
  type ResultadoBaseDesdeRegistro,
} from "@/lib/datos/acciones";
import type { MesConRegistros } from "@/lib/datos/consultas";
import { mesLargo } from "@/lib/dominio/formato";

function Boton({ rehacer }: { rehacer: boolean }) {
  const { pending } = useFormStatus();
  return (
    <button type="submit" className="boton" disabled={pending}>
      {pending ? "Armando…" : rehacer ? "Rehacer línea base" : "Armar línea base"}
    </button>
  );
}

/**
 * Armar la línea base de un mes con lo que ya está en el registro.
 *
 * Es el camino normal desde que el registro guarda una fila por publicación con
 * el desglose completo. Antes la única forma era volver a subir las
 * exportaciones del mes, que es trabajo que no cambia ningún número — y encima
 * obliga a acordarse de cuáles eran los archivos de ese mes.
 *
 * El mes va como lista y no como campo de fecha a propósito: solo se puede
 * elegir un mes que tenga registros, y cada opción dice cuántas publicaciones
 * trae. Un campo libre deja escribir un mes vacío y enterarse después.
 */
export function FormularioBaseDesdeRegistro({
  meses,
  mesActual,
}: {
  meses: MesConRegistros[];
  /** "YYYY-MM" del mes en curso, calculado en el servidor. */
  mesActual: string;
}) {
  const [estado, accion] = useActionState<ResultadoBaseDesdeRegistro | null, FormData>(
    crearLineaBaseDesdeRegistro,
    null,
  );

  /*
   * Viene elegido el último mes CERRADO, no el más reciente.
   *
   * `meses` llega del más nuevo al más viejo, y el primero es casi siempre el
   * mes en curso — en octubre, octubre. Una línea base de un mes a medias es un
   * promedio de las publicaciones que van hasta hoy, así que la referencia
   * contra la que se compara todo cambiaría cada vez que se carga un día más.
   * Lo que se quiere en octubre es septiembre.
   */
  const [mes, setMes] = useState(
    (meses.find((m) => m.mes < mesActual) ?? meses[0])?.mes ?? "",
  );

  const elegido = meses.find((m) => m.mes === mes);
  const rehacer = (elegido?.publicacionesEnBase ?? 0) > 0;
  const sinCerrar = mes === mesActual;

  if (meses.length === 0) {
    return (
      <div className="tarjeta p-4">
        <h2 className="text-sm font-semibold">Armar la línea base desde el registro</h2>
        <p className="mt-1 text-sm text-[var(--color-tinta-suave)]">
          Todavía no hay ningún mes con registros cargados. En cuanto subas
          publicaciones al registro, vas a poder convertir ese mes en línea base
          sin volver a importar los archivos.
        </p>
      </div>
    );
  }

  return (
    <form action={accion} className="tarjeta p-4">
      <h2 className="text-sm font-semibold">Armar la línea base desde el registro</h2>
      <p className="mt-1 max-w-3xl text-sm text-[var(--color-tinta-suave)]">
        Si las publicaciones del mes ya están cargadas en el registro, no hace
        falta volver a subir los archivos: se copian de ahí, con el mismo
        detalle por publicación.
      </p>

      <div className="mt-3 flex flex-wrap items-end gap-3">
        <div className="space-y-1">
          <label className="etiqueta" htmlFor="mes-base">
            Mes
          </label>
          <select
            id="mes-base"
            name="mes"
            value={mes}
            onChange={(e) => setMes(e.target.value)}
            className="campo"
          >
            {meses.map((m) => (
              <option key={m.mes} value={m.mes}>
                {mesLargo(`${m.mes}-01`)} · {m.publicaciones}{" "}
                {m.publicaciones === 1 ? "publicación" : "publicaciones"}
                {m.publicacionesEnBase > 0 ? " · ya tiene línea base" : ""}
              </option>
            ))}
          </select>
        </div>

        <label className="flex items-center gap-2 pb-1.5 text-sm">
          <input type="checkbox" name="activar" defaultChecked className="size-4" />
          Usarla como referencia activa
        </label>

        {/*
          Rehacer una línea base que ya tiene publicaciones borra lo que estaba,
          incluidas las reclasificaciones hechas a mano (§5.2). La casilla solo
          aparece cuando hace falta, para que nadie la marque por las dudas.
        */}
        {rehacer && (
          <label className="flex items-center gap-2 pb-1.5 text-sm text-amber-900">
            <input type="checkbox" name="reemplazar" className="size-4" />
            Reemplazar las {elegido?.publicacionesEnBase} que ya tiene
          </label>
        )}

        <Boton rehacer={rehacer} />
      </div>

      {/*
        §9.5 — lo que no se va a poder copiar, dicho ANTES de apretar el botón.
        Una fila cargada a mano que vale por tres publicaciones no cabe en la
        línea base, donde una fila ES una publicación.
      */}
      {elegido && elegido.agrupadas > 0 && (
        <p className="mt-2 text-[12px] leading-relaxed text-[var(--color-tinta-suave)]">
          {elegido.agrupadas}{" "}
          {elegido.agrupadas === 1 ? "fila de ese mes representa" : "filas de ese mes representan"}{" "}
          varias publicaciones en una sola —cargadas a mano— y no{" "}
          {elegido.agrupadas === 1 ? "se va" : "se van"} a copiar: en la línea
          base una fila es una publicación, y copiarla diría que una sola tuvo el
          alcance de todas.
        </p>
      )}

      {/*
        Un mes sin cerrar como referencia es una vara que se mueve sola. No se
        prohíbe —puede hacer falta para una prueba— pero no puede pasar en
        silencio.
      */}
      {sinCerrar && (
        <p className="mt-2 text-[12px] leading-relaxed text-amber-900">
          {mesLargo(`${mes}-01`)} todavía no termina. Una línea base de un mes a
          medias promedia solo las publicaciones que van hasta hoy, así que la
          referencia cambiaría cada vez que cargues un día más. Para comparar
          conviene un mes cerrado.
        </p>
      )}

      {rehacer && (
        <p className="mt-2 text-[12px] leading-relaxed text-amber-900">
          Ese mes ya tiene una línea base con {elegido?.publicacionesEnBase}{" "}
          publicaciones. Rehacerla la borra y la vuelve a armar desde el
          registro, así que se pierden las reclasificaciones hechas a mano.
        </p>
      )}

      {estado && (
        <div
          className={`mt-3 rounded-md border px-3 py-2 text-sm ${
            estado.ok
              ? "border-emerald-300 bg-emerald-50 text-emerald-900"
              : "border-red-300 bg-red-50 text-red-900"
          }`}
        >
          <p>{estado.mensaje}</p>

          {estado.detalle && (
            <ul className="mt-1 space-y-0.5 text-[12px]">
              {estado.detalle.activada && (
                <li>
                  Quedó marcada como referencia activa: las variaciones del panel
                  y del catastro ya se comparan contra{" "}
                  {mesLargo(`${estado.detalle.mes}-01`)}.
                </li>
              )}
              {estado.detalle.reemplazo > 0 && (
                <li>
                  Se reemplazaron {estado.detalle.reemplazo} publicaciones que
                  tenía antes.
                </li>
              )}
              {estado.detalle.agrupadas > 0 && (
                <li>
                  {estado.detalle.agrupadas}{" "}
                  {estado.detalle.agrupadas === 1 ? "fila quedó" : "filas quedaron"} fuera
                  por representar {estado.detalle.publicacionesAgrupadas}{" "}
                  publicaciones entre todas (§9.5).
                </li>
              )}
              {estado.detalle.sinHora > 0 && (
                <li>
                  {estado.detalle.sinHora}{" "}
                  {estado.detalle.sinHora === 1 ? "no traía" : "no traían"} hora de
                  publicación —se cargaron a mano— y{" "}
                  {estado.detalle.sinHora === 1 ? "quedó" : "quedaron"} a la
                  medianoche de su día. No afecta a ningún promedio.
                </li>
              )}
              {estado.detalle.noEntraron > 0 && (
                <li>
                  {estado.detalle.noEntraron}{" "}
                  {estado.detalle.noEntraron === 1 ? "no entró" : "no entraron"}: revisa
                  el detalle de arriba.
                </li>
              )}
            </ul>
          )}
        </div>
      )}
    </form>
  );
}
