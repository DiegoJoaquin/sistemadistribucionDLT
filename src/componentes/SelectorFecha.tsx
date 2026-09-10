import Link from "next/link";
import { fechaLarga, hoyISO, sumarDias } from "@/lib/dominio/formato";

/**
 * Selector de fecha del panel. Es un form GET más dos flechas: sin JavaScript
 * funciona igual, y con teclado se navega día a día sin abrir el calendario.
 */
export function SelectorFecha({
  fecha,
  ruta,
  extra,
}: {
  fecha: string;
  ruta: string;
  extra?: Record<string, string | undefined>;
}) {
  const hoy = hoyISO();
  const qs = (f: string) => {
    const p = new URLSearchParams({ fecha: f });
    for (const [k, v] of Object.entries(extra ?? {})) if (v) p.set(k, v);
    return `${ruta}?${p.toString()}`;
  };

  return (
    <div className="flex flex-wrap items-center gap-2">
      <Link
        href={qs(sumarDias(fecha, -1))}
        className="boton-suave px-2"
        aria-label="Día anterior"
        title="Día anterior"
      >
        ←
      </Link>

      <form method="get" action={ruta} className="flex items-center gap-2">
        {Object.entries(extra ?? {}).map(([k, v]) =>
          v ? <input key={k} type="hidden" name={k} value={v} /> : null,
        )}
        <input
          name="fecha"
          type="date"
          defaultValue={fecha}
          max={hoy}
          className="campo w-auto"
          aria-label="Fecha a evaluar"
        />
        <button type="submit" className="boton-suave">
          Ver
        </button>
      </form>

      <Link
        href={qs(sumarDias(fecha, 1))}
        className={`boton-suave px-2 ${fecha >= hoy ? "pointer-events-none opacity-40" : ""}`}
        aria-label="Día siguiente"
        title="Día siguiente"
        aria-disabled={fecha >= hoy}
      >
        →
      </Link>

      {fecha !== hoy && (
        <Link href={qs(hoy)} className="text-sm text-[var(--color-tinta-suave)] underline-offset-2 hover:underline">
          Hoy
        </Link>
      )}

      <span className="text-sm text-[var(--color-tinta-suave)]">{fechaLarga(fecha)}</span>
    </div>
  );
}
