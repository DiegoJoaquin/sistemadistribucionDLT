"use client";

import { useMemo, useState } from "react";
import { Caja } from "@/componentes/graficos/Caja";
import { Dispersion } from "@/componentes/graficos/Dispersion";
import { Histograma } from "@/componentes/graficos/Histograma";
import { RankingPosts } from "@/componentes/graficos/RankingPosts";
import { TablaTelarana, Telarana } from "@/componentes/graficos/Telarana";
import { Nota } from "@/componentes/ui";
import {
  AGRUPACIONES,
  type Agrupacion,
  construirCajas,
  construirDispersion,
  construirDistribucion,
  construirRanking,
  construirTelarana,
  type Eje,
  EJES,
  EJES_TELARANA,
  EJES_TELARANA_POR_DEFECTO,
  escribirEnEje,
  etiquetaDeGrupo,
  EXPLICACION_NIVEL,
  MAXIMO_COLORES,
  MAXIMO_POLIGONOS,
  MINIMO_CAJA,
  MINIMO_RADIOS,
  type Nivel,
  NIVELES,
  NOMBRE_AGRUPACION,
  NOMBRE_EJE,
  NOMBRE_GRAFICO,
  NOMBRE_NIVEL,
  PREGUNTA_GRAFICO,
  type PublicacionPunto,
  SOLO_EN,
  type TipoGrafico,
  TIPOS_GRAFICO,
  usaColorPorGrupo,
  valorEnEje,
} from "@/lib/dominio/rendimiento";
import { fechaCorta, numero } from "@/lib/dominio/formato";
import { APAGADO } from "@/lib/dominio/paleta";

/**
 * Cuántas publicaciones se ofrecen en los selectores de la telaraña.
 *
 * Un `<select>` con tres mil opciones no se puede recorrer. Van las mejores
 * según la métrica elegida, que son las que alguien quiere comparar; para
 * llegar a otra se acorta el período o se cambia la métrica.
 */
const MAXIMO_ELEGIBLES = 300;

/**
 * La herramienta de rendimiento por publicación.
 *
 * Cinco gráficos sobre los mismos datos y una sola fila de controles arriba de
 * todo: la métrica, el color y el período son los mismos se mire lo que se
 * mire, así que cambiar de gráfico no debería obligar a volver a elegir nada.
 * Lo que cambia es qué controles tienen sentido —el segundo eje solo existe en
 * la dispersión, y los selectores de publicación solo en la telaraña— y esos
 * aparecen y desaparecen.
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

  // Solo de la telaraña.
  const [nivel, setNivel] = useState<Nivel>("serie");
  const [radios, setRadios] = useState<Eje[]>([...EJES_TELARANA_POR_DEFECTO]);
  const [elegidasIds, setElegidasIds] = useState<(string | null)[]>([null, null, null]);

  const esTelarana = grafico === "telarana";
  const dosEjes = grafico === "dispersion";
  const conColor = usaColorPorGrupo(grafico);

  /*
   * La métrica de los gráficos de una sola variable es la del eje VERTICAL de
   * la dispersión, no la del horizontal. Es la que se lee como "el resultado":
   * en «me gusta contra visualizaciones», lo que se quiere medir son los me
   * gusta. Así, cambiar de gráfico no cambia de tema.
   */
  const datos = useMemo(() => {
    // `agrupacion` y `ocultos` van repetidos en cada llamada, y no juntos en un
    // objeto, para que las dependencias de este useMemo sean exactamente los
    // valores de los que depende el cálculo y no un objeto nuevo por render.
    switch (grafico) {
      case "telarana":
        // La telaraña no trabaja sobre el conjunto sino sobre publicaciones
        // elegidas a mano: se arma aparte.
        return null;
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

  /** Lo que se puede elegir en la telaraña, de mejor a peor en la métrica. */
  const elegibles = useMemo(
    () =>
      puntos
        // §9.5 — una fila que representa varias publicaciones no es una.
        .filter((p) => p.publicaciones === 1)
        .map((p) => ({ p, v: valorEnEje(p, ejeY) }))
        .filter((x): x is { p: PublicacionPunto; v: number } => x.v !== null)
        .sort((a, b) => b.v - a.v)
        .slice(0, MAXIMO_ELEGIBLES)
        .map((x) => x.p),
    [puntos, ejeY],
  );

  /*
   * Al abrir la telaraña por primera vez viene elegida la mejor publicación de
   * la métrica actual. Abrirla vacía obligaría a un paso más antes de ver nada,
   * y "la que mejor le fue" es lo que casi siempre se quiere mirar primero.
   */
  const elegidas = useMemo(() => {
    const porId = new Map(puntos.map((p) => [p.id, p]));
    const elegidas = elegidasIds.flatMap((id) => {
      const p = id === null ? undefined : porId.get(id);
      return p ? [p] : [];
    });
    return elegidas.length > 0 ? elegidas : elegibles.slice(0, 1);
  }, [puntos, elegidasIds, elegibles]);

  const telarana = useMemo(
    () => construirTelarana(puntos, { elegidas, nivel, ejes: radios }),
    [puntos, elegidas, nivel, radios],
  );

  const base = datos?.d ?? null;

  /** Las publicaciones dibujadas, ordenadas para la tabla. */
  const tabla = useMemo(
    () => (base ? [...base.puntos].sort((a, b) => b.y - a.y).slice(0, 30) : []),
    [base],
  );

  const alternar = (clave: string) =>
    setOcultos((previos) => {
      const nuevos = new Set(previos);
      if (nuevos.has(clave)) nuevos.delete(clave);
      else nuevos.add(clave);
      return nuevos;
    });

  const alternarRadio = (eje: Eje) =>
    setRadios((previos) =>
      previos.includes(eje)
        ? previos.filter((e) => e !== eje)
        : // Se conserva el orden de EJES_TELARANA para que sacar y volver a
          // poner un radio no reordene toda la figura.
          EJES_TELARANA.filter((e) => previos.includes(e) || e === eje),
    );

  const elegir = (i: number, id: string) =>
    setElegidasIds((previas) => {
      const nuevas = [...previas];
      nuevas[i] = id === "" ? null : id;
      return nuevas;
    });

  const sinColor =
    conColor && base ? base.grupos.filter((g) => g.color === null).length : 0;

  /** El nombre de la métrica que le falta a lo excluido por `sinX`. */
  const ejePrimero = dosEjes ? ejeX : ejeY;

  return (
    <div className="space-y-5">
      {/*
        Los cinco gráficos, con la pregunta que contesta cada uno. Van como
        botones y no como un menú desplegable porque elegir entre ellos es la
        decisión principal de la pantalla.
      */}
      <div className="grid grid-cols-2 gap-2 lg:grid-cols-5">
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
          etiqueta={dosEjes ? "Eje vertical" : esTelarana ? "Ordenar la lista por" : "Métrica"}
          valor={ejeY}
          alCambiar={setEjeY}
          log={logY}
          // El ranking dibuja barras —una longitud en escala logarítmica no se
          // puede comparar mirándola— y la telaraña no usa esta métrica para
          // dibujar, solo para ordenar la lista de publicaciones.
          alternarLog={
            grafico === "ranking" || esTelarana ? null : () => setLogY((v) => !v)
          }
        />

        {esTelarana ? (
          <div className="space-y-1">
            <label className="etiqueta" htmlFor="nivel">
              Comparar contra
            </label>
            <select
              id="nivel"
              value={nivel}
              onChange={(e) => setNivel(e.target.value as Nivel)}
              className="campo"
            >
              {NIVELES.map((n) => (
                <option key={n} value={n}>
                  {NOMBRE_NIVEL[n]}
                </option>
              ))}
            </select>
          </div>
        ) : (
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
        )}

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

        {!esTelarana && (
          <button
            type="button"
            onClick={() => setVerTabla((v) => !v)}
            className="boton-suave"
            aria-pressed={verTabla}
          >
            {verTabla ? "Ocultar tabla" : "Ver como tabla"}
          </button>
        )}
      </div>

      {/* Los selectores de publicación y de radios: solo la telaraña los usa. */}
      {esTelarana && (
        <div className="tarjeta space-y-3 p-3">
          <div className="flex flex-wrap items-end gap-3">
            {Array.from({ length: MAXIMO_POLIGONOS }, (_, i) => (
              <div key={i} className="min-w-0 flex-1 space-y-1" style={{ minWidth: "16rem" }}>
                <label className="etiqueta" htmlFor={`pub-${i}`}>
                  {i === 0 ? "Publicación" : `Comparar con (${i + 1}.ª)`}
                </label>
                <select
                  id={`pub-${i}`}
                  value={elegidasIds[i] ?? (i === 0 ? (elegidas[0]?.id ?? "") : "")}
                  onChange={(e) => elegir(i, e.target.value)}
                  className="campo w-full"
                >
                  <option value="">{i === 0 ? "— Elige una —" : "— Ninguna —"}</option>
                  {elegibles.map((p) => (
                    <option key={p.id} value={p.id}>
                      {(p.titulo ?? "Sin título").slice(0, 70)} · {p.cuenta} ·{" "}
                      {fechaCorta(p.fecha)} · {escribirEnEje(valorEnEje(p, ejeY), ejeY)}
                    </option>
                  ))}
                </select>
              </div>
            ))}
          </div>

          <div>
            <p className="etiqueta mb-1">Radios de la telaraña</p>
            <div className="flex flex-wrap gap-1.5">
              {EJES_TELARANA.map((e) => {
                const puesto = radios.includes(e);
                return (
                  <button
                    key={e}
                    type="button"
                    onClick={() => alternarRadio(e)}
                    aria-pressed={puesto}
                    className={`rounded border px-2 py-1 text-[11px] font-medium transition ${
                      puesto
                        ? "border-[var(--color-tinta)] bg-[var(--color-tinta)] text-white"
                        : "border-[var(--color-filete-fuerte)] text-[var(--color-tinta-suave)]"
                    }`}
                  >
                    {NOMBRE_EJE[e]}
                  </button>
                );
              })}
            </div>
            <p className="mt-1.5 text-[11px] leading-relaxed text-[var(--color-tinta-tenue)]">
              {EXPLICACION_NIVEL[nivel]} Cada radio muestra cuánto se despegó la
              publicación de esa línea: el anillo marcado es el 100%, o sea
              «le fue igual al promedio».
            </p>
          </div>
        </div>
      )}

      <section className="tarjeta overflow-hidden">
        <div className="flex flex-wrap items-baseline justify-between gap-2 border-b border-[var(--color-filete)] px-4 py-3">
          <div>
            <h2 className="text-sm font-semibold tracking-tight">
              {esTelarana
                ? `Contra ${NOMBRE_NIVEL[nivel].toLowerCase()}`
                : grafico === "dispersion"
                  ? `${NOMBRE_EJE[ejeY]} contra ${NOMBRE_EJE[ejeX].toLowerCase()}`
                  : grafico === "caja"
                    ? `${NOMBRE_EJE[ejeY]} por ${NOMBRE_AGRUPACION[agrupacion].toLowerCase()}`
                    : grafico === "distribucion"
                      ? `Cómo se reparten las publicaciones por ${NOMBRE_EJE[ejeY].toLowerCase()}`
                      : `Las ${base ? Math.min(20, base.puntos.length) : 0} de más ${NOMBRE_EJE[ejeY].toLowerCase()}`}
            </h2>
            <p className="mt-0.5 max-w-2xl text-xs text-[var(--color-tinta-suave)]">
              {esTelarana &&
                "Cada radio es una métrica, y el valor es cuánto se despegó de su línea. No son los números crudos: si lo fueran, las visualizaciones taparían al engagement. Los números están en la tabla de abajo."}
              {grafico === "dispersion" &&
                "Una marca es una publicación, no un promedio. Las líneas grises marcan la mediana de cada eje: arriba a la derecha están las que superaron el medio en las dos cosas."}
              {grafico === "caja" &&
                "La caja es la mitad del medio de las publicaciones y la línea gruesa es la mediana. Los puntos sueltos son las que se despegaron del resto: por eso se compara la mediana y no el promedio, que esas mismas arrastran."}
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

        {esTelarana ? (
          telarana.poligonos.length === 0 ? (
            <p className="px-4 py-10 text-center text-sm text-[var(--color-tinta-suave)]">
              Elige una publicación para dibujar su telaraña.
              <br />
              <span className="text-xs text-[var(--color-tinta-tenue)]">
                La lista de arriba muestra las de más{" "}
                {NOMBRE_EJE[ejeY].toLowerCase()} del período.
              </span>
            </p>
          ) : telarana.ejes.length < MINIMO_RADIOS ? (
            <p className="px-4 py-10 text-center text-sm text-[var(--color-tinta-suave)]">
              Quedan {telarana.ejes.length}{" "}
              {telarana.ejes.length === 1 ? "radio" : "radios"} con datos, y con
              menos de {MINIMO_RADIOS} no hay figura que dibujar.
              <br />
              <span className="text-xs text-[var(--color-tinta-tenue)]">
                Prende más radios arriba, o elige publicaciones de la misma red:
                las métricas que una de ellas no entrega se caen para todas.
              </span>
            </p>
          ) : (
            <div className="px-2 pt-3">
              <Telarana datos={telarana} />
            </div>
          )
        ) : !base || base.puntos.length === 0 ? (
          <p className="px-4 py-10 text-center text-sm text-[var(--color-tinta-suave)]">
            Ninguna de las {base?.total ?? 0}{" "}
            {(base?.total ?? 0) === 1 ? "publicación" : "publicaciones"} del
            período tiene los datos que pide esta vista.
            <br />
            <span className="text-xs text-[var(--color-tinta-tenue)]">
              Prueba con otra métrica, o vuelve a subir las exportaciones para
              completar las columnas que falten.
            </span>
          </p>
        ) : (
          <div className="px-2 pt-3">
            {datos?.tipo === "dispersion" && <Dispersion datos={datos.d} />}
            {datos?.tipo === "caja" && <Caja datos={datos.d} />}
            {datos?.tipo === "distribucion" && <Histograma datos={datos.d} />}
            {datos?.tipo === "ranking" && <RankingPosts datos={datos.d} />}
          </div>
        )}

        {/* La leyenda: nunca solo color, y sirve de filtro. */}
        {!esTelarana && base && base.grupos.length > 0 && (
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
        {!esTelarana && base && (() => {
          const { agrupadas, sinX, sinY, noPositivas } = base.excluidas;
          if (agrupadas + sinX + sinY + noPositivas + base.recortados === 0) return null;

          return (
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
                    varias publicaciones en una fila: no hay forma de saber
                    cuántos de esos números fueron de cuál.
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
          );
        })()}

        {/* Los radios que se cayeron, con el motivo. Misma regla que arriba. */}
        {esTelarana && telarana.descartados.length > 0 && (
          <div className="border-t border-[var(--color-filete)] bg-[var(--color-realce)]/60 px-4 py-2.5 text-[11px] leading-relaxed text-[var(--color-tinta-suave)]">
            <p>No se pudieron dibujar estos radios:</p>
            <ul className="mt-1 space-y-0.5">
              {telarana.descartados.map((d) => (
                <li key={d.eje}>
                  <strong>{NOMBRE_EJE[d.eje]}</strong> — {d.motivo}.
                </li>
              ))}
            </ul>
            <p className="mt-1">
              Un radio sin dato no se dibuja en cero ni en 100%: lo primero diría
              que rindió cero y lo segundo que le fue como al promedio, y las dos
              cosas serían inventadas.
            </p>
          </div>
        )}
      </section>

      {/*
        La línea calculada sobre una sola publicación es la publicación misma:
        da 100% en todo por definición y no dice nada. Hay que avisarlo, porque
        una telaraña perfectamente pegada al anillo parece un resultado.
      */}
      {esTelarana && telarana.lineasDeUna.length > 0 && (
        <Nota>
          {telarana.lineasDeUna.length === 1
            ? "Esa publicación es la única"
            : "Esas publicaciones son las únicas"}{" "}
          de su {nivel === "serie" ? "serie" : nivel === "cuenta" ? "cuenta" : "período"} en
          este rango de fechas, así que la línea de comparación está hecha con
          ella misma y da 100% en todos los radios por definición. Amplía el
          período, o compara contra{" "}
          {nivel === "serie" ? "su cuenta o todo el período" : "todo el período"}.
        </Nota>
      )}

      {esTelarana && telarana.sinSerie.length > 0 && (
        <Nota>
          {telarana.sinSerie.length === 1
            ? "Una de las publicaciones elegidas no tiene hashtag"
            : `${telarana.sinSerie.length} de las publicaciones elegidas no tienen hashtag`}
          , así que no pertenecen a ninguna serie contra la cual compararse.
          Elige «{NOMBRE_NIVEL.cuenta}» o «{NOMBRE_NIVEL.global}», o carga el
          hashtag desde el registro.
        </Nota>
      )}

      {/* §9.6 — el engagement no mide lo mismo en todas las redes. */}
      {!esTelarana && base?.mezclaDenominadores && (
        <Nota>
          El engagement de YouTube se calcula sobre visualizaciones y el del
          resto sobre alcance, porque YouTube no entrega alcance. Acá hay
          publicaciones de las dos clases, así que esa métrica no mide
          exactamente lo mismo en todas: conviene mirar una red por vez.
        </Nota>
      )}

      {/*
        En la telaraña el problema no se esquiva mirando una red por vez: la
        serie ES de varias redes. Se resuelve acotando esa línea, y hay que
        decirlo, porque el radio se lee como «contra su serie» a secas.
      */}
      {esTelarana && telarana.engagementAcotado && (
        <Nota>
          El radio de <strong>engagement</strong> se compara solo contra las
          publicaciones de la misma red. YouTube lo calcula sobre
          visualizaciones y el resto sobre alcance, así que promediarlo entre
          redes daría un número que no significa nada. Los demás radios sí van
          contra {NOMBRE_NIVEL[nivel].toLowerCase()} completo.
        </Nota>
      )}

      {/*
        El cruce reel/reactivo. La precedencia está elegida en el código y esto
        la pone a la vista: sin el número, un reel reactivo contado como
        reactivo parece un reel que desapareció del gráfico.
      */}
      {!esTelarana && base && base.cruceReelReactivo > 0 && (
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

      {datos?.tipo === "caja" && datos.d.cajas.some((c) => c.pocas) && (
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

      {/* Los números crudos de la telaraña: un porcentaje sin su base no se audita. */}
      {esTelarana && telarana.ejes.length > 0 && telarana.poligonos.length > 0 && (
        <section className="tarjeta overflow-hidden">
          <div className="border-b border-[var(--color-filete)] px-4 py-3">
            <h2 className="text-sm font-semibold tracking-tight">Los números</h2>
            <p className="mt-0.5 text-xs text-[var(--color-tinta-suave)]">
              Lo que tuvo cada publicación, el promedio de su línea, y la
              comparación entre los dos.
            </p>
          </div>
          <TablaTelarana datos={telarana} />
        </section>
      )}

      {!esTelarana && verTabla && tabla.length > 0 && base && (
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
                        {etiquetaDeGrupo(d.grupo, agrupacion)}
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
