"use client";

import { useMemo, useState } from "react";
import { Barras } from "@/componentes/graficos/Barras";
import { Lineas } from "@/componentes/graficos/Lineas";
import { Delta } from "@/componentes/Delta";
import { Insignia } from "@/componentes/ui";
import {
  comparativaCuentas,
  comparativaFormato,
  esPorcentaje,
  evolucionSemanal,
  type FilaAnalitica,
  METRICAS_GRAFICO,
  type MetricaGrafico,
  NOMBRE_METRICA,
  titulares,
} from "@/lib/dominio/analitica";
import type { Categoria } from "@/lib/dominio/categorias";
import { fechaCorta, numero, numeroFino, porcentaje } from "@/lib/dominio/formato";
import { colorDe, coloresPorCuenta, MAXIMO_SERIES } from "@/lib/dominio/paleta";
import { ordenarCuentas } from "@/lib/dominio/redes";
import type { CuentaRow } from "@/lib/supabase/tipos-db";

function valorTexto(v: number | null, pct: boolean): string {
  if (v === null) return "—";
  return pct ? porcentaje(v) : v < 100 ? numeroFino(v) : numero(v);
}

function etiquetaSemana(desde: string): string {
  const [, m, d] = desde.split("-").map(Number);
  const meses = ["ene", "feb", "mar", "abr", "may", "jun", "jul", "ago", "sep", "oct", "nov", "dic"];
  return `${d} ${meses[m - 1]}`;
}

export function PanelAnalitica({
  filas,
  cuentas,
  formatos,
  rango,
  filasAntes,
}: {
  filas: FilaAnalitica[];
  cuentas: CuentaRow[];
  formatos: Categoria[];
  rango: { desde: string; hasta: string };
  /** El período anterior de la misma duración, para las variaciones. */
  filasAntes: FilaAnalitica[];
}) {
  const [metrica, setMetrica] = useState<MetricaGrafico>("alcance");
  const [ocultas, setOcultas] = useState<Set<string>>(new Set());
  const [verTabla, setVerTabla] = useState(false);

  /*
   * Solo las cuentas que publicaron. Y el color sale de ESTE orden, que no
   * depende de lo que el usuario apague en la leyenda: si el color siguiera al
   * orden actual, apagar una serie repintaría a las demás y quien aprendió que
   * "Instagram DLT es azul" vería otra cosa.
   */
  const conActividad = useMemo(
    () => ordenarCuentas(cuentas.filter((c) => filas.some((f) => f.cuentaId === c.id))),
    [cuentas, filas],
  );

  const colores = useMemo(() => coloresPorCuenta(conActividad), [conActividad]);
  const pct = esPorcentaje(metrica);

  const evolucion = useMemo(
    () => evolucionSemanal(filas, conActividad.slice(0, MAXIMO_SERIES), metrica, rango),
    [filas, conActividad, metrica, rango],
  );

  const porCuenta = useMemo(
    () => comparativaCuentas(filas, conActividad, metrica),
    [filas, conActividad, metrica],
  );

  const porFormato = useMemo(
    () => comparativaFormato(filas, metrica, formatos),
    [filas, metrica, formatos],
  );

  const cabeza = useMemo(() => titulares(filas, filasAntes), [filas, filasAntes]);

  const alternar = (id: string) =>
    setOcultas((previas) => {
      const nuevas = new Set(previas);
      if (nuevas.has(id)) nuevas.delete(id);
      else nuevas.add(id);
      return nuevas;
    });

  const sinColor = conActividad.length - MAXIMO_SERIES;

  return (
    <div className="space-y-5">
      {/* §interacción — UNA fila de filtros arriba de todo lo que afecta. */}
      <div className="tarjeta flex flex-wrap items-end gap-3 p-3">
        <div className="space-y-1">
          <label className="etiqueta" htmlFor="metrica">
            Métrica
          </label>
          <select
            id="metrica"
            value={metrica}
            onChange={(e) => setMetrica(e.target.value as MetricaGrafico)}
            className="campo"
          >
            {METRICAS_GRAFICO.map((m) => (
              <option key={m} value={m}>
                {NOMBRE_METRICA[m]}
              </option>
            ))}
          </select>
        </div>

        <p className="flex-1 text-[11px] leading-relaxed text-[var(--color-tinta-tenue)]">
          Todos los valores son promedios por publicación, no sumas. Las
          variaciones de arriba comparan contra el <strong>período anterior</strong> de
          la misma duración, no contra la línea base mensual.
        </p>

        <button
          type="button"
          onClick={() => setVerTabla((v) => !v)}
          className="boton-suave"
          aria-pressed={verTabla}
        >
          {verTabla ? "Ocultar tabla" : "Ver como tabla"}
        </button>
      </div>

      {/* Titulares: son números sueltos, no un gráfico de barras de una barra. */}
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-6">
        <div className="tarjeta p-3">
          <p className="etiqueta">Publicaciones</p>
          <p className="mt-0.5 text-xl font-semibold">{cabeza.publicaciones}</p>
          <p className="mt-0.5 text-[11px] text-[var(--color-tinta-tenue)]">
            {cabeza.cuentas} {cabeza.cuentas === 1 ? "cuenta" : "cuentas"}
          </p>
        </div>

        {cabeza.metricas.map((t) => (
          <div key={t.metrica} className="tarjeta p-3">
            <p className="etiqueta">{NOMBRE_METRICA[t.metrica]}</p>
            <p className="mt-0.5 text-xl font-semibold">
              {valorTexto(t.valor, esPorcentaje(t.metrica))}
            </p>
            <div className="mt-1">
              {t.valor === null ? (
                <span className="text-[11px] text-[var(--color-tinta-tenue)]">
                  {t.metrica === "engagement"
                    ? "no se suma entre redes"
                    : "sin datos"}
                </span>
              ) : (
                <Delta
                  valor={t.variacion}
                  titulo="Contra el período anterior de la misma duración"
                />
              )}
            </div>
          </div>
        ))}
      </div>

      {/* Evolución semanal */}
      <section className="tarjeta overflow-hidden">
        <div className="flex flex-wrap items-baseline justify-between gap-2 border-b border-[var(--color-filete)] px-4 py-3">
          <div>
            <h2 className="text-sm font-semibold tracking-tight">
              {NOMBRE_METRICA[metrica]} semana a semana
            </h2>
            <p className="mt-0.5 text-xs text-[var(--color-tinta-suave)]">
              Promedio por publicación de cada semana. Una semana sin publicar
              deja un hueco, no un cero.
            </p>
          </div>
          <span className="text-xs text-[var(--color-tinta-tenue)]">
            {fechaCorta(rango.desde)} — {fechaCorta(rango.hasta)}
          </span>
        </div>

        <div className="px-2 pt-3">
          <Lineas datos={evolucion} colores={colores} ocultas={ocultas} />
        </div>

        {/* Leyenda: identidad nunca solo por color, y sirve para filtrar. */}
        <div className="flex flex-wrap items-center gap-x-4 gap-y-2 border-t border-[var(--color-filete)] px-4 py-2.5">
          {evolucion.series.map((s) => {
            const apagada = ocultas.has(s.cuentaId);
            /*
             * Una cuenta que publicó pero no entrega esta métrica —YouTube y
             * el alcance, §9.6— no tiene línea que encender. Ofrecerla en la
             * leyenda hace que apretarla no haga nada visible.
             */
            const sinDato = !s.puntos.some((v) => v !== null);

            if (sinDato) {
              return (
                <span
                  key={s.cuentaId}
                  className="flex items-center gap-1.5 text-[13px] text-[var(--color-tinta-tenue)]"
                  title={`${s.nombre} no entrega ${NOMBRE_METRICA[metrica].toLowerCase()}`}
                >
                  <span
                    aria-hidden
                    className="inline-block size-2.5 rounded-full border border-[var(--color-filete-fuerte)]"
                  />
                  {s.nombre}
                  <span className="text-[11px]">no entrega esta métrica</span>
                </span>
              );
            }

            return (
              <button
                key={s.cuentaId}
                type="button"
                onClick={() => alternar(s.cuentaId)}
                aria-pressed={!apagada}
                className={`flex items-center gap-1.5 text-[13px] transition ${
                  apagada
                    ? "text-[var(--color-tinta-tenue)] line-through"
                    : "text-[var(--color-tinta)]"
                }`}
              >
                <span
                  aria-hidden
                  className="inline-block size-2.5 rounded-full"
                  style={{
                    backgroundColor: apagada
                      ? "var(--color-filete-fuerte)"
                      : colorDe(colores, s.cuentaId),
                  }}
                />
                {s.nombre}
                <span className="text-[11px] text-[var(--color-tinta-tenue)]">
                  {s.total}
                </span>
              </button>
            );
          })}
          {sinColor > 0 && (
            <Insignia tono="aviso">
              {sinColor} {sinColor === 1 ? "cuenta más" : "cuentas más"} sin
              graficar
            </Insignia>
          )}
        </div>
      </section>

      <div className="grid grid-cols-1 gap-5 lg:grid-cols-2">
        <section className="tarjeta overflow-hidden">
          <div className="border-b border-[var(--color-filete)] px-4 py-3">
            <h2 className="text-sm font-semibold tracking-tight">
              {NOMBRE_METRICA[metrica]} por cuenta
            </h2>
            <p className="mt-0.5 text-xs text-[var(--color-tinta-suave)]">
              Todo el período junto, de mayor a menor.
            </p>
          </div>
          <div className="p-4">
            <Barras
              porcentual={pct}
              barras={porCuenta.map((b) => ({
                clave: b.cuentaId,
                etiqueta: b.nombre,
                valor: b.valor,
                detalle: `${b.publicaciones} pub.${
                  b.denominador < b.publicaciones
                    ? ` · sobre ${b.denominador}`
                    : ""
                }`,
                aviso: b.noComparable
                  ? "YouTube calcula el engagement sobre visualizaciones: no es comparable con el resto."
                  : undefined,
              }))}
            />
          </div>
        </section>

        <section className="tarjeta overflow-hidden">
          <div className="border-b border-[var(--color-filete)] px-4 py-3">
            <h2 className="text-sm font-semibold tracking-tight">
              {NOMBRE_METRICA[metrica]} por formato
            </h2>
            <p className="mt-0.5 text-xs text-[var(--color-tinta-suave)]">
              Qué formato rinde mejor. Reactivo y Normal no entran acá: una
              publicación tiene formato y tipo a la vez, y sumarlos la contaría
              dos veces (§3.2).
            </p>
          </div>
          <div className="p-4">
            <Barras
              porcentual={pct}
              barras={porFormato.map((b) => ({
                clave: b.formato,
                etiqueta: b.formato,
                valor: b.valor,
                detalle: `${b.publicaciones} pub.`,
              }))}
            />
          </div>
        </section>
      </div>

      {/* La vista de tabla: ningún valor queda encerrado en un tooltip. */}
      {verTabla && (
        <section className="tarjeta overflow-hidden">
          <div className="border-b border-[var(--color-filete)] px-4 py-3">
            <h2 className="text-sm font-semibold tracking-tight">
              {NOMBRE_METRICA[metrica]} semana a semana, en números
            </h2>
          </div>
          <div className="scroll-x">
            <table className="w-full border-collapse text-left">
              <thead className="border-b border-[var(--color-filete)] bg-[var(--color-realce)]/60">
                <tr>
                  <th className="th">Cuenta</th>
                  {evolucion.semanas.map((s) => (
                    <th key={s.desde} className="th text-right">
                      {etiquetaSemana(s.desde)}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {evolucion.series.map((s) => (
                  <tr
                    key={s.cuentaId}
                    className="border-b border-[var(--color-filete)] last:border-0"
                  >
                    <td className="td font-medium">{s.nombre}</td>
                    {s.puntos.map((v, i) => (
                      <td key={i} className="td text-right">
                        {v === null ? (
                          <span className="text-[var(--color-tinta-tenue)]">—</span>
                        ) : (
                          <span className="cifra">{valorTexto(v, pct)}</span>
                        )}
                      </td>
                    ))}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>
      )}
    </div>
  );
}
