import { Delta } from "@/componentes/Delta";
import { CabeceraCuenta, Cifra, Insignia, Pct } from "@/componentes/ui";
import type {
  BloqueCatastro as Bloque,
  LineaCatastro,
  Metricas,
} from "@/lib/dominio/catastro";
import { numero, numeroFino, porcentaje } from "@/lib/dominio/formato";
import { tieneAlcanceRed } from "@/lib/dominio/redes";

type CampoBase =
  | "alcance_prom"
  | "visualizaciones_prom"
  | "interacciones_prom"
  | "nuevos_seguidores_prom";

type CampoMetrica = keyof Omit<Metricas, "engagement">;

const COLUMNAS: { metrica: CampoMetrica; base: CampoBase; titulo: string }[] = [
  { metrica: "alcance", base: "alcance_prom", titulo: "Alcance" },
  { metrica: "visualizaciones", base: "visualizaciones_prom", titulo: "Visualiz." },
  { metrica: "interacciones", base: "interacciones_prom", titulo: "Interacc." },
  { metrica: "nuevos_seguidores", base: "nuevos_seguidores_prom", titulo: "Seguidores" },
];

/** Contra qué compara, para que el número no quede sin explicación. */
function contra(
  base: { n_publicaciones: number } & Record<CampoBase, number | null>,
  campo: CampoBase,
  queEs: string,
): string {
  const v = base[campo];
  if (v === null) return `${queEs}: no tiene esta métrica`;
  return `${queEs}: ${numeroFino(v)} por publicación (${base.n_publicaciones} publicaciones)`;
}

/**
 * Las dos comparaciones, una encima de la otra.
 *
 * Arriba la serie contra sí misma, abajo contra el promedio de la cuenta. Van
 * juntas porque separadas en ocho columnas la tabla no se podía leer, y porque
 * la pregunta que responden es una sola: ¿esto anduvo bien?
 */
function ParDeltas({
  linea,
  metrica,
  campo,
}: {
  linea: LineaCatastro;
  metrica: CampoMetrica;
  campo: CampoBase;
}) {
  // El TOTAL ya se compara contra el total de la cuenta: el segundo delta
  // sería el mismo número y una columna de guiones no aporta nada.
  if (linea.corte.tipo === "total") {
    return (
      <Delta
        valor={linea.vsSuBase[metrica]}
        titulo={
          linea.base
            ? contra(linea.base, campo, "Línea base de la cuenta")
            : "Sin línea base para esta cuenta"
        }
      />
    );
  }

  return (
    <span className="inline-flex flex-col gap-1">
      <Delta
        valor={linea.vsSuBase[metrica]}
        titulo={
          linea.base
            ? contra(linea.base, campo, `Línea base de ${linea.etiqueta}`)
            : `${linea.etiqueta} no aparece en la línea base: es una serie nueva`
        }
      />
      <span className="flex items-center gap-1">
        <span
          aria-hidden
          className="w-3 text-center text-[9px] leading-none text-[var(--color-tinta-tenue)]"
          title="Contra el promedio de la cuenta"
        >
          vs
        </span>
        <Delta
          valor={linea.vsPromedioCuenta[metrica]}
          titulo={
            linea.baseCuenta
              ? contra(linea.baseCuenta, campo, "Promedio de la cuenta")
              : "Sin línea base para esta cuenta"
          }
        />
      </span>
    </span>
  );
}

function Fila({ linea }: { linea: LineaCatastro }) {
  const total = linea.corte.tipo === "total";
  const conAlcance = tieneAlcanceRed(linea.cuenta.red);

  return (
    <tr
      className={
        total
          ? "border-b border-[var(--color-filete-fuerte)] bg-[var(--color-realce)]/70"
          : "border-b border-[var(--color-filete)] align-top last:border-0"
      }
    >
      <td className={`td ${total ? "font-semibold" : ""}`}>
        <span className="flex flex-wrap items-center gap-1.5">
          <span
            className={
              linea.corte.tipo === "sin-hashtag"
                ? "text-[var(--color-tinta-suave)] italic"
                : undefined
            }
          >
            {linea.etiqueta}
          </span>
          {linea.serieNueva && <Insignia tono="aviso">serie nueva</Insignia>}
        </span>
      </td>
      <td className="td text-right">
        <span className="cifra font-medium">{linea.publicaciones}</span>
      </td>
      <td
        className="td text-right"
        title={conAlcance ? undefined : "YouTube no entrega alcance"}
      >
        {conAlcance ? (
          <Cifra valor={linea.periodo.alcance} />
        ) : (
          <span className="text-[var(--color-tinta-tenue)]">n/a</span>
        )}
      </td>
      <td className="td text-right">
        <Cifra valor={linea.periodo.visualizaciones} />
      </td>
      <td className="td text-right">
        <Cifra valor={linea.periodo.interacciones} />
      </td>
      <td
        className="td text-right"
        title={
          linea.base?.engagement_prom != null
            ? `Su línea base: ${porcentaje(linea.base.engagement_prom)}`
            : undefined
        }
      >
        <Pct valor={linea.periodo.engagement} />
      </td>
      <td className="td text-right">
        <Cifra valor={linea.periodo.nuevos_seguidores} fino />
      </td>

      {COLUMNAS.map((c) => (
        <td key={c.metrica} className="td">
          <ParDeltas linea={linea} metrica={c.metrica} campo={c.base} />
        </td>
      ))}
    </tr>
  );
}

export function BloqueCatastro({ bloque }: { bloque: Bloque }) {
  const { cuenta, total, series } = bloque;
  const conAlcance = tieneAlcanceRed(cuenta.red);
  const nuevas = series.filter((s) => s.serieNueva).length;

  return (
    <section className="tarjeta overflow-hidden">
      <CabeceraCuenta
        cuenta={cuenta}
        derecha={
          <div className="flex flex-wrap items-center gap-2">
            {cuenta.es_influencer && <Insignia>influencer</Insignia>}
            {!conAlcance && (
              <Insignia tono="aviso">engagement sobre visualizaciones</Insignia>
            )}
            <span className="text-xs text-[var(--color-tinta-suave)]">
              {numero(total.publicaciones)}{" "}
              {total.publicaciones === 1 ? "publicación" : "publicaciones"} ·{" "}
              {series.filter((s) => s.corte.tipo === "hashtag").length}{" "}
              {series.filter((s) => s.corte.tipo === "hashtag").length === 1
                ? "serie"
                : "series"}
            </span>
          </div>
        }
      />

      <div className="scroll-x">
        <table className="w-full border-collapse text-left">
          <thead className="border-b border-[var(--color-filete)]">
            <tr>
              <th className="th">Serie</th>
              <th className="th text-right">Pub.</th>
              <th className="th text-right">Alcance</th>
              <th className="th text-right">Visualiz.</th>
              <th className="th text-right">Interacc.</th>
              <th className="th text-right">Engagement</th>
              <th className="th text-right">Nuevos seg.</th>
              {COLUMNAS.map((c) => (
                <th key={c.metrica} className="th">
                  Δ {c.titulo}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {/* §9.2 — el TOTAL sale de todas las filas de la cuenta, no de
                sumar las series: una publicación con dos hashtags se contaría
                dos veces. */}
            <Fila linea={total} />
            {series.map((s) => (
              <Fila key={s.etiqueta} linea={s} />
            ))}
          </tbody>
        </table>
      </div>

      <div className="space-y-0.5 border-t border-[var(--color-filete)] px-4 py-2 text-[11px] leading-relaxed text-[var(--color-tinta-tenue)]">
        <p>
          En cada variación, <strong>arriba</strong> va contra la misma serie en
          la línea base y <strong>abajo</strong> contra el promedio total de la
          cuenta.
        </p>
        {nuevas > 0 && (
          <p>
            {nuevas}{" "}
            {nuevas === 1
              ? "serie no existía en la línea base, así que no tiene"
              : "series no existían en la línea base, así que no tienen"}{" "}
            con qué compararse. Solo se puede ver cómo rinden frente al promedio
            de la cuenta.
          </p>
        )}
        {!conAlcance && (
          <p>
            YouTube no entrega alcance: su engagement se calcula sobre
            visualizaciones y no es comparable con el de las otras redes.
          </p>
        )}
      </div>
    </section>
  );
}
