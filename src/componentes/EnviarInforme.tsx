"use client";

import { useActionState, useId, useState } from "react";
import { useFormStatus } from "react-dom";
import {
  enviarInformeCliente,
  type ResultadoEnvioReporte,
} from "@/lib/datos/acciones";
import {
  type FaltanteCorreo,
  MAXIMO_DESTINATARIOS,
  parsearDestinatarios,
} from "@/lib/correo/direcciones";

function Confirmar() {
  const { pending } = useFormStatus();
  return (
    <button type="submit" className="boton" disabled={pending}>
      {pending ? "Enviando…" : "Sí, enviar ahora"}
    </button>
  );
}

/**
 * Enviar el informe de un cliente por correo, a quien se escriba en el campo.
 *
 * El destinatario va abierto y no fijo como en el reporte semanal: el informe
 * se le manda a alguien del equipo para que lo reenvíe a quien corresponda, y
 * eso cambia según el cliente y la ocasión.
 *
 * La validación es inmediata: una dirección mal escrita se marca antes de
 * apretar nada, en vez de descubrirse cuando el servidor la rechaza. El
 * servidor la vuelve a validar igual — detrás de este botón está la dirección
 * de correo de la empresa.
 */
export function EnviarInforme({
  cliente,
  nombreCliente,
  desde,
  hasta,
  porDefecto,
  faltantes,
}: {
  cliente: string;
  nombreCliente: string;
  desde: string;
  hasta: string;
  /** Lo que viene escrito en el campo: los destinatarios configurados. */
  porDefecto: string[];
  /** Variables de entorno que faltan para poder enviar. */
  faltantes: FaltanteCorreo[];
}) {
  const [estado, accion] = useActionState<ResultadoEnvioReporte | null, FormData>(
    enviarInformeCliente,
    null,
  );
  const [para, setPara] = useState(porDefecto.join(", "));
  const [confirmando, setConfirmando] = useState(false);
  const id = useId();

  const { validos, invalidos } = parsearDestinatarios(para);
  const demasiados = validos.length > MAXIMO_DESTINATARIOS;
  const puedeEnviar = validos.length > 0 && invalidos.length === 0 && !demasiados;

  if (estado?.ok) {
    return (
      <div className="tarjeta border-emerald-200 bg-emerald-50 p-4">
        <p className="text-sm font-medium text-emerald-900">{estado.mensaje}</p>
        <p className="mt-1 text-[13px] text-emerald-900/80">
          Quien lo reciba puede reenviarlo tal cual: va con el formato completo.
        </p>
      </div>
    );
  }

  if (faltantes.length > 0) {
    return (
      <div className="tarjeta p-4">
        <h2 className="text-sm font-semibold">Enviar por correo</h2>
        <p className="mt-1 text-sm text-[var(--color-tinta-suave)]">
          Todavía no está configurado. Falta definir{" "}
          {faltantes.map((f) => f.variable).join(", ")} en Vercel. Mientras
          tanto, el informe se copia o se descarga con los botones de arriba.
        </p>
      </div>
    );
  }

  return (
    <div className="tarjeta p-4">
      <h2 className="text-sm font-semibold">Enviar por correo</h2>
      <p className="mt-0.5 text-[13px] text-[var(--color-tinta-suave)]">
        Se lo mandas a alguien del equipo y esa persona lo reenvía a quien
        corresponda. Llega con el formato completo, igual que el reporte
        semanal.
      </p>

      <div className="mt-3 space-y-1">
        <label className="etiqueta" htmlFor={`${id}-para`}>
          Para
        </label>
        <input
          id={`${id}-para`}
          type="text"
          value={para}
          onChange={(e) => {
            setPara(e.target.value);
            // Cambiar el destinatario invalida la confirmación anterior.
            setConfirmando(false);
          }}
          placeholder="nombre@dltsports.com, otra@dltsports.com"
          className="campo"
          autoComplete="off"
          spellCheck={false}
        />
        <p className="text-[11px] leading-tight text-[var(--color-tinta-tenue)]">
          Una o varias, separadas por coma.
        </p>
      </div>

      {invalidos.length > 0 && (
        <p className="mt-2 text-[13px] text-red-700">
          Esto no parece una dirección de correo:{" "}
          <strong>{invalidos.join(", ")}</strong>
        </p>
      )}

      {demasiados && (
        <p className="mt-2 text-[13px] text-red-700">
          Son {validos.length} destinatarios y el máximo es{" "}
          {MAXIMO_DESTINATARIOS}. Mándaselo a una persona y que ella lo reenvíe.
        </p>
      )}

      {!confirmando ? (
        <div className="mt-3 flex flex-wrap items-center gap-3">
          <button
            type="button"
            className="boton"
            onClick={() => setConfirmando(true)}
            disabled={!puedeEnviar}
          >
            Enviar por correo
          </button>
          {validos.length === 0 && invalidos.length === 0 && (
            <span className="text-[13px] text-[var(--color-tinta-suave)]">
              Escribe a quién mandárselo
            </span>
          )}
        </div>
      ) : (
        <form
          action={accion}
          className="mt-3 rounded-md border border-[var(--color-filete-fuerte)] bg-[var(--color-realce)]/60 p-3"
        >
          <input type="hidden" name="cliente" value={cliente} />
          <input type="hidden" name="desde" value={desde} />
          <input type="hidden" name="hasta" value={hasta} />
          <input type="hidden" name="para" value={validos.join(", ")} />
          <p className="text-sm">
            Se va a enviar el informe de <strong>{nombreCliente}</strong> a{" "}
            <strong>{validos.join(" y ")}</strong>. El correo no se puede
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
        </form>
      )}

      {estado && !estado.ok && (
        <p role="alert" className="mt-3 text-sm text-red-700">
          {estado.mensaje}
        </p>
      )}
    </div>
  );
}
