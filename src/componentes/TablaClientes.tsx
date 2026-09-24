"use client";

import Link from "next/link";
import { useState } from "react";
import { FormularioCliente } from "@/componentes/FormularioCliente";
import { Insignia } from "@/componentes/ui";
import { alternarClienteActivo } from "@/lib/datos/acciones";
import type { ClienteConHashtags } from "@/lib/datos/consultas";

export function TablaClientes({ clientes }: { clientes: ClienteConHashtags[] }) {
  const [editando, setEditando] = useState<string | null>(null);

  return (
    <div className="space-y-3">
      {clientes.map((c) =>
        editando === c.id ? (
          <section key={c.id} className="tarjeta bg-[var(--color-realce)]/50 p-4">
            <FormularioCliente cliente={c} onCerrar={() => setEditando(null)} />
          </section>
        ) : (
          <section key={c.id} className="tarjeta p-4">
            <div className="flex flex-wrap items-start justify-between gap-3">
              <div className="min-w-0">
                <div className="flex flex-wrap items-baseline gap-2">
                  <h2 className="text-sm font-semibold tracking-tight">{c.nombre}</h2>
                  {!c.activo && <Insignia tono="aviso">inactivo</Insignia>}
                  <span className="text-xs text-[var(--color-tinta-tenue)]">
                    {c.hashtags.length}{" "}
                    {c.hashtags.length === 1 ? "hashtag" : "hashtags"}
                  </span>
                </div>
                {c.notas && (
                  <p className="mt-0.5 text-[13px] text-[var(--color-tinta-suave)]">
                    {c.notas}
                  </p>
                )}
              </div>

              <div className="flex flex-wrap items-center gap-2">
                <Link href={`/informe?cliente=${c.id}`} className="boton-suave">
                  Ver informe
                </Link>
                <button
                  type="button"
                  onClick={() => setEditando(c.id)}
                  className="text-[13px] text-[var(--color-tinta-suave)] underline-offset-2 hover:text-[var(--color-tinta)] hover:underline"
                >
                  Editar
                </button>
                <form action={alternarClienteActivo}>
                  <input type="hidden" name="id" value={c.id} />
                  <input type="hidden" name="activar" value={String(!c.activo)} />
                  <button
                    type="submit"
                    className="text-[13px] text-[var(--color-tinta-suave)] underline-offset-2 hover:text-[var(--color-tinta)] hover:underline"
                  >
                    {c.activo ? "Desactivar" : "Reactivar"}
                  </button>
                </form>
              </div>
            </div>

            <ul className="mt-2.5 flex flex-wrap gap-1.5">
              {c.hashtags.map((h) => (
                <li
                  key={h}
                  className="rounded border border-[var(--color-filete-fuerte)] bg-[var(--color-realce)] px-1.5 py-0.5 font-mono text-[12px]"
                >
                  #{h}
                </li>
              ))}
            </ul>
          </section>
        ),
      )}
    </div>
  );
}
