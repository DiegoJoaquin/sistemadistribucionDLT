"use client";

import { useMemo, useState } from "react";
import { Caja } from "@/componentes/graficos/Caja";
import { Dispersion } from "@/componentes/graficos/Dispersion";
import { Histograma } from "@/componentes/graficos/Histograma";
import { RankingPosts } from "@/componentes/graficos/RankingPosts";
import { Nota } from "@/componentes/ui";
import {
  AGRUPACIONES,
  type Agrupacion,
  construirCajas,
  construirDispersion,
  construirDistribucion,
  construirRanking,
  type Eje,
  EJES,
  escribirEnEje,
  etiquetaDeGrupo,
  MAXIMO_COLORES,
  MINIMO_CAJA,
  NOMBRE_AGRUPACION,
  NOMBRE_EJE,
  NOMBRE_GRAFICO,
  PREGUNTA_GRAFICO,
  type PublicacionPunto,
  SOLO_EN,
  type TipoGrafico,
  TIPOS_GRAFICO,
  usaColorPorGrupo,
} from "@/lib/dominio/rendimiento";
import { fechaCorta, numero } from "@/lib/dominio/formato";
import { APAGADO } from "@/lib/dominio/paleta";

/**
 * La herramienta de rendimiento por publicación.
 *
 * Cuatro gráficos sobre los mismos datos y una sola fila de controles arriba de
 * todo: la métrica, el color y el período son los mismos se mire lo que se
 * mire, así que cambiar de gráfico no debería obligar a volver a elegir nada.
 * Lo único que cambia es el segundo eje, que solo existe en la dispersión.
 *
 * Lo que queda FUERA del gráfico se muestra siempre y con su motivo. Un gráfico
 * que dibuja 40 de 300 publicaciones y no lo dice invita a sacar una conclusión
 * de la séptima parte de los datos, y acá pasa de verdad: ninguna exportación
 * trae todas las columnas.
 */
export function PanelRendimiento({
  puntos,
  rango,
}: {
  puntos: PublicacionPunto[];
  rango: { desde: string; hasta: string };
}) {
  const [grafico, setGrafico] = useState<TipoGrafico>("dispersion");
  const [ejeX, setEjeX] = useState<Eje>("visualizaciones");
  const [ejeY, setEjeY] = useState<Eje>("me_gusta");
  const [agrupacion, setAgrupacion] = useState<Agrupacion>("tipo_post");
  const [logX, setLogX] = useState(false);
  const [logY, setLogY] = useState(false);
  const [ocultos, setOcultos] = useState<Set<string>>(new Set());
  const [verTabla, setVerTabla] = useState(false);

  /*
   * La métrica de los gráficos de una sola variable es la del eje VERTICAL de
   * la dispersión, no la del horizontal. Es la que se lee como "el resultado":
   * en «me gusta contra visualizaciones», lo que se quiere medir son los me
   * gusta. Así, cambiar de gráfico no cambia de tema.
   */
  const metrica = ejeY;

  const datos = useMemo(() => {
    // `agrupacion` y `ocultos` van repetidos en cada llamada, y no juntos en un
    // objeto, para que las dependencias de este useMemo sean exactamente los
    // valores de los que depende el cálculo y no un objeto nuevo por render.
    switch (grafico) {
      case "dispersion":
        return {
          tipo: "dispersion" as const,
          d: construirDispersion(puntos, { agrupacion, ocultos, ejeX, ejeY, logX, logY }),
        };
      case "caja":
        return {
          tipo: "caja" as const,
          d: construirCajas(puntos, { agrupacion, ocultos, metrica: ejeY, log: logY }),
        };
      case "distribucion":
        return {
          tipo: "distribucion" as const,
          d: construirDistribucion(puntos, { agrupacion, ocultos, metrica: ejeY, log: logY }),
        };
      case "ranking":
        return {
          tipo: "ranking" as const,
          d: construirRanking(puntos, { agrupacion, ocultos, metrica: ejeY }),
        };
    }
  }, [puntos, grafico, ejeX, ejeY, agrupacion, logX, logY, ocultos]);

  const base = datos.d;
  const dosEjes = grafico === "dispersion";
  const conColor = usaColorPorGrupo(grafico);

  /** Las publicaciones dibujadas, ordenadas para la tabla. */
  const tabla = useMemo(
    () => [...base.puntos].sort((a, b) => b.y - a.y).slice(0, 30),
    [base.puntos],
  );

  const alternar = (clave: string) =>
    setOcultos((previos) => {
      const nuevos = new Set(previos);
      if (nuevos.has(clave)) nuevos.delete(clave);
      else nuevos.add(clave);
      return nuevos;
    });

  const { agrupadas, sinX, sinY, noPositivas } = base.excluidas;
  const fuera = agrupadas + sinX + sinY + noPositivas;
  const sinColor = conColor ? base.grupos.filter((g) => g.color === null).length : 0;

  /** El nombre de la métrica que le falta a los excluidos por `sinX`. */
  const ejePrimero = dosEjes ? ejeX : metrica;

  return (
    <div className="space-y-5">
      {/*
        Los cuatro gráficos, con la pregunta que contesta cada uno. Van como
        botones y no como un menú desplegable porque son cuatro y elegir entre
        ellos es la decisión principal de la pantalla.
      */}
      <div className="grid grid-cols-2 gap-2 lg:grid-cols-4">
        {TIPOS_GRAFICO.map((t) => (
          <button
            key={t}
            type="button"
            onClick={() => setGrafico(t)}
            aria-pressed={grafico === t}
            className={`tarjeta px-3 py-2 text-left transition ${
              grafico === t
                ? "border-[var(--color-tinta)] ring-1 ring-[var(--color-tinta)]"
                : "hover:bg-[var(--color-realce)]"
            }`}
          >
            <span className="block text-sm font-medium">{NOMBRE_GRAFICO[t]}</span>
            <span className="mt-0.5 block text-[11px] leading-snug text-[var(--color-tinta-suave)]">
              {PREGUNTA_GRAFICO[t]}
            </span>
          </button>
        ))}
      </div>

      {/* UNA fila de controles arriba de todo lo que afectan. */}
      <div className="tarjeta flex flex-wrap items-end gap-3 p-3">
        {dosEjes && (
          <SelectorEje
            id="eje-x"
            etiqueta="Eje horizontal"
            valor={ejeX}
            alCambiar={setEjeX}
            log={logX}
            alternarLog={() => setLogX((v) => !v)}
          />
        )}

        <SelectorEje
          id="eje-y"
          etiqueta={dosEjes ? "Eje vertical" : "Métrica"}
          valor={ejeY}
          alCambiar={setEjeY}
          log={logY}
          // El ranking dibuja barras: una longitud en escala logarítmica no se
          // puede comparar mirándola, así que ahí no se ofrece.
          alternarLog={grafico === "ranking" ? null : () => setLogY((v) => !v)}
        />

        <div className="space-y-1">
          <label className="etiqueta" htmlFor="agrupacion">
            {conColor ? "Color de las marcas" : "Agrupar por"}
          </label>
          <select
            id="agrupacion"
            value={agrupacion}
            onChange={(e) => {
              setAgrupacion(e.target.value as Agrupacion);
              // Los grupos son otros: lo apagado dejaría de tener sentido.
              setOcultos(new Set());
            }}
            className="campo"
          >
            {AGRUPACIONES.map((a) => (
              <option key={a} value={a}>
                {NOMBRE_AGRUPACION[a]}
              </option>
            ))}
          </select>
        </div>

        {dosEjes && (
          <button
            type="button"
            onClick={() => {
              setEjeX(ejeY);
              setEjeY(ejeX);
              setLogX(logY);
              setLogY(logX);
            }}
            className="boton-suave"
            title="Cambiar el eje horizontal por el vertical"
          >
            Dar vuelta los ejes
          </button>
        )}

        <button
          type="button"
          onClick={() => setVerTabla((v) => !v)}
          className="boton-suave"
          aria-pressed={verTabla}
        >
          {verTabla ? "Ocultar tabla" : "Ver como tabla"}
        </button>
      </div>

      <section className="tarjeta overflow-hidden">
        <div className="flex flex-wrap items-baseline justify-between gap-2 border-b border-[var(--color-filete)] px-4 py-3">
          <div>
            <h2 className="text-sm font-semibold tracking-tight">
              {grafico === "dispersion"
                ? `${NOMBRE_EJE[ejeY]} contra ${NOMBRE_EJE[ejeX].toLowerCase()}`
                : grafico === "caja"
                  ? `${NOMBRE_EJE[metrica]} por ${NOMBRE_AGRUPACION[agrupacion].toLowerCase()}`
                  : grafico === "distribucion"
                    ? `Cómo se reparten las publicaciones por ${NOMBRE_EJE[metrica].toLowerCase()}`
                    : `Las ${base.puntos.length > 0 ? Math.min(20, base.puntos.length) : 0} de más ${NOMBRE_EJE[metrica].toLowerCase()}`}
            </h2>
            <p className="mt-0.5 max-w-2xl text-xs text-[var(--color-tinta-suave)]">
              {grafico === "dispersion" &&
                "Una marca es una publicación, no un promedio. Las líneas grises marcan la mediana de cada eje: arriba a la derecha están las que superaron el medio en las dos cosas."}
              {grafico === "caja" &&
                `La caja es la mitad del medio de las publicaciones y la línea gruesa es la mediana. Los puntos sueltos son las que se despegaron del resto: por eso se compara la mediana y no el promedio, que esas mismas arrastran.`}
              {grafico === "distribucion" &&
                "Cuántas publicaciones caen en cada tramo. Si la mediana y el promedio están lejos, el promedio no describe a la publicación típica."}
              {grafico === "ranking" &&
                "De mayor a menor, con la mediana de todo el período como referencia."}
            </p>
          </div>
          <span className="text-xs text-[var(--color-tinta-tenue)]">
            {fechaCorta(rango.desde)} — {fechaCorta(rango.hasta)}
          </span>
        </div>

        {base.puntos.length === 0 ? (
          <p className="px-4 py-10 text-center text-sm text-[var(--color-tinta-suave)]">
            Ninguna de las {base.total}{" "}
            {base.total === 1 ? "publicación" : "publicaciones"} del período tiene
            los datos que pide esta vista.
            <br />
            <span className="text-xs text-[var(--color-tinta-tenue)]">
              Prueba con otra métrica, o vuelve a subir las exportaciones para
              completar las columnas que falten.
            </span>
          </p>
        ) : (
          <div className="px-2 pt-3">
            {datos.tipo === "dispersion" && <Dispersion datos={datos.d} />}
            {datos.tipo === "caja" && <Caja datos={datos.d} />}
            {datos.tipo === "distribucion" && <Histograma datos={datos.d} />}
            {datos.tipo === "ranking" && <RankingPosts datos={datos.d} />}
          </div>
        )}

        {/* La leyenda: nunca solo color, y sirve de filtro. */}
        {base.grupos.length > 0 && (
          <div className="flex flex-wrap items-center gap-x-4 gap-y-2 border-t border-[var(--color-filete)] px-4 py-2.5">
            {base.grupos.map((g) => {
              const apagado = ocultos.has(g.clave);
              return (
                <button
                  key={g.clave}
                  type="button"
                  onClick={() => alternar(g.clave)}
                  aria-pressed={!apagado}
                  className={`flex items-center gap-1.5 text-[13px] transition ${
                    apagado
                      ? "text-[var(--color-tinta-tenue)] line-through"
                      : "text-[var(--color-tinta)]"
                  }`}
                >
                  <span
                    aria-hidden
                    className={`inline-block size-2.5 rounded-full ${
                      // Donde el color no codifica el grupo, el cuadradito es
                      // solo un contorno: pintarlo diría algo que el gráfico no
                      // dice.
                      conColor ? "" : "border border-[var(--color-filete-fuerte)]"
                    }`}
                    style={{
                      backgroundColor: !conColor
                        ? "transparent"
                        : apagado
                          ? "var(--color-filete-fuerte)"
                          : (g.color ?? APAGADO),
                    }}
                  />
                  {g.etiqueta}
                  <span className="text-[11px] text-[var(--color-tinta-tenue)]">
                    {g.n}
                  </span>
                </button>
              );
            })}

            {sinColor > 0 && (
              <span className="text-[11px] text-[var(--color-tinta-tenue)]">
                Desde el {MAXIMO_COLORES + 1}.º grupo las marcas van en gris: más
                de {MAXIMO_COLORES} colores no se distinguen cuando se
                superponen. Apaga los demás para mirar uno solo.
              </span>
            )}
          </div>
        )}

        {/*
          §9.4 y §9.5 — lo que no se dibujó, con su motivo. Va pegado al gráfico
          y no en una nota al pie: es parte de leerlo, no una aclaración.
        */}
        {(fuera > 0 || base.recortados > 0) && (
          <div className="border-t border-[var(--color-filete)] bg-[var(--color-realce)]/60 px-4 py-2.5 text-[11px] leading-relaxed text-[var(--color-tinta-suave)]">
            <p>
              Se usaron <strong>{base.puntos.length}</strong> de {base.total}{" "}
              publicaciones del período. Quedaron fuera:
            </p>
            <ul className="mt-1 space-y-0.5">
              {sinX > 0 && (
                <li>
                  <strong>{sinX}</strong> sin dato de{" "}
                  {NOMBRE_EJE[ejePrimero].toLowerCase()}
                  {SOLO_EN[ejePrimero] ? ` — solo lo entrega ${SOLO_EN[ejePrimero]}` : ""}.
                  No se dibujan en cero: no medido no es cero.
                </li>
              )}
              {sinY > 0 && (
                <li>
                  <strong>{sinY}</strong> sin dato de {NOMBRE_EJE[ejeY].toLowerCase()}
                  {SOLO_EN[ejeY] ? ` — solo lo entrega ${SOLO_EN[ejeY]}` : ""}.
                </li>
              )}
              {noPositivas > 0 && (
                <li>
                  <strong>{noPositivas}</strong> con un cero en una escala
                  logarítmica, donde el cero no cabe. Apaga la escala
                  logarítmica para verlas.
                </li>
              )}
              {agrupadas > 0 && (
                <li>
                  <strong>{agrupadas}</strong> cargadas a mano representando
                  varias publicaciones en una fila: no hay forma de saber cuántos
                  de esos números fueron de cuál.
                </li>
              )}
              {base.recortados > 0 && (
                <li>
                  <strong>{base.recortados}</strong> por el tope de marcas del
                  gráfico. Acorta el período para verlas.
                </li>
              )}
            </ul>
          </div>
        )}
      </section>

      {/* §9.6 — el engagement no mide lo mismo en todas las redes. */}
      {base.mezclaDenominadores && (
        <Nota>
          El engagement de YouTube se calcula sobre visualizaciones y el del
          resto sobre alcance, porque YouTube no entrega alcance. Acá hay
          publicaciones de las dos clases, así que esa métrica no mide
          exactamente lo mismo en todas: conviene mirar una red por vez,
          agrupando por red y apagando las demás.
        </Nota>
      )}

      {/*
        El cruce reel/reactivo. La precedencia está elegida en el código y esto
        la pone a la vista: sin el número, un reel reactivo contado como
        reactivo parece un reel que desapareció del gráfico.
      */}
      {base.cruceReelReactivo > 0 && (
        <Nota>
          <strong>{base.cruceReelReactivo}</strong>{" "}
          {base.cruceReelReactivo === 1
            ? "publicación es reel y reactiva a la vez"
            : "publicaciones son reel y reactivas a la vez"}
          . En los datos «reactivo» es una decisión editorial y «reel» es un
          formato, así que una publicación puede ser las dos: acá{" "}
          {base.cruceReelReactivo === 1 ? "cuenta" : "cuentan"} como{" "}
          <strong>reactivo</strong>, porque eso es lo que la distingue del resto.
          Para verlas como formato, cambia el agrupamiento a «Formato».
        </Nota>
      )}

      {grafico === "caja" && datos.tipo === "caja" && datos.d.cajas.some((c) => c.pocas) && (
        <Nota>
          {datos.d.cajas
            .filter((c) => c.pocas)
            .map((c) => c.etiqueta)
            .join(", ")}{" "}
          {datos.d.cajas.filter((c) => c.pocas).length === 1 ? "tiene" : "tienen"}{" "}
          menos de {MINIMO_CAJA} publicaciones con este dato, así que no se
          {datos.d.cajas.filter((c) => c.pocas).length === 1 ? " dibuja" : " dibujan"}{" "}
          como caja: con tan pocas, los cuartiles no describen nada porque cada
          publicación mueve la caja entera. Se muestran los valores tal cual.
        </Nota>
      )}

      {verTabla && tabla.length > 0 && (
        <section className="tarjeta overflow-hidden">
          <div className="border-b border-[var(--color-filete)] px-4 py-3">
            <h2 className="text-sm font-semibold tracking-tight">
              Las {tabla.length} de más {NOMBRE_EJE[ejeY].toLowerCase()}
            </h2>
            <p className="mt-0.5 text-xs text-[var(--color-tinta-suave)]">
              Las mismas publicaciones del gráfico, con nombre y enlace.
            </p>
          </div>

          <div className="scroll-x">
            <table className="w-full border-collapse text-left">
              <thead className="border-b border-[var(--color-filete)] bg-[var(--color-realce)]/60">
                <tr>
                  <th className="th">Publicación</th>
                  <th className="th">Cuenta</th>
                  <th className="th">Fecha</th>
                  <th className="th">Grupo</th>
                  <th className="th text-right">{NOMBRE_EJE[ejeY]}</th>
                  {dosEjes && <th className="th text-right">{NOMBRE_EJE[ejeX]}</th>}
                </tr>
              </thead>
              <tbody>
                {tabla.map((d) => (
                  <tr
                    key={d.punto.id}
                    className="border-b border-[var(--color-filete)] last:border-0"
                  >
                    {/* El título es lo único que puede ser largo: se deja
                        envolver en vez de estirar la tabla a lo ancho. */}
                    <td className="max-w-sm px-3 py-2 text-sm">
                      {d.punto.enlace ? (
                        <a
                          href={d.punto.enlace}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="underline underline-offset-2"
                        >
                          {d.punto.titulo ?? "Sin título"}
                        </a>
                      ) : (
                        (d.punto.titulo ?? "Sin título")
                      )}
                      {d.punto.hashtag && (
                        <span className="ml-1.5 text-[11px] text-[var(--color-tinta-tenue)]">
                          {d.punto.hashtag}
                        </span>
                      )}
                    </td>
                    <td className="td">{d.punto.cuenta}</td>
                    <td className="td">{fechaCorta(d.punto.fecha)}</td>
                    <td className="td">
                      <span className="flex items-center gap-1.5">
                        {conColor && (
                          <span
                            aria-hidden
                            className="inline-block size-2 shrink-0 rounded-full"
                            style={{ backgroundColor: d.color ?? APAGADO }}
                          />
                        )}
                        {etiquetaDeGrupo(d.grupo)}
                      </span>
                    </td>
                    <td className="td cifra text-right font-medium">
                      {escribirEnEje(d.y, ejeY)}
                    </td>
                    {dosEjes && (
                      <td className="td cifra text-right">{escribirEnEje(d.x, ejeX)}</td>
                    )}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          {base.puntos.length > tabla.length && (
            <p className="border-t border-[var(--color-filete)] px-4 py-2 text-[11px] text-[var(--color-tinta-tenue)]">
              Hay {numero(base.puntos.length - tabla.length)} publicaciones más
              en el gráfico que no caben en esta tabla.
            </p>
          )}
        </section>
      )}
    </div>
  );
}

/** Un selector de métrica con su interruptor de escala logarítmica al lado. */
function SelectorEje({
  id,
  etiqueta,
  valor,
  alCambiar,
  log,
  alternarLog,
}: {
  id: string;
  etiqueta: string;
  valor: Eje;
  alCambiar: (e: Eje) => void;
  log: boolean;
  /** null = este gráfico no admite escala logarítmica. */
  alternarLog: (() => void) | null;
}) {
  return (
    <div className="space-y-1">
      <label className="etiqueta" htmlFor={id}>
        {etiqueta}
      </label>
      <div className="flex items-center gap-1.5">
        <select
          id={id}
          value={valor}
          onChange={(e) => alCambiar(e.target.value as Eje)}
          className="campo"
        >
          {EJES.map((e) => (
            <option key={e} value={e}>
              {NOMBRE_EJE[e]}
            </option>
          ))}
        </select>
        {/*
          La escala logarítmica no es un adorno: con una publicación viral, la
          lineal aplasta a las otras trescientas contra la esquina. Va como
          interruptor al lado de su métrica y no en un menú aparte, para que se
          vea a cuál corresponde.
        */}
        {alternarLog && (
          <button
            type="button"
            onClick={alternarLog}
            aria-pressed={log}
            title="Escala logarítmica: reparte mejor cuando hay una publicación mucho más grande que el resto. El cero no cabe."
            className={`rounded border px-1.5 py-1 text-[11px] font-medium transition ${
              log
                ? "border-[var(--color-tinta)] bg-[var(--color-tinta)] text-white"
                : "border-[var(--color-filete-fuerte)] text-[var(--color-tinta-suave)]"
            }`}
          >
            log
          </button>
        )}
      </div>
    </div>
  );
}
