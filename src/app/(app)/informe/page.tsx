import Link from "next/link";
import {
  BloqueInforme,
  EvolucionMensual,
  TablaSeriesCliente,
} from "@/componentes/BloqueInforme";
import { EnviarInforme } from "@/componentes/EnviarInforme";
import { VistaPreviaReporte } from "@/componentes/VistaPreviaReporte";
import { Cifra, Insignia, Nota, Pct, Vacio } from "@/componentes/ui";
import { parsearDestinatarios } from "@/lib/correo/direcciones";
import { faltantesCorreo } from "@/lib/correo/entorno";
import { informeDeCliente, listarClientes } from "@/lib/datos/consultas";
import { fechaCorta, hoyISO, mesLargo } from "@/lib/dominio/formato";
import {
  construirReporteCliente,
  htmlCliente,
  textoCliente,
} from "@/lib/reporte/cliente";
import { urlPublica } from "@/lib/supabase/entorno";

export const metadata = { title: "Informes por cliente · KPIs DLT" };

function fecha(v: string | string[] | undefined): string | undefined {
  const s = Array.isArray(v) ? v[0] : v;
  return s && /^\d{4}-\d{2}-\d{2}$/.test(s) ? s : undefined;
}

function texto(v: string | string[] | undefined): string | undefined {
  const s = Array.isArray(v) ? v[0] : v;
  return s && s.trim() !== "" ? s : undefined;
}

/** ¿El mes de la línea base cae dentro del período del informe? */
function baseDentroDelPeriodo(mesBase: string, desde: string, hasta: string): boolean {
  const mes = mesBase.slice(0, 7);
  return mes >= desde.slice(0, 7) && mes <= hasta.slice(0, 7);
}

export default async function PaginaInforme(props: PageProps<"/informe">) {
  const sp = await props.searchParams;
  const hoy = hoyISO();

  const clientes = await listarClientes();
  const elegido = texto(sp.cliente);
  const cliente =
    clientes.find((c) => c.id === elegido) ??
    (elegido === undefined ? clientes.find((c) => c.activo) : undefined);

  /*
   * Por defecto, desde el 1 de enero del año en curso: el primer pedido fue un
   * informe desde enero, y un informe de cliente casi siempre cubre un período
   * largo, no una semana.
   */
  const desde = fecha(sp.desde) ?? `${hoy.slice(0, 4)}-01-01`;
  const hasta = fecha(sp.hasta) ?? hoy;

  const resultado = cliente
    ? await informeDeCliente(cliente, desde, hasta)
    : null;

  const reporte = resultado
    ? construirReporteCliente(resultado.informe, resultado.base?.mes ?? null)
    : null;

  const faltantes = faltantesCorreo();
  const destinatarios = parsearDestinatarios(
    process.env.REPORTE_DESTINATARIOS,
  ).validos;

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-lg font-semibold tracking-tight">
            Informes por cliente
          </h1>
          <p className="mt-0.5 text-sm text-[var(--color-tinta-suave)]">
            Las mismas métricas del catastro, pero solo de los hashtags de un
            cliente y en el período que elijas.
          </p>
        </div>
        <Link href="/clientes" className="boton-suave">
          Administrar clientes
        </Link>
      </div>

      {clientes.length === 0 ? (
        <Vacio
          titulo="Todavía no hay clientes configurados."
          detalle="Un cliente es una lista de hashtags. Crea el primero y desde ahí se puede emitir su informe."
          accion={
            <Link href="/clientes" className="boton mt-1">
              Crear un cliente
            </Link>
          }
        />
      ) : (
        <>
          {/* Filtros: form GET, funciona sin JavaScript. */}
          <form
            method="get"
            className="tarjeta flex flex-wrap items-end gap-3 p-3"
            aria-label="Filtros del informe"
          >
            <div className="space-y-1">
              <label className="etiqueta" htmlFor="cliente">
                Cliente
              </label>
              <select
                id="cliente"
                name="cliente"
                defaultValue={cliente?.id ?? ""}
                className="campo"
              >
                {clientes.map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.nombre}
                    {c.activo ? "" : " (inactivo)"}
                  </option>
                ))}
              </select>
            </div>
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
              Generar informe
            </button>
          </form>

          {resultado && cliente && (
            <>
              <div className="flex flex-wrap items-baseline justify-between gap-2">
                <h2 className="text-base font-semibold tracking-tight">
                  {cliente.nombre} · {fechaCorta(desde)} al {fechaCorta(hasta)}
                </h2>
                {resultado.base && (
                  <span className="text-xs text-[var(--color-tinta-tenue)]">
                    Comparado contra la línea base de{" "}
                    {mesLargo(resultado.base.mes)}
                  </span>
                )}
              </div>

              {!resultado.base && (
                <Nota>
                  No hay ninguna línea base activa, así que todas las variaciones
                  se muestran como guion.{" "}
                  <Link href="/base" className="underline underline-offset-2">
                    Importa los archivos de un mes
                  </Link>{" "}
                  para tener contra qué comparar.
                </Nota>
              )}

              {/*
                Si el mes de la línea base cae dentro del período, esas
                publicaciones están incluidas en la referencia y la comparación
                es en parte contra sí misma: una serie que solo salió ese mes
                marca 0,0% exacto, que se lee como "igual que siempre" y no lo es.
              */}
              {resultado.base && baseDentroDelPeriodo(resultado.base.mes, desde, hasta) && (
                <Nota>
                  La línea base activa es de {mesLargo(resultado.base.mes)}, un
                  mes que está dentro del período del informe. Las publicaciones
                  de ese mes están incluidas en la referencia, así que sus
                  variaciones se comparan en parte contra sí mismas. Para un
                  informe limpio conviene que la línea base sea de un mes
                  anterior al período.
                </Nota>
              )}

              {!resultado.informe.hayDatos ? (
                <Vacio
                  titulo={`No hay publicaciones de ${cliente.nombre} en ese período.`}
                  detalle={
                    cliente.hashtags.length === 0
                      ? "El cliente no tiene ningún hashtag configurado."
                      : `Se buscaron ${cliente.hashtags.length} hashtags: ${cliente.hashtags
                          .map((h) => `#${h}`)
                          .join(", ")}. Revisa que estén bien escritos o amplía el período.`
                  }
                  accion={
                    <Link href="/clientes" className="boton-suave mt-1">
                      Revisar sus hashtags
                    </Link>
                  }
                />
              ) : (
                <>
                  <section className="tarjeta p-4">
                    <div className="flex flex-wrap items-center gap-x-6 gap-y-2 text-sm">
                      <Dato valor={resultado.informe.total.publicaciones} de="publicaciones" />
                      <Dato valor={resultado.informe.total.series} de="series" />
                      <Dato valor={resultado.informe.total.cuentas} de="cuentas" />
                    </div>

                    <div className="mt-3 grid grid-cols-2 gap-3 border-t border-[var(--color-filete)] pt-3 sm:grid-cols-5">
                      <Metrica
                        titulo="Alcance"
                        valor={resultado.informe.total.metricas.alcance}
                        sobre={resultado.informe.total.denominadores.alcance}
                        de={resultado.informe.total.publicaciones}
                      />
                      <Metrica
                        titulo="Visualizaciones"
                        valor={resultado.informe.total.metricas.visualizaciones}
                        sobre={resultado.informe.total.denominadores.visualizaciones}
                        de={resultado.informe.total.publicaciones}
                      />
                      <Metrica
                        titulo="Interacciones"
                        valor={resultado.informe.total.metricas.interacciones}
                        sobre={resultado.informe.total.denominadores.interacciones}
                        de={resultado.informe.total.publicaciones}
                      />
                      <div className="space-y-0.5">
                        <p className="etiqueta">Engagement</p>
                        <p className="text-base font-semibold">
                          <Pct valor={resultado.informe.total.metricas.engagement} />
                        </p>
                        {resultado.informe.total.metricas.engagement === null &&
                          resultado.informe.total.cuentas > 1 && (
                            <p className="text-[11px] leading-tight text-[var(--color-tinta-tenue)]">
                              No se puede sumar entre redes
                            </p>
                          )}
                      </div>
                      <Metrica
                        titulo="Nuevos seguidores"
                        valor={resultado.informe.total.metricas.nuevos_seguidores}
                        sobre={resultado.informe.total.denominadores.nuevos_seguidores}
                        de={resultado.informe.total.publicaciones}
                        fino
                      />
                    </div>

                    <p className="mt-3 text-[11px] leading-relaxed text-[var(--color-tinta-tenue)]">
                      Promedios por publicación de todo el contenido de{" "}
                      {cliente.nombre} en el período, sumando sus{" "}
                      {resultado.informe.total.cuentas} cuentas.
                    </p>
                  </section>

                  {resultado.informe.hashtagsSinDatos.length > 0 && (
                    <Nota>
                      {resultado.informe.hashtagsSinDatos.length === 1
                        ? "Un hashtag configurado no tuvo"
                        : `${resultado.informe.hashtagsSinDatos.length} hashtags configurados no tuvieron`}{" "}
                      ninguna publicación en este período:{" "}
                      {resultado.informe.hashtagsSinDatos
                        .map((h) => `#${h}`)
                        .join(" · ")}
                      . Puede ser que no se hayan usado, o que estén escritos
                      distinto en el registro.
                    </Nota>
                  )}

                  <EvolucionMensual meses={resultado.informe.porMes} />

                  <TablaSeriesCliente series={resultado.informe.series} />

                  {resultado.informe.bloques.map((b) => (
                    <BloqueInforme
                      key={b.cuenta.id}
                      bloque={b}
                      cliente={cliente.nombre}
                    />
                  ))}

                  {reporte && cliente && (
                    <section className="space-y-3">
                      <VistaPreviaReporte
                        html={htmlCliente(reporte, { urlBase: urlPublica() })}
                        texto={textoCliente(reporte)}
                        nombreArchivo={`informe-${cliente.nombre
                          .toLowerCase()
                          .replace(/[^a-z0-9]+/g, "-")
                          .replace(/^-|-$/g, "")}-${desde}-a-${hasta}`}
                        titulo={`Informe de ${cliente.nombre} para enviar`}
                      />
                      <EnviarInforme
                        cliente={cliente.id}
                        nombreCliente={cliente.nombre}
                        desde={desde}
                        hasta={hasta}
                        destinatarios={destinatarios}
                        faltantes={faltantes}
                      />
                    </section>
                  )}

                  <p className="text-[11px] leading-relaxed text-[var(--color-tinta-tenue)]">
                    Todos los valores son promedios por publicación, no sumas.
                    El total de cada cuenta es el total{" "}
                    <strong>de {cliente.nombre}</strong> en esa cuenta, no el de
                    la cuenta completa. Las publicaciones sin hashtag no entran:
                    no se puede afirmar que sean del cliente.
                  </p>
                </>
              )}
            </>
          )}
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

/**
 * Una métrica del total, con el divisor a la vista cuando no es el total.
 *
 * §9.4 — una publicación que no trae la métrica no entra al promedio ni a su
 * divisor. Callarlo hace que "19 publicaciones · alcance 41.431" se lea como
 * un promedio sobre 19 cuando en realidad es sobre 12, porque siete son de
 * YouTube y YouTube no entrega alcance. En un informe que se le manda a un
 * cliente, esa es una cifra mal entendida.
 */
function Metrica({
  titulo,
  valor,
  sobre,
  de,
  fino = false,
}: {
  titulo: string;
  valor: number | null;
  /** Publicaciones que aportaron esta métrica. */
  sobre: number;
  /** Publicaciones totales del cliente en el período. */
  de: number;
  fino?: boolean;
}) {
  return (
    <div className="space-y-0.5">
      <p className="etiqueta">{titulo}</p>
      <p className="text-base font-semibold">
        <Cifra valor={valor} fino={fino} />
      </p>
      {valor !== null && sobre < de && (
        <p
          className="text-[11px] leading-tight text-[var(--color-tinta-tenue)]"
          title="Las publicaciones que no entregan esta métrica quedan fuera del promedio y de su divisor"
        >
          sobre {sobre} de {de} publicaciones
        </p>
      )}
    </div>
  );
}
