import Link from "next/link";
import { FormularioHistorico } from "@/componentes/FormularioHistorico";
import { TablaHistoricoDia } from "@/componentes/TablaHistoricoDia";
import { Nota, Vacio } from "@/componentes/ui";
import { historicoPorDia, listarCuentas, rangoDeRegistros } from "@/lib/datos/consultas";
import {
  diaSemana,
  fechaCorta,
  hoyISO,
  mesLargo,
  numero,
  sumarDias,
} from "@/lib/dominio/formato";

export const metadata = { title: "Histórico · KPIs DLT" };

function fecha(v: string | string[] | undefined): string | undefined {
  const s = Array.isArray(v) ? v[0] : v;
  return s && /^\d{4}-\d{2}-\d{2}$/.test(s) ? s : undefined;
}

export default async function PaginaHistorico(props: PageProps<"/historico">) {
  const sp = await props.searchParams;
  const rango = await rangoDeRegistros();

  // Por defecto se muestra todo lo que haya: el punto del histórico es no tener
  // que adivinar en qué fecha estaba cada cosa.
  const desde = fecha(sp.desde) ?? rango?.desde ?? sumarDias(hoyISO(), -30);
  const hasta = fecha(sp.hasta) ?? rango?.hasta ?? hoyISO();

  const [{ dias, base }, cuentas] = await Promise.all([
    historicoPorDia(desde, hasta),
    listarCuentas(),
  ]);

  const totalFilas = dias.reduce((a, d) => a + d.filas, 0);
  const totalPublicaciones = dias.reduce((a, d) => a + d.publicaciones, 0);

  return (
    <div className="space-y-5">
      <div>
        <h1 className="text-lg font-semibold tracking-tight">Histórico</h1>
        <p className="mt-0.5 text-sm text-[var(--color-tinta-suave)]">
          Todos los días cargados, del más reciente al más antiguo, con el total
          de cada plataforma comparado contra{" "}
          {base ? (
            <>la línea base de {mesLargo(base.mes)}</>
          ) : (
            "la línea base activa"
          )}
          .
        </p>
      </div>

      <FormularioHistorico />

      {!base && (
        <Nota>
          No hay línea base activa, así que las variaciones del histórico
          aparecen como guion.{" "}
          <Link href="/base" className="underline underline-offset-2">
            Elige el mes de referencia.
          </Link>
        </Nota>
      )}

      <form method="get" className="tarjeta flex flex-wrap items-end gap-3 p-3">
        <div className="space-y-1">
          <label className="etiqueta" htmlFor="desde">
            Desde
          </label>
          <input id="desde" name="desde" type="date" defaultValue={desde} className="campo" />
        </div>
        <div className="space-y-1">
          <label className="etiqueta" htmlFor="hasta">
            Hasta
          </label>
          <input id="hasta" name="hasta" type="date" defaultValue={hasta} className="campo" />
        </div>
        <button type="submit" className="boton-suave">
          Filtrar
        </button>
        {rango && (
          <Link
            href="/historico"
            className="text-sm text-[var(--color-tinta-suave)] underline-offset-2 hover:underline"
          >
            Ver todo ({fechaCorta(rango.desde)} a {fechaCorta(rango.hasta)})
          </Link>
        )}
      </form>

      {dias.length === 0 ? (
        <Vacio
          titulo="No hay días con registros en este rango."
          detalle={
            rango
              ? `Hay datos entre el ${fechaCorta(rango.desde)} y el ${fechaCorta(rango.hasta)}.`
              : "Todavía no hay ningún registro cargado. Puedes importar el histórico del Excel con el formulario de arriba."
          }
        />
      ) : (
        <>
          <p className="text-xs text-[var(--color-tinta-tenue)]">
            {dias.length} {dias.length === 1 ? "día" : "días"} ·{" "}
            {numero(totalPublicaciones)} publicaciones · {totalFilas} filas ·
            aprieta una plataforma para ver y editar cada carga
          </p>

          <div className="space-y-4">
            {dias.map((dia) => (
              <section key={dia.fecha} className="tarjeta overflow-hidden">
                <div className="flex flex-wrap items-baseline justify-between gap-2 border-b border-[var(--color-filete)] bg-[var(--color-realce)]/50 px-4 py-2.5">
                  <div className="flex flex-wrap items-baseline gap-2.5">
                    <h2 className="text-sm font-semibold">{fechaCorta(dia.fecha)}</h2>
                    <span className="text-xs text-[var(--color-tinta-tenue)]">
                      {diaSemana(dia.fecha)} · {numero(dia.publicaciones)} publicaciones
                    </span>
                    {dia.autores.length > 0 && (
                      <span className="text-xs text-[var(--color-tinta-tenue)]">
                        cargó {dia.autores.join(", ")}
                      </span>
                    )}
                  </div>
                  <div className="flex items-center gap-3">
                    <Link
                      href={`/panel?fecha=${dia.fecha}`}
                      className="text-[13px] text-[var(--color-tinta-suave)] underline-offset-2 hover:text-[var(--color-tinta)] hover:underline"
                    >
                      Panel del día
                    </Link>
                    <Link
                      href={`/registro?desde=${dia.fecha}&hasta=${dia.fecha}`}
                      className="text-[13px] text-[var(--color-tinta-suave)] underline-offset-2 hover:text-[var(--color-tinta)] hover:underline"
                    >
                      Ver filas
                    </Link>
                  </div>
                </div>

                <TablaHistoricoDia
                  bloques={dia.bloques}
                  cuentas={cuentas}
                  rango={{ desde, hasta }}
                />
              </section>
            ))}
          </div>
        </>
      )}
    </div>
  );
}
