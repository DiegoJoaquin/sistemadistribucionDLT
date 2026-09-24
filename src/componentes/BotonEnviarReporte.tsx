"use client";

import Link from "next/link";
import { useActionState, useState } from "react";
import { useFormStatus } from "react-dom";
import {
  enviarReporteSemanal,
  type ResultadoEnvioReporte,
} from "@/lib/datos/acciones";
import { fechaHoraCorta } from "@/lib/dominio/formato";
import type { EnvioReporte } from "@/lib/datos/consultas";
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
 * Enviar el reporte por correo, en dos pasos.
 *
 * El segundo paso no es burocracia: el correo sale a los jefes y no se puede
 * deshacer, así que un clic accidental tiene costo. La confirmación muestra a
 * quién va antes de mandarlo.
 */
export function BotonEnviarReporte({
  semana,
  destinatarios,
  envios,
  faltantes,
  hayDatos,
}: {
  /** Lunes de la semana. */
  semana: string;
  destinatarios: string[];
  /** Envíos anteriores de esta misma semana, del más reciente al más antiguo. */
  envios: EnvioReporte[];
  /** Variables de entorno que faltan para poder enviar. */
  faltantes: FaltanteCorreo[];
  hayDatos: boolean;
}) {
  const [estado, accion] = useActionState<ResultadoEnvioReporte | null, FormData>(
    enviarReporteSemanal,
    null,
  );
  const [confirmando, setConfirmando] = useState(false);

  // Se envió bien en esta misma visita: no ofrecer el botón otra vez.
  if (estado?.ok) {
    return (
      <div className="tarjeta border-emerald-200 bg-emerald-50 p-4">
        <p className="text-sm font-medium text-emerald-900">{estado.mensaje}</p>
        {estado.destinatarios && (
          <p className="mt-1 text-[13px] text-emerald-900/80">
            {estado.destinatarios.join(" · ")}
          </p>
        )}
      </div>
    );
  }

  if (faltantes.length > 0) {
    return (
      <div className="tarjeta p-4">
        <h2 className="text-sm font-semibold">Enviar por correo</h2>
        <p className="mt-1 text-sm text-[var(--color-tinta-suave)]">
          Todavía no está configurado. Falta definir{" "}
          {faltantes.length === 1 ? "esta variable" : "estas variables"} de
          entorno en Vercel:
        </p>
        <ul className="mt-2 space-y-1">
          {faltantes.map((f) => (
            <li key={f.variable} className="text-[13px]">
              <code className="rounded bg-[var(--color-realce)] px-1.5 py-0.5 font-medium">
                {f.variable}
              </code>{" "}
              <span className="text-[var(--color-tinta-suave)]">— {f.para}</span>
            </li>
          ))}
        </ul>
        <p className="mt-2.5 text-xs text-[var(--color-tinta-tenue)]">
          Mientras tanto, el reporte se copia o se descarga con los botones de
          abajo.
        </p>
      </div>
    );
  }

  const ultimo = envios[0];

  return (
    <div className="tarjeta p-4">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h2 className="text-sm font-semibold">Enviar por correo</h2>
          <p className="mt-0.5 text-[13px] text-[var(--color-tinta-suave)]">
            A {destinatarios.join(" y ")}.
          </p>
        </div>

        {!confirmando && (
          <button
            type="button"
            className="boton"
            onClick={() => setConfirmando(true)}
            disabled={!hayDatos}
          >
            Enviar por correo
          </button>
        )}
      </div>

      {/* Ya se mandó esta semana: hay que decirlo antes, no después. */}
      {ultimo && (
        <div className="mt-3 rounded-md border border-amber-300 bg-amber-50 px-3 py-2.5 text-[13px] text-amber-900">
          <p className="font-medium">
            Esta semana ya se envió{" "}
            {envios.length > 1 && `${envios.length} veces, la última `}el{" "}
            {fechaHoraCorta(ultimo.enviado_en)}.
          </p>
          <p className="mt-0.5">
            La envió {ultimo.autor?.nombre ?? "alguien del equipo"} a{" "}
            {ultimo.destinatarios.join(", ")}.
          </p>
        </div>
      )}

      {!hayDatos && (
        <p className="mt-3 text-[13px] text-[var(--color-tinta-suave)]">
          Esta semana no tiene publicaciones cargadas, así que el correo saldría
          vacío.{" "}
          <Link href="/registro" className="underline underline-offset-2">
            Carga las exportaciones
          </Link>{" "}
          antes de enviarlo.
        </p>
      )}

      {confirmando && (
        <form
          action={accion}
          className="mt-3 rounded-md border border-[var(--color-filete-fuerte)] bg-[var(--color-realce)]/60 p-3"
        >
          <input type="hidden" name="semana" value={semana} />
          <p className="text-sm">
            Se va a enviar el reporte de esta semana a{" "}
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
