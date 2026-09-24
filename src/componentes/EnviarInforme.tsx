"use client";

import { useActionState, useState } from "react";
import { useFormStatus } from "react-dom";
import {
  enviarInformeCliente,
  type ResultadoEnvioReporte,
} from "@/lib/datos/acciones";
import type { FaltanteCorreo } from "@/lib/correo/direcciones";

function Confirmar() {
  const { pending } = useFormStatus();
  return (
    <button type="submit" className="boton" disabled={pending}>
      {pending ? "Enviando…" : "Sí, enviar ahora"}
    </button>
  );
}

/**
 * Enviar el informe de un cliente por correo, en dos pasos.
 *
 * Va a los mismos destinatarios que el reporte semanal, no al cliente:
 * mandarle un correo a un tercero desde la dirección de DLT es otra decisión.
 * La confirmación muestra a quién va antes de mandarlo.
 */
export function EnviarInforme({
  cliente,
  nombreCliente,
  desde,
  hasta,
  destinatarios,
  faltantes,
}: {
  cliente: string;
  nombreCliente: string;
  desde: string;
  hasta: string;
  destinatarios: string[];
  faltantes: FaltanteCorreo[];
}) {
  const [estado, accion] = useActionState<ResultadoEnvioReporte | null, FormData>(
    enviarInformeCliente,
    null,
  );
  const [confirmando, setConfirmando] = useState(false);

  if (estado?.ok) {
    return (
      <p className="rounded-md border border-emerald-200 bg-emerald-50 px-3 py-2 text-sm text-emerald-900">
        {estado.mensaje}
      </p>
    );
  }

  if (faltantes.length > 0) {
    return (
      <p className="text-[13px] text-[var(--color-tinta-tenue)]">
        Para mandarlo por correo falta configurar{" "}
        {faltantes.map((f) => f.variable).join(", ")} en Vercel. Mientras tanto,
        cópialo o descárgalo con los botones de arriba.
      </p>
    );
  }

  if (!confirmando) {
    return (
      <div className="flex flex-wrap items-center gap-3">
        <button type="button" className="boton" onClick={() => setConfirmando(true)}>
          Enviar por correo
        </button>
        <span className="text-[13px] text-[var(--color-tinta-suave)]">
          A {destinatarios.join(" y ")}
        </span>
        {estado && !estado.ok && (
          <p role="alert" className="text-sm text-red-700">
            {estado.mensaje}
          </p>
        )}
      </div>
    );
  }

  return (
    <form
      action={accion}
      className="rounded-md border border-[var(--color-filete-fuerte)] bg-[var(--color-realce)]/60 p-3"
    >
      <input type="hidden" name="cliente" value={cliente} />
      <input type="hidden" name="desde" value={desde} />
      <input type="hidden" name="hasta" value={hasta} />
      <p className="text-sm">
        Se va a enviar el informe de <strong>{nombreCliente}</strong> a{" "}
        <strong>{destinatarios.join(" y ")}</strong>. El correo no se puede
        deshacer.
      </p>
      <div className="mt-2.5 flex flex-wrap items-center gap-3">
        <Confirmar />
        <button
          type="button"
          className="boton-suave"
          onClick={() => setConfirmando(false)}
        >
          Cancelar
        </button>
      </div>
      {estado && !estado.ok && (
        <p role="alert" className="mt-2 text-sm text-red-700">
          {estado.mensaje}
        </p>
      )}
    </form>
  );
}
