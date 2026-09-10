import { coloresDelta, GUION, porcentajeDelta } from "@/lib/dominio/formato";

/**
 * §4.1 — El delta es el elemento visual protagonista: se lee de un vistazo,
 * sin buscar.
 *
 * - Pill con porcentaje y signo (+31,6% / -77,7%)
 * - Escala de color continua, no semáforo de tres pasos
 * - Relleno interno proporcional a la magnitud, para dar sensación de tamaño
 * - Sin línea base para esa combinación: guion, nunca 0%
 */
export function Delta({
  valor,
  titulo,
}: {
  valor: number | null;
  titulo?: string;
}) {
  if (valor === null || !Number.isFinite(valor)) {
    return (
      <span
        className="inline-block min-w-[4.5rem] text-center text-sm text-[var(--color-tinta-tenue)]"
        title={titulo ?? "No hay línea base para esta combinación"}
      >
        {GUION}
      </span>
    );
  }

  const c = coloresDelta(valor);

  return (
    <span
      title={titulo}
      className="relative inline-flex min-w-[4.5rem] items-center justify-center overflow-hidden rounded border px-1.5 py-0.5 text-sm font-medium tabular-nums"
      style={{ backgroundColor: c.fondo, borderColor: c.borde, color: c.texto }}
    >
      {/* Relleno de magnitud: crece hasta ±50% y ahí satura. */}
      <span
        aria-hidden
        className="absolute inset-y-0 left-0 opacity-45"
        style={{ width: `${c.magnitud * 100}%`, backgroundColor: c.barra }}
      />
      <span className="relative">{porcentajeDelta(valor)}</span>
    </span>
  );
}

/**
 * Variante con micro-barra debajo, para el panel diario donde hay espacio y
 * conviene comparar magnitudes entre filas de un vistazo.
 */
export function DeltaConBarra({
  valor,
  titulo,
}: {
  valor: number | null;
  titulo?: string;
}) {
  const c = coloresDelta(valor);
  const hay = valor !== null && Number.isFinite(valor);

  return (
    <span className="inline-flex flex-col items-stretch gap-1" title={titulo}>
      <Delta valor={valor} titulo={titulo} />
      <span
        aria-hidden
        className="relative h-[3px] w-full overflow-hidden rounded-full bg-[var(--color-filete)]"
      >
        {hay && (
          <span
            className="absolute top-0 h-full rounded-full"
            style={{
              backgroundColor: c.barra,
              width: `${(c.magnitud * 100) / 2}%`,
              // Positivo crece a la derecha del centro, negativo a la izquierda.
              left: c.positivo ? "50%" : undefined,
              right: c.positivo ? undefined : "50%",
            }}
          />
        )}
      </span>
    </span>
  );
}
