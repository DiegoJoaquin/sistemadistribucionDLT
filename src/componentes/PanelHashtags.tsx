"use client";

import { useRouter } from "next/navigation";
import { useMemo, useState } from "react";
import { Delta } from "@/componentes/Delta";
import { Lineas } from "@/componentes/graficos/Lineas";
import { esPorcentaje } from "@/lib/dominio/analitica";
import {
  type EvolucionHashtags,
  type Granularidad,
  METRICAS_HASHTAG,
  type MetricaHashtag,
  nombreMetricaHashtag,
  type ParametrosHashtags,
  type ResumenHashtag,
  urlHashtags,
} from "@/lib/dominio/hashtags";
import { fechaCorta, mesLargo, numero, numeroFino, porcentaje } from "@/lib/dominio/formato";
import { APAGADO } from "@/lib/dominio/paleta";

/** Una publicación de la lista, ya recortada a lo que se muestra. */
export interface FilaPublicacion {
  id: string;
  fecha: string;
  cuenta: string;
  /** Solo los hashtags elegidos que lleva. */
  hashtags: string[];
  titulo: string | null;
  enlace: string | null;
  alcance: number | null;
  visualizaciones: number | null;
  interacciones: number | null;
}

const MESES = ["ene", "feb", "mar", "abr", "may", "jun", "jul", "ago", "sep", "oct", "nov", "dic"];

function rotuloMes(desde: string): string {
  const [a, m] = desde.split("-").map(Number);
  return `${MESES[m - 1]} ${a}`;
}

function rotuloSemana(desde: string): string {
  const [, m, d] = desde.split("-").map(Number);
  return `${d} ${MESES[m - 1]}`;
}

function valorTexto(v: number | null, m: MetricaHashtag): string {
  if (v === null) return "—";
  if (m === "publicaciones") return numero(v);
  if (esPorcentaje(m)) return porcentaje(v);
  return v < 100 ? numeroFino(v) : numero(v);
}

function Punto({ color }: { color: string }) {
  return (
    <span aria-hidden className="inline-block size-2.5 shrink-0 rounded-full" style={{ backgroundColor: color }} />
  );
}

export function PanelHashtags({
  parametros,
  cuentas,
  evolucion,
  resumenes,
  publicaciones,
  colores,
}: {
  parametros: ParametrosHashtags;
  /** Las cuentas que publicaron en el período, para el filtro. */
  cuentas: { id: string; nombre: string }[];
  evolucion: EvolucionHashtags;
  resumenes: ResumenHashtag[];
  /** De la más reciente a la más antigua. */
  publicaciones: FilaPublicacion[];
  colores: Record<string, string>;
}) {
  const router = useRouter();
  const [ocultas, setOcultas] = useState<Set<string>>(new Set());
  const [verTabla, setVerTabla] = useState(false);
  const [cuantas, setCuantas] = useState(25);

  const mapaColores = useMemo(() => new Map(Object.entries(colores)), [colores]);
  const color = (h: string) => colores[h] ?? APAGADO;
  const { metrica, por } = parametros;
  const nombre = nombreMetricaHashtag(metrica);
  const porMes = por === "mes";
  const rotulo = porMes ? rotuloMes : rotuloSemana;

  const ir = (cambio: Partial<ParametrosHashtags>) =>
    router.push(urlHashtags({ ...parametros, ...cambio }), { scroll: false });

  const alternar = (h: string) =>
    setOcultas((previas) => {
      const nuevas = new Set(previas);
      if (nuevas.has(h)) nuevas.delete(h);
      else nuevas.add(h);
      return nuevas;
    });

  /*
   * El engagement de "todas las cuentas" junta redes con denominadores
   * distintos (§9.6), así que en la línea queda vacío. Decirlo evita leer el
   * gráfico en blanco como "no hay datos".
   */
  const engagementMezclado =
    metrica === "engagement" && evolucion.series.every((s) => s.puntos.every((v) => v === null));

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
            onChange={(e) => ir({ metrica: e.target.value as MetricaHashtag })}
            className="campo"
          >
            {METRICAS_HASHTAG.map((m) => (
              <option key={m} value={m}>
                {m === "publicaciones" ? "Publicaciones (cuántas veces se usó)" : nombreMetricaHashtag(m)}
              </option>
            ))}
          </select>
        </div>

        <div className="space-y-1">
          <span className="etiqueta block">Ver por</span>
          <div className="inline-flex overflow-hidden rounded-md border border-[var(--color-filete-fuerte)]" role="group">
            {(["semana", "mes"] as Granularidad[]).map((g) => (
              <button
                key={g}
                type="button"
                aria-pressed={por === g}
                onClick={() => ir({ por: g })}
                className={`px-3 py-1.5 text-sm transition ${
                  por === g
                    ? "bg-[var(--color-tinta)] text-white"
                    : "bg-white text-[var(--color-tinta-suave)] hover:text-[var(--color-tinta)]"
                }`}
              >
                {g === "semana" ? "Semana" : "Mes"}
              </button>
            ))}
          </div>
        </div>

        <div className="space-y-1">
          <label className="etiqueta" htmlFor="cuenta">
            Cuenta
          </label>
          <select
            id="cuenta"
            value={parametros.cuenta ?? ""}
            onChange={(e) => ir({ cuenta: e.target.value || null })}
            className="campo"
          >
            <option value="">Todas las cuentas</option>
            {cuentas.map((c) => (
              <option key={c.id} value={c.id}>
                {c.nombre}
              </option>
            ))}
          </select>
        </div>

        <p className="flex-1 text-[11px] leading-relaxed text-[var(--color-tinta-tenue)]">
          Una publicación cuenta para todos los hashtags que lleva, no solo el
          primero. Los valores son promedios por publicación, no sumas.
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

      {/* Una tarjeta por hashtag: los números sueltos no son un gráfico. */}
      <div className={`grid grid-cols-1 gap-3 ${resumenes.length > 1 ? "sm:grid-cols-2" : ""} ${resumenes.length > 2 ? "xl:grid-cols-4" : ""}`}>
        {resumenes.map((r) => (
          <div key={r.hashtag} className="tarjeta space-y-2 p-4">
            <p className="flex items-center gap-2 text-sm font-semibold">
              <Punto color={color(r.hashtag)} />#{r.hashtag}
            </p>
            {r.publicaciones === 0 ? (
              <p className="text-[13px] text-[var(--color-tinta-suave)]">
                No se usó en el período{parametros.cuenta ? " en esta cuenta" : ""}.
              </p>
            ) : (
              <>
                <div className="flex items-baseline gap-4">
                  <div>
                    <p className="etiqueta">Publicaciones</p>
                    <p className="text-xl font-semibold">{numero(r.publicaciones)}</p>
                  </div>
                  <div>
                    <p className="etiqueta">Cuentas</p>
                    <p className="text-xl font-semibold">{r.cuentas.length}</p>
                  </div>
                  {metrica !== "publicaciones" && (
                    <div>
                      <p className="etiqueta">{nombre} / pub.</p>
                      <p className="text-xl font-semibold">{valorTexto(r.valor, metrica)}</p>
                    </div>
                  )}
                </div>
                <p className="text-[11px] text-[var(--color-tinta-tenue)]">
                  Primera vez {fechaCorta(r.primera!)} · última {fechaCorta(r.ultima!)}
                </p>
                {metrica !== "publicaciones" && (
                  <div className="flex items-center gap-2 text-[12px] text-[var(--color-tinta-suave)]">
                    <Delta
                      valor={r.vsResto}
                      titulo="Contra el resto de las publicaciones de las mismas cuentas en el período"
                    />
                    <span>contra el resto de sus cuentas</span>
                  </div>
                )}
              </>
            )}
          </div>
        ))}
      </div>

      {/* Evolución */}
      <section className="tarjeta overflow-hidden">
        <div className="flex flex-wrap items-baseline justify-between gap-2 border-b border-[var(--color-filete)] px-4 py-3">
          <div>
            <h2 className="text-sm font-semibold tracking-tight">
              {nombre} {porMes ? "mes a mes" : "semana a semana"}
            </h2>
            <p className="mt-0.5 text-xs text-[var(--color-tinta-suave)]">
              {metrica === "publicaciones"
                ? `Cuántas publicaciones llevaron cada hashtag, por ${por}.`
                : `Promedio por publicación con el hashtag, por ${por}. Un${porMes ? "" : "a"} ${por} sin usarlo deja un hueco, no un cero.`}
            </p>
          </div>
          <span className="text-xs text-[var(--color-tinta-tenue)]">
            {fechaCorta(parametros.desde)} — {fechaCorta(parametros.hasta)}
          </span>
        </div>

        {engagementMezclado ? (
          <p className="px-4 py-8 text-center text-sm text-[var(--color-tinta-suave)]">
            El engagement no se compara entre redes: YouTube lo calcula sobre
            visualizaciones y el resto sobre alcance (§9.6). Elige una cuenta
            para verlo.
          </p>
        ) : (
          <div className="px-2 pt-3">
            <Lineas
              datos={evolucion}
              colores={mapaColores}
              ocultas={ocultas}
              rotuloPeriodo={rotulo}
              tituloPeriodo={(d) => (porMes ? mesLargo(d) : `Semana del ${rotuloSemana(d)}`)}
              queSon="por hashtag"
            />
          </div>
        )}

        {/* Leyenda: identidad nunca solo por color, y sirve para filtrar. */}
        <div className="flex flex-wrap items-center gap-x-4 gap-y-2 border-t border-[var(--color-filete)] px-4 py-2.5">
          {evolucion.series.map((s) => {
            const apagada = ocultas.has(s.cuentaId);
            return (
              <button
                key={s.cuentaId}
                type="button"
                onClick={() => alternar(s.cuentaId)}
                aria-pressed={!apagada}
                className={`flex items-center gap-1.5 text-[13px] transition ${
                  apagada ? "text-[var(--color-tinta-tenue)] line-through" : "text-[var(--color-tinta)]"
                }`}
              >
                <Punto color={apagada ? "var(--color-filete-fuerte)" : color(s.cuentaId)} />
                {s.nombre}
                <span className="text-[11px] text-[var(--color-tinta-tenue)]">{s.total} pub.</span>
              </button>
            );
          })}
        </div>
      </section>

      {/* La vista de tabla: ningún valor queda encerrado en un tooltip. */}
      {verTabla && (
        <section className="tarjeta overflow-hidden">
          <div className="border-b border-[var(--color-filete)] px-4 py-3">
            <h2 className="text-sm font-semibold tracking-tight">
              {nombre} {porMes ? "mes a mes" : "semana a semana"}, en números
            </h2>
            <p className="mt-0.5 text-xs text-[var(--color-tinta-suave)]">
              Entre paréntesis, cuántas publicaciones hubo en cada período.
            </p>
          </div>
          <div className="scroll-x">
            <table className="w-full border-collapse text-left">
              <thead className="border-b border-[var(--color-filete)] bg-[var(--color-realce)]/60">
                <tr>
                  <th className="th">Hashtag</th>
                  {evolucion.semanas.map((s) => (
                    <th key={s.desde} className="th text-right">
                      {rotulo(s.desde)}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {evolucion.series.map((s) => (
                  <tr key={s.cuentaId} className="border-b border-[var(--color-filete)] last:border-0">
                    <td className="td font-medium">{s.nombre}</td>
                    {s.puntos.map((v, i) => (
                      <td key={i} className="td text-right">
                        {v === null ? (
                          <span className="text-[var(--color-tinta-tenue)]">—</span>
                        ) : (
                          <span className="cifra">{valorTexto(v, metrica)}</span>
                        )}
                        {metrica !== "publicaciones" && (
                          <span className="ml-1 text-[11px] text-[var(--color-tinta-tenue)]">
                            ({s.publicaciones[i]})
                          </span>
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

      {/* Por cuenta */}
      {resumenes.some((r) => r.cuentas.length > 0) && (
        <section className="tarjeta overflow-hidden">
          <div className="border-b border-[var(--color-filete)] px-4 py-3">
            <h2 className="text-sm font-semibold tracking-tight">En qué cuentas se usa</h2>
            <p className="mt-0.5 text-xs text-[var(--color-tinta-suave)]">
              Cada cuenta se compara contra el resto de SUS publicaciones del
              período: una cuenta chica no se ve mal por estar al lado de una grande.
            </p>
          </div>
          <div className="scroll-x">
            <table className="w-full border-collapse text-left">
              <thead className="border-b border-[var(--color-filete)] bg-[var(--color-realce)]/60">
                <tr>
                  <th className="th">Hashtag</th>
                  <th className="th">Cuenta</th>
                  <th className="th text-right">Publicaciones</th>
                  {metrica !== "publicaciones" && (
                    <>
                      <th className="th text-right">{nombre} / pub.</th>
                      <th className="th text-center">Contra el resto de la cuenta</th>
                    </>
                  )}
                </tr>
              </thead>
              <tbody>
                {resumenes.flatMap((r) =>
                  r.cuentas.map((c, i) => (
                    <tr key={`${r.hashtag}-${c.cuentaId}`} className="border-b border-[var(--color-filete)] last:border-0">
                      <td className="td">
                        {i === 0 && (
                          <span className="flex items-center gap-2 font-medium">
                            <Punto color={color(r.hashtag)} />#{r.hashtag}
                          </span>
                        )}
                      </td>
                      <td className="td">{c.nombre}</td>
                      <td className="td text-right cifra">{numero(c.publicaciones)}</td>
                      {metrica !== "publicaciones" && (
                        <>
                          <td className="td text-right cifra">{valorTexto(c.valor, metrica)}</td>
                          <td className="td text-center">
                            <Delta
                              valor={c.vsResto}
                              titulo="Contra el resto de las publicaciones de esta cuenta en el período"
                            />
                          </td>
                        </>
                      )}
                    </tr>
                  )),
                )}
              </tbody>
            </table>
          </div>
        </section>
      )}

      {/* Las publicaciones mismas */}
      {publicaciones.length > 0 && (
        <section className="tarjeta overflow-hidden">
          <div className="border-b border-[var(--color-filete)] px-4 py-3">
            <h2 className="text-sm font-semibold tracking-tight">
              Publicaciones con {resumenes.length === 1 ? "el hashtag" : "estos hashtags"}
            </h2>
            <p className="mt-0.5 text-xs text-[var(--color-tinta-suave)]">
              {publicaciones.length} en el período, de la más reciente a la más antigua.
            </p>
          </div>
          <div className="scroll-x">
            <table className="w-full border-collapse text-left">
              <thead className="border-b border-[var(--color-filete)] bg-[var(--color-realce)]/60">
                <tr>
                  <th className="th">Fecha</th>
                  <th className="th">Cuenta</th>
                  <th className="th">Hashtag</th>
                  <th className="th">Publicación</th>
                  <th className="th text-right">Alcance</th>
                  <th className="th text-right">Visualiz.</th>
                  <th className="th text-right">Interac.</th>
                </tr>
              </thead>
              <tbody>
                {publicaciones.slice(0, cuantas).map((p) => (
                  <tr key={p.id} className="border-b border-[var(--color-filete)] last:border-0">
                    <td className="td cifra">{fechaCorta(p.fecha)}</td>
                    <td className="td">{p.cuenta}</td>
                    <td className="td">
                      <span className="flex gap-1">
                        {p.hashtags.map((h) => (
                          <span key={h} title={`#${h}`}>
                            <Punto color={color(h)} />
                          </span>
                        ))}
                      </span>
                    </td>
                    <td className="td max-w-[28rem] truncate">
                      {p.enlace ? (
                        <a
                          href={p.enlace}
                          target="_blank"
                          rel="noreferrer"
                          className="underline-offset-2 hover:underline"
                          title={p.titulo ?? undefined}
                        >
                          {p.titulo ?? "Ver publicación"}
                        </a>
                      ) : (
                        <span title={p.titulo ?? undefined}>{p.titulo ?? "—"}</span>
                      )}
                    </td>
                    <td className="td text-right cifra">{p.alcance === null ? "—" : numero(p.alcance)}</td>
                    <td className="td text-right cifra">
                      {p.visualizaciones === null ? "—" : numero(p.visualizaciones)}
                    </td>
                    <td className="td text-right cifra">
                      {p.interacciones === null ? "—" : numero(p.interacciones)}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          {publicaciones.length > cuantas && (
            <div className="border-t border-[var(--color-filete)] px-4 py-2.5 text-center">
              <button type="button" onClick={() => setCuantas((c) => c + 50)} className="boton-suave">
                Mostrar más ({publicaciones.length - cuantas} restantes)
              </button>
            </div>
          )}
        </section>
      )}
    </div>
  );
}
