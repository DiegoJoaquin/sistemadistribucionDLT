import Link from "next/link";
import { PanelAnalitica } from "@/componentes/PanelAnalitica";
import { Nota, Vacio } from "@/componentes/ui";
import {
  aFilaCalculo,
  cuentasPorId,
  listarCuentas,
  listarRegistrosDelRango,
} from "@/lib/datos/consultas";
import { type FilaAnalitica, periodoAnterior } from "@/lib/dominio/analitica";
import { FORMATOS_INSTAGRAM } from "@/lib/dominio/categorias";
import type { Categoria } from "@/lib/dominio/categorias";
import { fechaCorta, hoyISO, semanaDe, sumarDias } from "@/lib/dominio/formato";
import type { CuentaRow, RegistroConAutor } from "@/lib/supabase/tipos-db";

export const metadata = { title: "Analítica · KPIs DLT" };

function fecha(v: string | string[] | undefined): string | undefined {
  const s = Array.isArray(v) ? v[0] : v;
  return s && /^\d{4}-\d{2}-\d{2}$/.test(s) ? s : undefined;
}

/**
 * Todos los formatos que existen, sin los tipos de contenido.
 *
 * §3.2 — Reactivo y Normal son la OTRA clasificación de Instagram: una
 * publicación tiene formato y tipo a la vez, así que meterlos en el mismo
 * gráfico contaría cada publicación dos veces.
 */
const FORMATOS: Categoria[] = [
  ...FORMATOS_INSTAGRAM,
  "Video",
  "Short",
  "Foto",
].filter((c, i, todos) => todos.indexOf(c) === i) as Categoria[];

function aFilasAnalitica(
  registros: RegistroConAutor[],
  indice: Map<string, CuentaRow>,
): FilaAnalitica[] {
  return registros.flatMap((r) => {
    const cuenta = indice.get(r.cuenta_id);
    return cuenta ? [{ ...aFilaCalculo(r, cuenta), fecha: r.fecha }] : [];
  });
}

export default async function PaginaAnalitica(props: PageProps<"/analitica">) {
  const sp = await props.searchParams;
  const hoy = hoyISO();

  /*
   * Por defecto, las últimas doce semanas completas. Un trimestre es lo que
   * deja ver una tendencia sin que el gráfico se llene de puntos: con un año
   * entero las etiquetas de las semanas ya no caben y la línea se aplana.
   */
  const semanaActual = semanaDe(hoy);
  const desde = fecha(sp.desde) ?? sumarDias(semanaActual.desde, -7 * 11);
  const hasta = fecha(sp.hasta) ?? semanaActual.hasta;

  const anterior = periodoAnterior(desde, hasta);

  const [registros, registrosAntes, cuentas] = await Promise.all([
    listarRegistrosDelRango(desde, hasta),
    listarRegistrosDelRango(anterior.desde, anterior.hasta),
    listarCuentas(),
  ]);

  const indice = cuentasPorId(cuentas);
  const filas = aFilasAnalitica(registros, indice);
  const filasAntes = aFilasAnalitica(registrosAntes, indice);

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-lg font-semibold tracking-tight">Analítica</h1>
          <p className="mt-0.5 text-sm text-[var(--color-tinta-suave)]">
            Cómo evolucionan los KPIs semana a semana y cómo se comparan las
            cuentas entre sí.
          </p>
        </div>

        {/* El rango va en la URL: se puede compartir el enlace de una vista. */}
        <form method="get" className="flex flex-wrap items-end gap-3">
          <div className="space-y-1">
            <label className="etiqueta" htmlFor="desde">
              Desde
            </label>
            <input
              id="desde"
              name="desde"
              type="date"
              defaultValue={desde}
              className="campo"
            />
          </div>
          <div className="space-y-1">
            <label className="etiqueta" htmlFor="hasta">
              Hasta
            </label>
            <input
              id="hasta"
              name="hasta"
              type="date"
              defaultValue={hasta}
              className="campo"
            />
          </div>
          <button type="submit" className="boton-suave">
            Ver período
          </button>
        </form>
      </div>

      {filas.length === 0 ? (
        <Vacio
          titulo={`No hay publicaciones registradas entre el ${fechaCorta(desde)} y el ${fechaCorta(hasta)}.`}
          detalle="Sube las exportaciones desde el registro y las filas se crean solas, o elige otro período."
          accion={
            <Link href="/registro" className="boton-suave mt-1">
              Ir al registro
            </Link>
          }
        />
      ) : (
        <>
          <PanelAnalitica
            filas={filas}
            filasAntes={filasAntes}
            cuentas={cuentas}
            formatos={FORMATOS}
            rango={{ desde, hasta }}
          />

          <Nota>
            Los gráficos salen del registro, así que muestran lo que esté
            cargado. Si una semana aparece vacía, lo más probable es que falte
            subir esa exportación y no que no se haya publicado. El{" "}
            <Link href="/reporte" className="underline underline-offset-2">
              reporte semanal
            </Link>{" "}
            lleva una versión de estos gráficos para mandar por correo.
          </Nota>
        </>
      )}
    </div>
  );
}
