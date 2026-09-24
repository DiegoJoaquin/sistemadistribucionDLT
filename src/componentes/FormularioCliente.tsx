"use client";

import { useActionState, useId } from "react";
import { useFormStatus } from "react-dom";
import {
  actualizarCliente,
  crearCliente,
  type ResultadoCliente,
} from "@/lib/datos/acciones";
import type { ClienteConHashtags } from "@/lib/datos/consultas";

function Guardar({ nuevo }: { nuevo: boolean }) {
  const { pending } = useFormStatus();
  return (
    <button type="submit" className="boton" disabled={pending}>
      {pending ? "Guardando…" : nuevo ? "Agregar cliente" : "Guardar"}
    </button>
  );
}

/**
 * Alta y edición de un cliente.
 *
 * Los hashtags van en un campo de texto libre, separados como sea: la lista
 * llega pegada de un correo o de un mensaje de WhatsApp y nadie la va a
 * formatear. Se normalizan al guardar —mayúsculas, sin numeral, sin tildes—
 * igual que en el registro, porque si se escribieran distinto el informe no
 * encontraría ninguna publicación y saldría vacío sin decir por qué.
 */
export function FormularioCliente({
  cliente,
  onCerrar,
}: {
  cliente?: ClienteConHashtags;
  onCerrar?: () => void;
}) {
  const nuevo = cliente === undefined;
  const [estado, accion] = useActionState<ResultadoCliente | null, FormData>(
    nuevo ? crearCliente : actualizarCliente,
    null,
  );
  const id = useId();

  return (
    <form action={accion} className="space-y-3">
      {cliente && <input type="hidden" name="id" value={cliente.id} />}

      <div className="grid grid-cols-1 gap-3 sm:grid-cols-[minmax(0,14rem)_minmax(0,1fr)]">
        <div className="space-y-1">
          <label className="etiqueta" htmlFor={`${id}-nombre`}>
            Nombre del cliente
          </label>
          <input
            id={`${id}-nombre`}
            name="nombre"
            type="text"
            required
            maxLength={80}
            defaultValue={cliente?.nombre ?? ""}
            placeholder="Sparta"
            className="campo"
          />
          <p className="text-[11px] leading-tight text-[var(--color-tinta-tenue)]">
            Como aparece en el informe
          </p>
        </div>

        <div className="space-y-1">
          <label className="etiqueta" htmlFor={`${id}-notas`}>
            Notas <span className="normal-case">(opcional)</span>
          </label>
          <input
            id={`${id}-notas`}
            name="notas"
            type="text"
            maxLength={1000}
            defaultValue={cliente?.notas ?? ""}
            placeholder="Contacto, vigencia del acuerdo, lo que sirva"
            className="campo"
          />
        </div>
      </div>

      <div className="space-y-1">
        <label className="etiqueta" htmlFor={`${id}-hashtags`}>
          Hashtags del cliente
        </label>
        <textarea
          id={`${id}-hashtags`}
          name="hashtags"
          rows={3}
          required
          defaultValue={cliente?.hashtags.map((h) => `#${h}`).join("\n") ?? ""}
          placeholder={"#SpartaXDLT\n#FuerzaSparta\n#SpartaTraining"}
          className="campo font-mono text-[13px]"
        />
        <p className="text-[11px] leading-relaxed text-[var(--color-tinta-tenue)]">
          Uno por línea, o separados por coma o espacio — como los tengas. Se
          guardan en mayúsculas y sin tildes para que calcen con el registro. La
          lista es exacta: un hashtag que no esté acá no entra al informe.
        </p>
      </div>

      {!nuevo && (
        <label className="flex items-center gap-2 text-[13px] text-[var(--color-tinta-suave)]">
          <input
            type="checkbox"
            name="activo"
            defaultChecked={cliente.activo}
            className="size-3.5"
          />
          Cliente activo
        </label>
      )}

      <div className="flex flex-wrap items-center gap-3">
        <Guardar nuevo={nuevo} />
        {onCerrar && (
          <button type="button" onClick={onCerrar} className="boton-suave">
            Cancelar
          </button>
        )}
        {estado?.mensaje && (
          <p
            role="status"
            className={`text-sm ${estado.ok ? "text-emerald-700" : "text-red-700"}`}
          >
            {estado.mensaje}
          </p>
        )}
      </div>

      {/* Mostrar cómo quedaron normalizados evita la sorpresa de no ver datos. */}
      {estado?.ok && estado.hashtags && (
        <p className="text-[11px] text-[var(--color-tinta-tenue)]">
          Quedaron guardados así: {estado.hashtags.map((h) => `#${h}`).join(" · ")}
        </p>
      )}
    </form>
  );
}
