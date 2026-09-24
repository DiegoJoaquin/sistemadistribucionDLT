"use client";

import { useActionState, useEffect } from "react";
import { useFormStatus } from "react-dom";
import {
  actualizarCuenta,
  crearCuenta,
  type Resultado,
} from "@/lib/datos/acciones";
import { REDES } from "@/lib/dominio/redes";
import type { CuentaRow } from "@/lib/supabase/tipos-db";

function Boton({ editando }: { editando: boolean }) {
  const { pending } = useFormStatus();
  return (
    <button type="submit" className="boton" disabled={pending}>
      {pending ? "Guardando…" : editando ? "Guardar" : "Agregar cuenta"}
    </button>
  );
}

/**
 * Alta y edición de una cuenta. El mismo formulario para las dos cosas: son
 * los mismos campos y con dos copias habrían quedado distintas en el primer
 * cambio.
 */
export function FormularioCuenta({
  cuenta,
  onCerrar,
}: {
  cuenta?: CuentaRow;
  onCerrar?: () => void;
}) {
  const editando = cuenta !== undefined;
  const [estado, accion] = useActionState<Resultado | null, FormData>(
    editando ? actualizarCuenta : crearCuenta,
    null,
  );

  useEffect(() => {
    if (estado?.ok && editando) onCerrar?.();
  }, [estado, editando, onCerrar]);

  return (
    <form action={accion} className="space-y-3">
      {editando && <input type="hidden" name="id" value={cuenta.id} />}

      <div className="grid grid-cols-1 gap-3 sm:grid-cols-[1.4fr_1fr_1fr_auto]">
        <div className="space-y-1">
          <label className="etiqueta">Nombre</label>
          <input
            name="nombre"
            type="text"
            required
            maxLength={80}
            defaultValue={cuenta?.nombre ?? ""}
            placeholder="DiegoAT"
            className="campo"
          />
          <p className="text-[11px] leading-tight text-[var(--color-tinta-tenue)]">
            Como aparece en los reportes
          </p>
        </div>

        <div className="space-y-1">
          <label className="etiqueta">Usuario</label>
          <input
            name="usuario"
            type="text"
            maxLength={80}
            defaultValue={cuenta?.usuario ?? ""}
            placeholder="@diegoat"
            className="campo"
          />
          {/* Ya no es un simple "opcional": es por este @ que la importación
              sabe a qué cuenta pertenece cada exportación. */}
          <p className="text-[11px] leading-tight text-[var(--color-tinta-tenue)]">
            Con esto la importación la reconoce
          </p>
        </div>

        <div className="space-y-1">
          <label className="etiqueta">Red</label>
          <select
            name="red"
            className="campo"
            defaultValue={cuenta?.red ?? "Instagram"}
            required
          >
            {REDES.map((r) => (
              <option key={r} value={r}>
                {r}
              </option>
            ))}
          </select>
          <p className="text-[11px] leading-tight text-[var(--color-tinta-tenue)]">
            Define las categorías
          </p>
        </div>

        <div className="space-y-1">
          <label className="etiqueta">Orden</label>
          <input
            name="orden"
            type="number"
            min={0}
            max={9999}
            step={1}
            defaultValue={cuenta?.orden ?? 100}
            className="campo cifra w-20"
          />
          <p className="text-[11px] leading-tight text-[var(--color-tinta-tenue)]">
            Menor va antes. Deja 100
          </p>
        </div>
      </div>

      <div className="flex flex-wrap items-center gap-4">
        <label className="flex items-center gap-2 text-[13px] text-[var(--color-tinta-suave)]">
          <input
            type="checkbox"
            name="es_influencer"
            defaultChecked={cuenta?.es_influencer ?? false}
          />
          Es cuenta de influencer
        </label>

        <Boton editando={editando} />

        {editando && (
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
    </form>
  );
}
