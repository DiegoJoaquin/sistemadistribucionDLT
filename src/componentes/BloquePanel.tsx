import { DeltaConBarra } from "@/componentes/Delta";
import { CabeceraPlataforma, Cifra, Insignia, Pct } from "@/componentes/ui";
import type { LineaPanel } from "@/lib/dominio/calculo";
import { numero, numeroFino, porcentaje } from "@/lib/dominio/formato";
import { tieneAlcance } from "@/lib/dominio/plataformas";
import type { BloquePlataforma } from "@/lib/datos/consultas";

/** Texto del tooltip con el valor de la línea base, para saber contra qué compara. */
function contra(
  linea: LineaPanel,
  campo: "alcance_prom" | "visualizaciones_prom" | "interacciones_prom" | "nuevos_seguidores_prom",
): string {
  if (!linea.base) return "Sin línea base para esta combinación";
  const v = linea.base[campo];
  if (v === null) return "La línea base no tiene esta métrica";
  return `Línea base: ${numeroFino(v)} por publicación (${linea.base.n_publicaciones} publicaciones)`;
}

function Fila({ linea, total }: { linea: LineaPanel; total?: boolean }) {
  const conAlcance = tieneAlcance(linea.plataforma);

  return (
    <tr
      className={
        total
          ? "border-b border-[var(--color-filete-fuerte)] bg-[var(--color-realce)]/70"
          : "border-b border-[var(--color-filete)] last:border-0"
      }
    >
      <td className={`td ${total ? "font-semibold" : ""}`}>{linea.etiqueta}</td>
      <td className="td text-right">
        {linea.publicaciones === 0 ? (
          <span className="text-[var(--color-tinta-tenue)]">—</span>
        ) : (
          <span className="cifra font-medium">{linea.publicaciones}</span>
        )}
      </td>
      <td className="td text-right" title={conAlcance ? undefined : "YouTube no entrega alcance"}>
        {conAlcance ? (
          <Cifra valor={linea.dia.alcance} />
        ) : (
          <span className="text-[var(--color-tinta-tenue)]">n/a</span>
        )}
      </td>
      <td className="td text-right">
        <Cifra valor={linea.dia.visualizaciones} />
      </td>
      <td className="td text-right">
        <Cifra valor={linea.dia.interacciones} />
      </td>
      <td
        className="td text-right"
        title={
          linea.base?.engagement_prom != null
            ? `Línea base: ${porcentaje(linea.base.engagement_prom)}`
            : undefined
        }
      >
        <Pct valor={linea.dia.engagement} />
      </td>
      <td className="td text-right">
        <Cifra valor={linea.dia.nuevos_seguidores} fino />
      </td>

      <td className="td">
        <DeltaConBarra valor={linea.deltas.alcance} titulo={contra(linea, "alcance_prom")} />
      </td>
      <td className="td">
        <DeltaConBarra
          valor={linea.deltas.visualizaciones}
          titulo={contra(linea, "visualizaciones_prom")}
        />
      </td>
      <td className="td">
        <DeltaConBarra
          valor={linea.deltas.interacciones}
          titulo={contra(linea, "interacciones_prom")}
        />
      </td>
      <td className="td">
        <DeltaConBarra
          valor={linea.deltas.nuevos_seguidores}
          titulo={contra(linea, "nuevos_seguidores_prom")}
        />
      </td>
    </tr>
  );
}

export function BloquePanel({ bloque }: { bloque: BloquePlataforma }) {
  const { plataforma, total, categorias, sinDatos } = bloque;
  const conAlcance = tieneAlcance(plataforma);

  return (
    <section className="tarjeta overflow-hidden">
      <CabeceraPlataforma
        plataforma={plataforma}
        derecha={
          <div className="flex items-center gap-2">
            {!conAlcance && (
              <Insignia tono="aviso">engagement sobre visualizaciones</Insignia>
            )}
            {!sinDatos && (
              <span className="text-xs text-[var(--color-tinta-suave)]">
                {numero(total.publicaciones)}{" "}
                {total.publicaciones === 1 ? "publicación" : "publicaciones"}
              </span>
            )}
          </div>
        }
      />

      {sinDatos ? (
        /* §8 — estados vacíos claros: nunca una tabla llena de ceros. */
        <p className="px-4 py-6 text-sm text-[var(--color-tinta-suave)]">
          Sin registros de {plataforma} para este día.
        </p>
      ) : (
        <div className="scroll-x">
          <table className="w-full border-collapse text-left">
            <thead className="border-b border-[var(--color-filete)]">
              <tr>
                <th className="th">Categoría</th>
                <th className="th text-right">Pub.</th>
                <th className="th text-right">Alcance</th>
                <th className="th text-right">Visualiz.</th>
                <th className="th text-right">Interacc.</th>
                <th className="th text-right">Engagement</th>
                <th className="th text-right">Nuevos seg.</th>
                <th className="th">Δ Alcance</th>
                <th className="th">Δ Visualiz.</th>
                <th className="th">Δ Interacc.</th>
                <th className="th">Δ Seguidores</th>
              </tr>
            </thead>
            <tbody>
              {/* §9.2 — el TOTAL sale de todas las filas de la plataforma,
                  no de sumar las categorías. */}
              <Fila linea={total} total />
              {categorias.map((c) => (
                <Fila key={c.etiqueta} linea={c} />
              ))}
            </tbody>
          </table>
        </div>
      )}

      {!sinDatos && !conAlcance && (
        <p className="border-t border-[var(--color-filete)] px-4 py-2 text-[11px] text-[var(--color-tinta-tenue)]">
          YouTube no entrega alcance: su engagement se calcula sobre visualizaciones
          y no es comparable con el de las otras plataformas.
        </p>
      )}
    </section>
  );
}
