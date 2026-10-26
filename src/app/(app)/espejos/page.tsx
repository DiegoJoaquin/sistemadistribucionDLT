import Link from "next/link";
import { NavegacionSemana } from "@/componentes/NavegacionSemana";
import { Nota, Vacio } from "@/componentes/ui";
import { espejosDeSemana, SEMANAS_DE_REFERENCIA } from "@/lib/datos/espejos";
import { type Espejo, REDES_ESPEJO, UMBRAL_DISPAR, type VersionEspejo } from "@/lib/dominio/espejos";
import { fechaCorta, hoyISO, numero, porcentajeDelta, rotularSemana, semanaDe } from "@/lib/dominio/formato";

export const metadata = { title: "Espejos · KPIs DLT" };

function primero(v: string | string[] | undefined): string | undefined {
  const s = Array.isArray(v) ? v[0] : v;
  return s && /^\d{4}-\d{2}-\d{2}$/.test(s) ? s : undefined;
}

function veces(x: number): string {
  return x.toLocaleString("es-CL", { maximumFractionDigits: 1, minimumFractionDigits: 1 });
}

function Celda({ v, tono }: { v: VersionEspejo | undefined; tono: "mejor" | "peor" | null }) {
  if (!v) return <td className="td text-center text-[var(--color-tinta-tenue)]">—</td>;
  const fondo = tono === "mejor" ? "bg-emerald-50" : tono === "peor" ? "bg-red-50" : "";
  return (
    <td className={`td text-right align-top ${fondo}`}>
      {v.enlace ? (
        <a href={v.enlace} target="_blank" rel="noreferrer" className="cifra font-semibold underline-offset-2 hover:underline">
          {v.visualizaciones === null ? "—" : numero(v.visualizaciones)}
        </a>
      ) : (
        <span className="cifra font-semibold">{v.visualizaciones === null ? "—" : numero(v.visualizaciones)}</span>
      )}
      <span className="block text-[11px] text-[var(--color-tinta-tenue)]">{v.cuenta}</span>
      <span
        className={`block text-[12px] cifra ${
          v.indice === null ? "text-[var(--color-tinta-tenue)]" : v.indice >= 1 ? "text-emerald-700" : "text-red-700"
        }`}
        title={v.habitual === null ? "La cuenta no tiene suficientes videos para saber lo habitual" : `Lo habitual de la cuenta: ${numero(v.habitual)} visualizaciones`}
      >
        {v.indice === null ? "sin habitual" : `${porcentajeDelta(v.indice - 1)} vs habitual`}
      </span>
      {v.porDuracion && (
        <span
          className="block text-[11px] text-[var(--color-tinta-tenue)]"
          title="No traía título: se reconoció por la duración y la hora de subida"
        >
          por duración
        </span>
      )}
    </td>
  );
}

function Fila({ e }: { e: Espejo }) {
  const porRed = new Map(e.versiones.map((v) => [v.red, v]));
  const tono = (red: string) => (e.dispar ? (red === e.mejor ? "mejor" : red === e.peor ? "peor" : null) : null);
  return (
    <tr className={`border-b border-[var(--color-filete)] last:border-0 ${e.dispar ? "border-l-4 border-l-orange-600" : ""}`}>
      <td className="td max-w-sm whitespace-normal align-top">
        <span className="font-medium">{e.titulo}</span>
        <span className="block text-[11px] text-[var(--color-tinta-tenue)]">{fechaCorta(e.fecha)}</span>
        <span className="block text-[12px]">
          {e.disparidad === null ? (
            <span className="text-[var(--color-tinta-tenue)]">No se puede comparar</span>
          ) : e.dispar ? (
            <strong className="text-orange-800">
              ⚠ {e.mejor} rinde {veces(e.disparidad)} veces lo que {e.peor}
            </strong>
          ) : (
            <span className="text-[var(--color-tinta-suave)]">Parejo ({veces(e.disparidad)}×)</span>
          )}
        </span>
      </td>
      {REDES_ESPEJO.map((r) => (
        <Celda key={r} v={porRed.get(r)} tono={tono(r)} />
      ))}
    </tr>
  );
}

export default async function PaginaEspejos(props: PageProps<"/espejos">) {
  const sp = await props.searchParams;
  const semana = semanaDe(primero(sp.semana) ?? hoyISO());
  const espejos = await espejosDeSemana(semana.desde, semana.hasta);
  const dispares = espejos.filter((e) => e.dispar).length;

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-lg font-semibold tracking-tight">Publicaciones espejo</h1>
          <p className="mt-0.5 max-w-2xl text-sm text-[var(--color-tinta-suave)]">
            El mismo video subido a Instagram, TikTok y YouTube, y cómo le fue en cada red, del{" "}
            {rotularSemana(semana)}. Se reconocen solos al importar los archivos de cada red: por el
            titular, la fecha y la duración.
          </p>
        </div>
        <NavegacionSemana semana={semana} ruta="/espejos" />
      </div>

      {espejos.length === 0 ? (
        <Vacio
          titulo="No hay espejos en esta semana."
          detalle="Puede que no se haya subido ningún video a más de una red, o que falte importar alguna. Sube los archivos de cada red desde el registro y aparecen solos."
          accion={
            <Link href="/registro" className="boton-suave mt-1">
              Ir al registro
            </Link>
          }
        />
      ) : (
        <>
          <p className="text-sm">
            <strong>{espejos.length}</strong> {espejos.length === 1 ? "video subido" : "videos subidos"} a más de una red
            {dispares > 0 ? (
              <>
                {" "}
                · <strong className="text-orange-800">{dispares} con rendimiento muy distinto</strong> entre redes
              </>
            ) : (
              ", todos parejos"
            )}
            .
          </p>
          <section className="tarjeta overflow-hidden">
            <div className="overflow-x-auto">
              <table className="w-full border-collapse text-left">
                <thead className="border-b border-[var(--color-filete)] bg-[var(--color-realce)]/60">
                  <tr>
                    <th className="th">Contenido</th>
                    {REDES_ESPEJO.map((r) => (
                      <th key={r} className="th text-right">
                        {r}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {espejos.map((e) => (
                    <Fila key={e.id} e={e} />
                  ))}
                </tbody>
              </table>
            </div>
          </section>
        </>
      )}

      <Nota>
        Las visualizaciones de una red no se comparan directo con las de otra: 20 mil en YouTube no son
        20 mil en Instagram. Por eso cada versión se mide contra lo habitual de SU cuenta (la mediana de sus
        videos de las {SEMANAS_DE_REFERENCIA} semanas anteriores), y un espejo es dispar cuando una versión
        rinde {UMBRAL_DISPAR} veces o más lo que otra. El export de YouTube de Iconosquare no trae el
        título de los Shorts: esos se reconocen por la duración (la misma, al segundo) y la hora de subida, y
        van marcados «por duración». Si subes también el export de YouTube Studio, se completan los títulos.
      </Nota>
    </div>
  );
}
