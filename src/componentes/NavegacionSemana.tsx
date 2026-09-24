import Link from "next/link";
import {
  hoyISO,
  semanaAnterior,
  semanaDe,
  semanaSiguiente,
  type Semana,
} from "@/lib/dominio/formato";

/**
 * Ir de una semana a otra. La comparten el catastro y el reporte semanal.
 *
 * No ofrece la semana siguiente cuando todavía no empezó: un reporte de una
 * semana futura saldría vacío y parecería que algo falló.
 */
export function NavegacionSemana({
  semana,
  ruta,
}: {
  semana: Semana;
  ruta: "/catastro" | "/reporte";
}) {
  const hoy = hoyISO();
  const siguiente = semanaSiguiente(semana);
  const esActual = semana.desde === semanaDe(hoy).desde;

  const enlace = (s: Semana) => `${ruta}?semana=${s.desde}`;

  return (
    <nav className="flex flex-wrap items-center gap-2" aria-label="Semana">
      <Link href={enlace(semanaAnterior(semana))} className="boton-suave">
        ← Semana anterior
      </Link>
      {!esActual && (
        <Link href={ruta} className="boton-suave">
          Esta semana
        </Link>
      )}
      {siguiente.desde <= hoy && (
        <Link href={enlace(siguiente)} className="boton-suave">
          Semana siguiente →
        </Link>
      )}
    </nav>
  );
}
