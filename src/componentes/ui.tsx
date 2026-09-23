import type { ReactNode } from "react";
import {
  COLOR_PLATAFORMA,
  COLOR_PLATAFORMA_2,
  CUENTAS,
  type Plataforma,
} from "@/lib/dominio/plataformas";
import {
  colorDeCuenta,
  colorSecundarioDeCuenta,
  type Cuenta,
  usuarioVisible,
} from "@/lib/dominio/redes";
import { GUION, numero, numeroFino, porcentaje } from "@/lib/dominio/formato";

/** Número grande y tabular. Null se muestra como guion, nunca como 0 (§9.4). */
export function Cifra({
  valor,
  fino = false,
  sufijo,
}: {
  valor: number | null;
  fino?: boolean;
  sufijo?: string;
}) {
  if (valor === null || !Number.isFinite(valor)) {
    return <span className="text-[var(--color-tinta-tenue)]">{GUION}</span>;
  }
  return (
    <span className="cifra">
      {fino ? numeroFino(valor) : numero(valor)}
      {sufijo}
    </span>
  );
}

export function Pct({ valor, decimales = 1 }: { valor: number | null; decimales?: number }) {
  if (valor === null || !Number.isFinite(valor)) {
    return <span className="text-[var(--color-tinta-tenue)]">{GUION}</span>;
  }
  return <span className="cifra">{porcentaje(valor, decimales)}</span>;
}

/** §8 — estados vacíos claros: si un día no tiene datos, se dice explícitamente. */
export function Vacio({
  titulo,
  detalle,
  accion,
}: {
  titulo: string;
  detalle?: string;
  accion?: ReactNode;
}) {
  return (
    <div className="flex flex-col items-center gap-2 rounded-lg border border-dashed border-[var(--color-filete-fuerte)] bg-white/60 px-6 py-10 text-center">
      <p className="text-sm font-medium text-[var(--color-tinta)]">{titulo}</p>
      {detalle && (
        <p className="max-w-md text-sm text-[var(--color-tinta-suave)]">{detalle}</p>
      )}
      {accion}
    </div>
  );
}

export function Nota({ children }: { children: ReactNode }) {
  return (
    <p className="rounded-md border border-[var(--color-filete)] bg-[var(--color-realce)] px-3 py-2 text-[13px] leading-relaxed text-[var(--color-tinta-suave)]">
      {children}
    </p>
  );
}

/**
 * Cabecera de bloque de plataforma. §8: el color de marca se usa como acento
 * (un filete lateral y un punto), nunca como fondo.
 */
/**
 * Cabecera de bloque de cuenta. §8: el color de marca se usa como acento (un
 * filete lateral), nunca como fondo.
 */
export function CabeceraCuenta({
  cuenta,
  derecha,
}: {
  cuenta: Cuenta;
  derecha?: ReactNode;
}) {
  const usuario = usuarioVisible(cuenta);
  return (
    <div className="flex flex-wrap items-baseline justify-between gap-2 border-b border-[var(--color-filete)] px-4 py-3">
      <div className="flex items-center gap-2.5">
        <span
          aria-hidden
          className="h-3.5 w-1.5 rounded-full"
          style={{
            background: `linear-gradient(${colorDeCuenta(cuenta)}, ${colorSecundarioDeCuenta(cuenta)})`,
          }}
        />
        <h2 className="text-sm font-semibold tracking-tight">{cuenta.nombre}</h2>
        {usuario && (
          <span className="text-xs text-[var(--color-tinta-tenue)]">{usuario}</span>
        )}
      </div>
      {derecha}
    </div>
  );
}

/** Versión por plataforma, todavía en uso por la vista de línea base. */
export function CabeceraPlataforma({
  plataforma,
  derecha,
}: {
  plataforma: Plataforma;
  derecha?: ReactNode;
}) {
  return (
    <div className="flex flex-wrap items-baseline justify-between gap-2 border-b border-[var(--color-filete)] px-4 py-3">
      <div className="flex items-center gap-2.5">
        <span
          aria-hidden
          className="h-3.5 w-1.5 rounded-full"
          style={{
            background: `linear-gradient(${COLOR_PLATAFORMA[plataforma]}, ${COLOR_PLATAFORMA_2[plataforma]})`,
          }}
        />
        <h2 className="text-sm font-semibold tracking-tight">{plataforma}</h2>
        <span className="text-xs text-[var(--color-tinta-tenue)]">
          {CUENTAS[plataforma]}
        </span>
      </div>
      {derecha}
    </div>
  );
}

export function Insignia({
  children,
  tono = "neutro",
}: {
  children: ReactNode;
  tono?: "neutro" | "aviso";
}) {
  const clases =
    tono === "aviso"
      ? "border-amber-300 bg-amber-50 text-amber-900"
      : "border-[var(--color-filete-fuerte)] bg-[var(--color-realce)] text-[var(--color-tinta-suave)]";
  return (
    <span
      className={`inline-flex items-center rounded border px-1.5 py-0.5 text-[11px] font-medium ${clases}`}
    >
      {children}
    </span>
  );
}
