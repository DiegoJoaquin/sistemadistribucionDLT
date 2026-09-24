import Link from "next/link";
import { BloqueCatastro } from "@/componentes/BloqueCatastro";
import { Delta } from "@/componentes/Delta";
import { NavegacionSemana } from "@/componentes/NavegacionSemana";
import { SeriesCruzadas } from "@/componentes/SeriesCruzadas";
import { Insignia, Nota, Vacio } from "@/componentes/ui";
import { catastroDelPeriodo } from "@/lib/datos/consultas";
import type { DestacadaCatastro } from "@/lib/dominio/catastro";
import {
  fechaCorta,
  hoyISO,
  mesLargo,
  rotularSemana,
  semanaDe,
  type Semana,
} from "@/lib/dominio/formato";

export const metadata = { title: "Catastro semanal · KPIs DLT" };

function primero(v: string | string[] | undefined): string | undefined {
  const s = Array.isArray(v) ? v[0] : v;
  return s && /^\d{4}-\d{2}-\d{2}$/.test(s) ? s : undefined;
}

/** ¿La línea base cubre alguno de los días de la semana? */
function mesmoMes(mesBase: string, semana: Semana): boolean {
  const mes = mesBase.slice(0, 7);
  return semana.desde.slice(0, 7) === mes || semana.hasta.slice(0, 7) === mes;
}

export default async function PaginaCatastro(props: PageProps<"/catastro">) {
  const sp = await props.searchParams;
  const hoy = hoyISO();

  const semana = semanaDe(primero(sp.semana) ?? hoy);
  const catastro = await catastroDelPeriodo(semana.desde, semana.hasta);

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-lg font-semibold tracking-tight">Catastro semanal</h1>
          <p className="mt-0.5 text-sm text-[var(--color-tinta-suave)]">
            Qué se publicó del {rotularSemana(semana)}, por cuenta y por serie.
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <NavegacionSemana semana={semana} ruta="/catastro" />
          <Link href={`/reporte?semana=${semana.desde}`} className="boton">
            Armar el reporte
          </Link>
        </div>
      </div>

      {!catastro.base && (
        <Nota>
          No hay ninguna línea base activa, así que todas las variaciones se
          muestran como guion.{" "}
          <Link href="/base" className="underline underline-offset-2">
            Importa los archivos de un mes
          </Link>{" "}
          para tener contra qué comparar.
        </Nota>
      )}

      {/*
        Si la línea base es del mismo mes que la semana, las publicaciones de
        esta semana están DENTRO de la base y la comparación es parcialmente
        contra sí misma. Una serie que solo salió esta semana daría 0,0% exacto,
        que se lee como "igual que siempre" cuando en realidad es "no hay con
        qué comparar todavía".
      */}
      {catastro.base && mesmoMes(catastro.base.mes, semana) && (
        <Nota>
          La línea base activa es de {mesLargo(catastro.base.mes)}, el mismo mes
          que esta semana. Las publicaciones de la semana están incluidas en esa
          base, así que las variaciones se comparan en parte contra sí mismas —
          una serie que solo salió esta semana va a marcar 0,0%. Para un reporte
          semanal limpio, la línea base debería ser de un mes anterior.
        </Nota>
      )}

      {!catastro.hayAlgo ? (
        <Vacio
          titulo={`No hay publicaciones registradas del ${rotularSemana(semana)}.`}
          detalle="Sube las exportaciones de la semana desde el registro y las filas se crean solas, o revisa otra semana."
          accion={
            <Link href="/registro" className="boton-suave mt-1">
              Ir al registro
            </Link>
          }
        />
      ) : (
        <>
          <div className="tarjeta flex flex-wrap items-center gap-x-6 gap-y-2 p-4 text-sm">
            <Dato valor={catastro.publicaciones} de="publicaciones" />
            <Dato valor={catastro.series} de="series distintas" />
            <Dato valor={catastro.bloques.length} de="cuentas con actividad" />
            {catastro.cruzadas.length > 0 && (
              <Dato
                valor={catastro.cruzadas.length}
                de="series en más de una cuenta"
              />
            )}
            {catastro.base && (
              <span className="text-xs text-[var(--color-tinta-tenue)]">
                Comparado contra la línea base de {mesLargo(catastro.base.mes)}
              </span>
            )}
          </div>

          {(catastro.mejores.length > 0 || catastro.peores.length > 0) && (
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
              <ListaDestacadas
                titulo="Lo que más subió"
                items={catastro.mejores}
              />
              <ListaDestacadas titulo="Lo que más bajó" items={catastro.peores} />
            </div>
          )}

          <SeriesCruzadas series={catastro.cruzadas} />

          {catastro.bloques.map((bloque) => (
            <BloqueCatastro key={bloque.cuenta.id} bloque={bloque} />
          ))}

          <p className="text-[11px] text-[var(--color-tinta-tenue)]">
            Todos los valores son promedios por publicación (§9.1), nunca sumas:
            una serie con 10 publicaciones no se ve mejor que una con 2 solo por
            haber salido más veces. Semana del {fechaCorta(semana.desde)} al{" "}
            {fechaCorta(semana.hasta)}.
          </p>
        </>
      )}
    </div>
  );
}

function Dato({ valor, de }: { valor: number; de: string }) {
  return (
    <span className="flex items-baseline gap-1.5">
      <strong className="cifra text-base font-semibold">{valor}</strong>
      <span className="text-[var(--color-tinta-suave)]">{de}</span>
    </span>
  );
}

function ListaDestacadas({
  titulo,
  items,
}: {
  titulo: string;
  items: DestacadaCatastro[];
}) {
  return (
    <section className="tarjeta p-4">
      <h2 className="text-sm font-semibold">{titulo}</h2>
      <p className="mt-0.5 text-[11px] text-[var(--color-tinta-tenue)]">
        Por publicación, contra el promedio de esa misma serie en la línea base.
      </p>

      {items.length === 0 ? (
        <p className="mt-3 text-sm text-[var(--color-tinta-suave)]">
          Ninguna serie de esta semana tiene línea base con la que compararse.
        </p>
      ) : (
        <ul className="mt-3 space-y-2">
          {items.map((d) => (
            <li
              key={`${d.cuenta.id}-${d.hashtag}`}
              className="flex flex-wrap items-center justify-between gap-2"
            >
              <span className="flex flex-wrap items-baseline gap-1.5">
                <span className="text-[13px] font-medium">#{d.hashtag}</span>
                <span className="text-[11px] text-[var(--color-tinta-tenue)]">
                  {d.cuenta.nombre}
                </span>
                <Insignia>
                  {d.publicaciones} {d.publicaciones === 1 ? "pub." : "pubs."}
                </Insignia>
              </span>
              <span className="flex items-center gap-1.5">
                {/* §9.6 — en YouTube el titular es visualizaciones, no alcance:
                    decirlo evita comparar peras con manzanas. */}
                <span className="text-[11px] text-[var(--color-tinta-tenue)]">
                  {d.metrica === "alcance" ? "alcance" : "visualiz."}
                </span>
                <Delta valor={d.valor} />
              </span>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
