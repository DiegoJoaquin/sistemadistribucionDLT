import Link from "next/link";
import { FormularioImportar } from "@/componentes/FormularioImportar";
import { Cifra, Insignia, Nota, Pct, Vacio } from "@/componentes/ui";
import { activarLineaBase, borrarLineaBase } from "@/lib/datos/acciones";
import { listarLineasBase, resumenLineaBase } from "@/lib/datos/consultas";
import { mesActualISO, mesLargo } from "@/lib/dominio/formato";

export const metadata = { title: "Línea base · KPIs DLT" };

export default async function PaginaBase() {
  const lineas = await listarLineasBase();
  const resumenes = await Promise.all(
    lineas.map(async (l) => ({ linea: l, filas: await resumenLineaBase(l.id) })),
  );

  return (
    <div className="space-y-5">
      <div>
        <h1 className="text-lg font-semibold tracking-tight">Líneas base mensuales</h1>
        <p className="mt-0.5 text-sm text-[var(--color-tinta-suave)]">
          El promedio por publicación de un mes completo, por plataforma y
          categoría. Es la referencia contra la cual se comparan los días.
        </p>
      </div>

      {/*
        Sin referencia activa no hay ninguna comparación en toda la aplicación,
        y eso desde el panel se ve como una tabla llena de guiones sin motivo
        aparente. Si hay líneas base cargadas pero ninguna activa, se dice acá
        con un botón al lado.
      */}
      {lineas.length > 0 && !lineas.some((l) => l.activa) && (
        <div className="flex flex-wrap items-center justify-between gap-3 rounded-lg border border-amber-300 bg-amber-50 px-4 py-3">
          <p className="text-sm text-amber-900">
            <strong>Ninguna línea base está marcada como referencia activa</strong>
            , así que todas las variaciones aparecen como guion. Elige el mes
            contra el que quieres comparar.
          </p>
          <form action={activarLineaBase}>
            <input type="hidden" name="id" value={lineas[0].id} />
            <button type="submit" className="boton">
              Usar {mesLargo(lineas[0].mes)} como referencia
            </button>
          </form>
        </div>
      )}

      <FormularioImportar mesPorDefecto={mesActualISO()} />

      <Nota>
        Para Instagram conviene subir <strong>las dos fuentes</strong>: la
        exportación de Iconosquare trae alcance y visualizaciones pero no nuevos
        seguidores, y el CSV de Meta Business Suite sí los trae. La primera que
        subas define cuántas publicaciones tiene el mes; la segunda solo{" "}
        <strong>completa los campos vacíos</strong> de esas mismas publicaciones,
        sin agregar filas, así que el mes no se cuenta dos veces. El desfase
        horario entre ambos exportadores (Meta reporta 3 horas atrás) se estima
        solo. Twitter/X no tiene exportación con alcance: esas filas se cargan a
        mano en el registro.
      </Nota>

      {lineas.length === 0 ? (
        <Vacio
          titulo="Todavía no hay ninguna línea base."
          detalle="Importa los archivos de un mes completo para poder comparar los días contra un promedio."
        />
      ) : (
        <div className="space-y-4">
          {resumenes.map(({ linea, filas }) => {
            const totalPublicaciones = filas.reduce((a, f) => a + f.n_publicaciones, 0);
            return (
              <section key={linea.id} className="tarjeta overflow-hidden">
                <div className="flex flex-wrap items-center justify-between gap-3 border-b border-[var(--color-filete)] px-4 py-3">
                  <div className="flex flex-wrap items-center gap-2.5">
                    <h2 className="text-sm font-semibold">{mesLargo(linea.mes)}</h2>
                    {linea.activa ? (
                      <Insignia>referencia activa</Insignia>
                    ) : (
                      <form action={activarLineaBase}>
                        <input type="hidden" name="id" value={linea.id} />
                        <button type="submit" className="boton-suave px-2 py-1 text-[13px]">
                          Usar como referencia
                        </button>
                      </form>
                    )}
                    <span className="text-xs text-[var(--color-tinta-tenue)]">
                      {totalPublicaciones} publicaciones importadas
                    </span>
                  </div>

                  <div className="flex items-center gap-3">
                    <Link href={`/base/${linea.id}`} className="boton-suave">
                      Ver y reclasificar
                    </Link>
                    <form action={borrarLineaBase}>
                      <input type="hidden" name="id" value={linea.id} />
                      <button
                        type="submit"
                        className="text-[13px] text-red-700 underline-offset-2 hover:underline"
                      >
                        Borrar
                      </button>
                    </form>
                  </div>
                </div>

                {filas.length === 0 ? (
                  <p className="px-4 py-5 text-sm text-[var(--color-tinta-suave)]">
                    Esta línea base no tiene publicaciones importadas.
                  </p>
                ) : (
                  <div className="scroll-x">
                    <table className="w-full border-collapse text-left">
                      <thead className="border-b border-[var(--color-filete)] bg-[var(--color-realce)]/60">
                        <tr>
                          <th className="th">Plataforma</th>
                          <th className="th text-right">Publicaciones</th>
                          <th className="th text-right">Alcance prom.</th>
                          <th className="th text-right">Visualiz. prom.</th>
                          <th className="th text-right">Interacc. prom.</th>
                          <th className="th text-right">Engagement prom.</th>
                          <th className="th text-right">Nuevos seg. prom.</th>
                        </tr>
                      </thead>
                      <tbody>
                        {filas.map((f) => (
                          <tr
                            key={f.plataforma}
                            className="border-b border-[var(--color-filete)] last:border-0"
                          >
                            <td className="td font-medium">{f.plataforma}</td>
                            <td className="td text-right cifra">{f.n_publicaciones}</td>
                            <td className="td text-right">
                              <Cifra valor={f.alcance_prom} />
                            </td>
                            <td className="td text-right">
                              <Cifra valor={f.visualizaciones_prom} />
                            </td>
                            <td className="td text-right">
                              <Cifra valor={f.interacciones_prom} />
                            </td>
                            <td className="td text-right">
                              <Pct valor={f.engagement_prom} />
                            </td>
                            <td className="td text-right">
                              <Cifra valor={f.nuevos_seguidores_prom} fino />
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                )}
              </section>
            );
          })}
        </div>
      )}
    </div>
  );
}
