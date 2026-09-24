import { Delta } from "@/componentes/Delta";
import { CabeceraCuenta, Cifra, Insignia, Pct } from "@/componentes/ui";
import type { BloqueCatastro, LineaCatastro } from "@/lib/dominio/catastro";
import { numero, numeroFino, porcentaje } from "@/lib/dominio/formato";
import type { MesInforme, SerieDelCliente } from "@/lib/dominio/informe";
import { tieneAlcanceRed } from "@/lib/dominio/redes";

const MESES = [
  "ene",
  "feb",
  "mar",
  "abr",
  "may",
  "jun",
  "jul",
  "ago",
  "sep",
  "oct",
  "nov",
  "dic",
];

function rotularMes(mes: string): string {
  const [a, m] = mes.split("-").map(Number);
  return `${MESES[m - 1]} ${a}`;
}

/**
 * Cómo le fue al cliente mes a mes.
 *
 * Un informe de nueve meses esconde la evolución detrás de un promedio: el
 * cliente necesita ver si viene subiendo o bajando, no solo el número global.
 *
 * Sin engagement a propósito: §9.6 — YouTube lo calcula sobre visualizaciones
 * y el resto sobre alcance, así que mezclarlo entre cuentas de redes distintas
 * daría un número que parece comparable y no lo es. Va por cuenta, más abajo.
 */
export function EvolucionMensual({ meses }: { meses: MesInforme[] }) {
  if (meses.length < 2) return null;

  return (
    <section className="tarjeta overflow-hidden">
      <div className="border-b border-[var(--color-filete)] px-4 py-3">
        <h2 className="text-sm font-semibold tracking-tight">Mes a mes</h2>
        <p className="mt-0.5 text-xs text-[var(--color-tinta-suave)]">
          Promedios por publicación de todas las cuentas juntas.
        </p>
      </div>

      <div className="scroll-x">
        <table className="w-full border-collapse text-left">
          <thead className="border-b border-[var(--color-filete)] bg-[var(--color-realce)]/60">
            <tr>
              <th className="th">Mes</th>
              <th className="th text-right">Pub.</th>
              <th className="th text-right">Alcance</th>
              <th className="th text-right">Visualiz.</th>
              <th className="th text-right">Interacc.</th>
              <th className="th text-right">Seguidores</th>
            </tr>
          </thead>
          <tbody>
            {meses.map((m) => (
              <tr
                key={m.mes}
                className="border-b border-[var(--color-filete)] last:border-0"
              >
                <td className="td font-medium">{rotularMes(m.mes)}</td>
                <td className="td text-right">
                  <span className="cifra">{m.publicaciones}</span>
                </td>
                <td className="td text-right">
                  <Cifra valor={m.alcance} />
                </td>
                <td className="td text-right">
                  <Cifra valor={m.visualizaciones} />
                </td>
                <td className="td text-right">
                  <Cifra valor={m.interacciones} />
                </td>
                <td className="td text-right">
                  <Cifra valor={m.nuevos_seguidores} fino />
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </section>
  );
}

/** Las series del cliente, sumando todas las cuentas donde salió cada una. */
export function TablaSeriesCliente({ series }: { series: SerieDelCliente[] }) {
  if (series.length === 0) return null;

  return (
    <section className="tarjeta overflow-hidden">
      <div className="border-b border-[var(--color-filete)] px-4 py-3">
        <h2 className="text-sm font-semibold tracking-tight">Series del cliente</h2>
        <p className="mt-0.5 text-xs text-[var(--color-tinta-suave)]">
          Sumando todas las cuentas donde salió cada una. El detalle por cuenta
          va más abajo.
        </p>
      </div>

      <div className="scroll-x">
        <table className="w-full border-collapse text-left">
          <thead className="border-b border-[var(--color-filete)] bg-[var(--color-realce)]/60">
            <tr>
              <th className="th">Serie</th>
              <th className="th text-right">Pub.</th>
              <th className="th text-right">Cuentas</th>
              <th className="th text-right">Alcance</th>
              <th className="th text-right">Visualiz.</th>
              <th className="th text-right">Interacc.</th>
              <th className="th text-right">Seguidores</th>
            </tr>
          </thead>
          <tbody>
            {series.map((s) => (
              <tr
                key={s.hashtag}
                className="border-b border-[var(--color-filete)] last:border-0"
              >
                <td className="td font-medium">#{s.hashtag}</td>
                <td className="td text-right">
                  <span className="cifra">{s.publicaciones}</span>
                </td>
                <td className="td text-right">
                  <span className="cifra">{s.cuentas}</span>
                </td>
                <td className="td text-right">
                  <Cifra valor={s.total.alcance} />
                </td>
                <td className="td text-right">
                  <Cifra valor={s.total.visualizaciones} />
                </td>
                <td className="td text-right">
                  <Cifra valor={s.total.interacciones} />
                </td>
                <td className="td text-right">
                  <Cifra valor={s.total.nuevos_seguidores} fino />
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </section>
  );
}

/* ------------------------------------------------------------------ */
/* Bloque por cuenta                                                   */
/* ------------------------------------------------------------------ */

type CampoBase =
  | "alcance_prom"
  | "visualizaciones_prom"
  | "interacciones_prom"
  | "nuevos_seguidores_prom";

const COLUMNAS: {
  metrica: "alcance" | "visualizaciones" | "interacciones" | "nuevos_seguidores";
  base: CampoBase;
  titulo: string;
}[] = [
  { metrica: "alcance", base: "alcance_prom", titulo: "Alcance" },
  { metrica: "visualizaciones", base: "visualizaciones_prom", titulo: "Visualiz." },
  { metrica: "interacciones", base: "interacciones_prom", titulo: "Interacc." },
  { metrica: "nuevos_seguidores", base: "nuevos_seguidores_prom", titulo: "Seguidores" },
];

function contra(
  base: { n_publicaciones: number } & Record<CampoBase, number | null>,
  campo: CampoBase,
  queEs: string,
): string {
  const v = base[campo];
  if (v === null) return `${queEs}: no tiene esta métrica`;
  return `${queEs}: ${numeroFino(v)} por publicación (${base.n_publicaciones} publicaciones)`;
}

function ParDeltas({
  linea,
  metrica,
  campo,
}: {
  linea: LineaCatastro;
  metrica: (typeof COLUMNAS)[number]["metrica"];
  campo: CampoBase;
}) {
  /*
   * En la fila TOTAL del bloque, el total es el del CLIENTE en esa cuenta, y
   * `vsSuBase` ya lo compara contra el promedio general de la cuenta. El
   * segundo delta sería el mismo número.
   */
  if (linea.corte.tipo === "total") {
    return (
      <Delta
        valor={linea.vsSuBase[metrica]}
        titulo={
          linea.base
            ? contra(linea.base, campo, "Promedio general de la cuenta")
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
          title="Contra el promedio general de la cuenta"
        >
          vs
        </span>
        <Delta
          valor={linea.vsPromedioCuenta[metrica]}
          titulo={
            linea.baseCuenta
              ? contra(linea.baseCuenta, campo, "Promedio general de la cuenta")
              : "Sin línea base para esta cuenta"
          }
        />
      </span>
    </span>
  );
}

function Fila({ linea, cliente }: { linea: LineaCatastro; cliente: string }) {
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
          {/* En un informe de cliente el TOTAL es el total DEL CLIENTE en esa
              cuenta, no el de la cuenta. Rotularlo "TOTAL" a secas se leería
              como el total de la cuenta y sería engañoso. */}
          <span>{total ? `Total ${cliente}` : linea.etiqueta}</span>
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
            ? `Referencia: ${porcentaje(linea.base.engagement_prom)}`
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

export function BloqueInforme({
  bloque,
  cliente,
}: {
  bloque: BloqueCatastro;
  cliente: string;
}) {
  const { cuenta, total, series } = bloque;
  const conAlcance = tieneAlcanceRed(cuenta.red);

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
              {total.publicaciones === 1 ? "publicación" : "publicaciones"} de{" "}
              {cliente}
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
            <Fila linea={total} cliente={cliente} />
            {series.map((s) => (
              <Fila key={s.etiqueta} linea={s} cliente={cliente} />
            ))}
          </tbody>
        </table>
      </div>

      <div className="space-y-0.5 border-t border-[var(--color-filete)] px-4 py-2 text-[11px] leading-relaxed text-[var(--color-tinta-tenue)]">
        <p>
          En cada variación, <strong>arriba</strong> va contra la misma serie en
          la línea base y <strong>abajo</strong> contra el promedio general de la
          cuenta — o sea, contra todo lo que publica {cuenta.nombre}, no solo lo
          de {cliente}.
        </p>
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
