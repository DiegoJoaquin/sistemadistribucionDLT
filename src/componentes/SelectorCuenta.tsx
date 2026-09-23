"use client";

import { porRed } from "@/lib/dominio/redes";
import type { CuentaRow } from "@/lib/supabase/tipos-db";

/**
 * Selector de cuenta, agrupado por red.
 *
 * Con cinco cuentas una lista plana alcanzaba. Con las de los influencers son
 * bastantes más, así que van agrupadas por red: además de encontrarlas más
 * rápido, deja a la vista de qué red es cada una, que es lo que determina las
 * categorías disponibles.
 */
export function SelectorCuenta({
  cuentas,
  valor,
  onCambio,
  id,
  nombre = "cuenta_id",
}: {
  cuentas: CuentaRow[];
  valor: string;
  onCambio: (cuentaId: string) => void;
  id?: string;
  nombre?: string;
}) {
  const grupos = porRed(cuentas);

  return (
    <select
      id={id}
      name={nombre}
      required
      className="campo"
      value={valor}
      onChange={(e) => onCambio(e.target.value)}
    >
      {valor === "" && <option value="">— elegir cuenta —</option>}
      {grupos.map(({ red, cuentas: suyas }) => (
        <optgroup key={red} label={red}>
          {suyas.map((c) => (
            <option key={c.id} value={c.id}>
              {c.nombre}
              {c.es_influencer ? " · influencer" : ""}
            </option>
          ))}
        </optgroup>
      ))}
    </select>
  );
}
