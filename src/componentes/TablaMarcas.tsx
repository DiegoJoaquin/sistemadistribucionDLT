"use client";

import { useState } from "react";
import { FormularioMarca } from "@/componentes/FormularioMarca";
import { Insignia } from "@/componentes/ui";
import { alternarMarcaActiva } from "@/lib/datos/acciones-marcas";
import type { MarcaRow } from "@/lib/datos/marcas";
import { rotularSenal } from "@/lib/dominio/marcas";

const enlaceSuave =
  "text-[13px] text-[var(--color-tinta-suave)] underline-offset-2 hover:text-[var(--color-tinta)] hover:underline";

/** Las marcas con sus señales, para revisarlas y editarlas. */
export function TablaMarcas({ marcas }: { marcas: MarcaRow[] }) {
  const [editando, setEditando] = useState<string | null>(null);

  return (
    <div className="space-y-3">
      {marcas.map((m) =>
        editando === m.id ? (
          <section key={m.id} className="tarjeta bg-[var(--color-realce)]/50 p-4">
            <FormularioMarca marca={m} onCerrar={() => setEditando(null)} />
          </section>
        ) : (
          <section key={m.id} className="tarjeta p-4">
            <div className="flex flex-wrap items-start justify-between gap-3">
              <div className="min-w-0">
                <div className="flex flex-wrap items-baseline gap-2">
                  <h3 className="text-sm font-semibold tracking-tight">{m.nombre}</h3>
                  {!m.activa && <Insignia tono="aviso">inactiva</Insignia>}
                  <span className="text-xs text-[var(--color-tinta-tenue)]">
                    {m.senales.length} {m.senales.length === 1 ? "señal" : "señales"}
                  </span>
                </div>
                {m.notas && <p className="mt-0.5 text-[13px] text-[var(--color-tinta-suave)]">{m.notas}</p>}
              </div>

              <div className="flex flex-wrap items-center gap-3">
                <button type="button" onClick={() => setEditando(m.id)} className={enlaceSuave}>
                  Editar
                </button>
                <form action={alternarMarcaActiva}>
                  <input type="hidden" name="id" value={m.id} />
                  <input type="hidden" name="activar" value={String(!m.activa)} />
                  <button type="submit" className={enlaceSuave}>
                    {m.activa ? "Desactivar" : "Reactivar"}
                  </button>
                </form>
              </div>
            </div>

            <ul className="mt-2.5 flex flex-wrap gap-1.5">
              {m.senales.map((s) => (
                <li
                  key={`${s.tipo}:${s.valor}`}
                  className="rounded border border-[var(--color-filete-fuerte)] bg-[var(--color-realce)] px-1.5 py-0.5 font-mono text-[12px]"
                >
                  {rotularSenal(s)}
                </li>
              ))}
            </ul>
          </section>
        ),
      )}
    </div>
  );
}
