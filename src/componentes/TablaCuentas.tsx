"use client";

import { useState } from "react";
import { FormularioCuenta } from "@/componentes/FormularioCuenta";
import { Insignia } from "@/componentes/ui";
import { alternarCuentaActiva } from "@/lib/datos/acciones";
import { COLOR_RED, COLOR_RED_2, porRed, usuarioVisible } from "@/lib/dominio/redes";
import { numero } from "@/lib/dominio/formato";
import type { CuentaRow } from "@/lib/supabase/tipos-db";

const COLUMNAS = 6;

export function TablaCuentas({
  cuentas,
  uso,
}: {
  cuentas: CuentaRow[];
  /** Cuántos registros tiene cada cuenta, para avisar antes de desactivarla. */
  uso: Record<string, number>;
}) {
  const [editando, setEditando] = useState<string | null>(null);
  const grupos = porRed(cuentas);

  return (
    <div className="space-y-4">
      {grupos.map(({ red, cuentas: suyas }) => (
        <section key={red} className="tarjeta overflow-hidden">
          <div className="flex items-center gap-2.5 border-b border-[var(--color-filete)] px-4 py-3">
            <span
              aria-hidden
              className="h-3.5 w-1.5 rounded-full"
              style={{
                background: `linear-gradient(${COLOR_RED[red]}, ${COLOR_RED_2[red]})`,
              }}
            />
            <h2 className="text-sm font-semibold tracking-tight">{red}</h2>
            <span className="text-xs text-[var(--color-tinta-tenue)]">
              {suyas.length} {suyas.length === 1 ? "cuenta" : "cuentas"}
            </span>
          </div>

          <div className="scroll-x">
            <table className="w-full border-collapse text-left">
              <thead className="border-b border-[var(--color-filete)] bg-[var(--color-realce)]/60">
                <tr>
                  <th className="th">Cuenta</th>
                  <th className="th">Usuario</th>
                  <th className="th">Tipo</th>
                  <th className="th text-right">Orden</th>
                  <th className="th text-right">Registros</th>
                  <th className="th sr-only">Acciones</th>
                </tr>
              </thead>
              <tbody>
                {suyas.map((c) =>
                  editando === c.id ? (
                    <tr key={c.id} className="border-b border-[var(--color-filete)] bg-[var(--color-realce)]/50">
                      <td colSpan={COLUMNAS} className="p-4">
                        <FormularioCuenta
                          cuenta={c}
                          onCerrar={() => setEditando(null)}
                        />
                      </td>
                    </tr>
                  ) : (
                    <tr
                      key={c.id}
                      className={`border-b border-[var(--color-filete)] last:border-0 ${
                        c.activa ? "" : "opacity-60"
                      }`}
                    >
                      <td className="td font-medium">
                        {c.nombre}
                        {!c.activa && (
                          <span className="ml-2 text-[11px] font-normal text-[var(--color-tinta-tenue)]">
                            desactivada
                          </span>
                        )}
                      </td>
                      <td className="td text-[var(--color-tinta-suave)]">
                        {usuarioVisible(c) ?? "—"}
                      </td>
                      <td className="td">
                        {c.es_influencer ? (
                          <Insignia>influencer</Insignia>
                        ) : (
                          <span className="text-[13px] text-[var(--color-tinta-suave)]">
                            propia
                          </span>
                        )}
                      </td>
                      <td className="td text-right cifra text-[var(--color-tinta-suave)]">
                        {c.orden}
                      </td>
                      <td className="td text-right">
                        {uso[c.id] ? (
                          <span className="cifra">{numero(uso[c.id])}</span>
                        ) : (
                          <span className="text-[var(--color-tinta-tenue)]">—</span>
                        )}
                      </td>
                      <td className="td">
                        <div className="flex items-center gap-3">
                          <button
                            type="button"
                            onClick={() => setEditando(c.id)}
                            className="text-[13px] text-[var(--color-tinta-suave)] underline-offset-2 hover:text-[var(--color-tinta)] hover:underline"
                          >
                            Editar
                          </button>
                          <form action={alternarCuentaActiva}>
                            <input type="hidden" name="id" value={c.id} />
                            <input
                              type="hidden"
                              name="activar"
                              value={c.activa ? "false" : "true"}
                            />
                            <button
                              type="submit"
                              className="text-[13px] text-[var(--color-tinta-suave)] underline-offset-2 hover:text-[var(--color-tinta)] hover:underline"
                              title={
                                c.activa
                                  ? "Deja de ofrecerla al cargar, pero conserva su historial"
                                  : "Vuelve a ofrecerla al cargar"
                              }
                            >
                              {c.activa ? "Desactivar" : "Activar"}
                            </button>
                          </form>
                        </div>
                      </td>
                    </tr>
                  ),
                )}
              </tbody>
            </table>
          </div>
        </section>
      ))}
    </div>
  );
}
