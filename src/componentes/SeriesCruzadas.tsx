import { Delta } from "@/componentes/Delta";
import { Cifra, Pct } from "@/componentes/ui";
import type { SerieCruzada } from "@/lib/dominio/catastro";
import { colorDeCuenta, tieneAlcanceRed } from "@/lib/dominio/redes";

/**
 * Las series que salieron en más de una cuenta.
 *
 * Responde a lo que pidió el equipo sobre el mismo video en TikTok y en
 * Instagram: identificarlo, pero mostrar cada cuenta por separado. No hay
 * ninguna fila que las promedie entre sí, y es a propósito — son públicos y
 * redes distintas, y en YouTube el engagement ni se calcula igual (§9.6).
 */
export function SeriesCruzadas({ series }: { series: SerieCruzada[] }) {
  if (series.length === 0) return null;

  return (
    <section className="tarjeta overflow-hidden">
      <div className="border-b border-[var(--color-filete)] px-4 py-3">
        <h2 className="text-sm font-semibold tracking-tight">
          Series que salieron en más de una cuenta
        </h2>
        <p className="mt-0.5 text-xs text-[var(--color-tinta-suave)]">
          Cada cuenta va por separado: no se promedian entre sí porque son
          públicos y redes distintas.
        </p>
      </div>

      <ul className="divide-y divide-[var(--color-filete)]">
        {series.map((serie) => (
          <li key={serie.hashtag} className="px-4 py-3">
            <div className="flex flex-wrap items-baseline gap-2">
              <h3 className="text-[13px] font-semibold">#{serie.hashtag}</h3>
              <span className="text-[11px] text-[var(--color-tinta-tenue)]">
                {serie.publicaciones}{" "}
                {serie.publicaciones === 1 ? "publicación" : "publicaciones"} en{" "}
                {serie.cuentas.length} cuentas
              </span>
            </div>

            <div className="scroll-x mt-2">
              <table className="w-full border-collapse text-left">
                <thead>
                  <tr>
                    <th className="th">Cuenta</th>
                    <th className="th text-right">Pub.</th>
                    <th className="th text-right">Alcance</th>
                    <th className="th text-right">Visualiz.</th>
                    <th className="th text-right">Interacc.</th>
                    <th className="th text-right">Engagement</th>
                    <th className="th">Δ vs su base</th>
                  </tr>
                </thead>
                <tbody>
                  {serie.cuentas.map(({ cuenta, publicaciones, periodo, vsSuBase }) => (
                    <tr
                      key={cuenta.id}
                      className="border-t border-[var(--color-filete)]"
                    >
                      <td className="td">
                        <span className="flex items-center gap-2">
                          <span
                            aria-hidden
                            className="h-2.5 w-1 rounded-full"
                            style={{ backgroundColor: colorDeCuenta(cuenta) }}
                          />
                          <span className="font-medium">{cuenta.nombre}</span>
                          <span className="text-[11px] text-[var(--color-tinta-tenue)]">
                            {cuenta.red}
                          </span>
                        </span>
                      </td>
                      <td className="td text-right">
                        <span className="cifra">{publicaciones}</span>
                      </td>
                      <td className="td text-right">
                        {tieneAlcanceRed(cuenta.red) ? (
                          <Cifra valor={periodo.alcance} />
                        ) : (
                          <span className="text-[var(--color-tinta-tenue)]">n/a</span>
                        )}
                      </td>
                      <td className="td text-right">
                        <Cifra valor={periodo.visualizaciones} />
                      </td>
                      <td className="td text-right">
                        <Cifra valor={periodo.interacciones} />
                      </td>
                      <td className="td text-right">
                        <Pct valor={periodo.engagement} />
                      </td>
                      <td className="td">
                        <Delta
                          valor={vsSuBase.alcance ?? vsSuBase.visualizaciones}
                          titulo={
                            vsSuBase.alcance === null
                              ? "Sin alcance: se muestra la variación de visualizaciones"
                              : undefined
                          }
                        />
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </li>
        ))}
      </ul>
    </section>
  );
}
