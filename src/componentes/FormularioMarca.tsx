"use client";

import { useActionState, useId } from "react";
import { useFormStatus } from "react-dom";
import { actualizarMarca, crearMarca, type ResultadoMarca } from "@/lib/datos/acciones-marcas";
import type { MarcaRow } from "@/lib/datos/marcas";
import { rotularSenal, senalesComoTexto } from "@/lib/dominio/marcas";

function Guardar({ nueva }: { nueva: boolean }) {
  const { pending } = useFormStatus();
  return (
    <button type="submit" className="boton" disabled={pending}>
      {pending ? "Guardando…" : nueva ? "Agregar marca" : "Guardar"}
    </button>
  );
}

/**
 * Alta y edición de una marca del global.
 *
 * Las señales van en un campo de texto libre, como lleguen: hashtags con #,
 * arrobas con @ y las campañas de Iconosquare en una línea que empieza con
 * «campaña:». Se normalizan al guardar para que calcen con el texto de las
 * publicaciones.
 */
export function FormularioMarca({ marca, onCerrar }: { marca?: MarcaRow; onCerrar?: () => void }) {
  const nueva = marca === undefined;
  const [estado, accion] = useActionState<ResultadoMarca | null, FormData>(
    nueva ? crearMarca : actualizarMarca,
    null,
  );
  const id = useId();

  return (
    <form action={accion} className="space-y-3">
      {marca && <input type="hidden" name="id" value={marca.id} />}

      <div className="grid grid-cols-1 gap-3 sm:grid-cols-[minmax(0,14rem)_minmax(0,1fr)]">
        <div className="space-y-1">
          <label className="etiqueta" htmlFor={`${id}-nombre`}>
            Nombre de la marca
          </label>
          <input
            id={`${id}-nombre`}
            name="nombre"
            type="text"
            required
            maxLength={80}
            defaultValue={marca?.nombre ?? ""}
            placeholder="Sparta"
            className="campo"
          />
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
            defaultValue={marca?.notas ?? ""}
            placeholder="Contrato, vigencia, quién la lleva en Comercial"
            className="campo"
          />
        </div>
      </div>

      <div className="space-y-1">
        <label className="etiqueta" htmlFor={`${id}-senales`}>
          Cómo se reconoce
        </label>
        <textarea
          id={`${id}-senales`}
          name="senales"
          rows={4}
          required
          defaultValue={marca ? senalesComoTexto(marca.senales) : ""}
          placeholder={"#SpartaxDLT #ElLivingDelTeamChile\n@spartachile\ncampaña: SPARTA GLOBAL, el living"}
          className="campo font-mono text-[13px]"
        />
        <p className="text-[11px] leading-relaxed text-[var(--color-tinta-tenue)]">
          Hashtags con #, arrobas con @, separados por espacio, coma o línea. Las
          campañas de Iconosquare van en una línea que empiece con «campaña:».
          La lista es exacta: una publicación cuenta para la marca si lleva al
          menos una de estas señales.
        </p>
      </div>

      {!nueva && (
        <label className="flex items-center gap-2 text-[13px] text-[var(--color-tinta-suave)]">
          <input type="checkbox" name="activa" defaultChecked={marca.activa} className="size-3.5" />
          Marca activa (se cuenta en el global)
        </label>
      )}

      <div className="flex flex-wrap items-center gap-3">
        <Guardar nueva={nueva} />
        {onCerrar && (
          <button type="button" onClick={onCerrar} className="boton-suave">
            Cancelar
          </button>
        )}
        {estado?.mensaje && (
          <p role="status" className={`text-sm ${estado.ok ? "text-emerald-700" : "text-red-700"}`}>
            {estado.mensaje}
          </p>
        )}
      </div>

      {/* Mostrar cómo quedaron evita la sorpresa de una marca en cero. */}
      {estado?.ok && estado.senales && (
        <p className="text-[11px] text-[var(--color-tinta-tenue)]">
          Quedaron guardadas así: {estado.senales.map(rotularSenal).join(" · ")}
        </p>
      )}
    </form>
  );
}
