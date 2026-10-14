"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useId, useMemo, useState } from "react";
import {
  buscarEnCatalogo,
  type EntradaCatalogo,
  MAXIMO_HASHTAGS,
  normalizarBusqueda,
  type ParametrosHashtags,
  urlHashtags,
} from "@/lib/dominio/hashtags";
import { fechaCorta } from "@/lib/dominio/formato";
import { APAGADO } from "@/lib/dominio/paleta";

/**
 * Buscar un hashtag y sumarlo a la comparación.
 *
 * Dos caminos que se combinan: escribir (con sugerencias mientras se escribe,
 * que además dicen cuántas veces se usó cada uno) o apretar uno de los más
 * usados del período, que responde de paso "¿qué hashtags hay?".
 *
 * Los elegidos van arriba con el color que tendrán en el gráfico, para saber
 * qué línea es cuál antes de mirar la leyenda.
 */
export function BuscadorHashtags({
  catalogo,
  parametros,
  colores,
}: {
  catalogo: EntradaCatalogo[];
  parametros: ParametrosHashtags;
  colores: Record<string, string>;
}) {
  const router = useRouter();
  const id = useId();
  const [consulta, setConsulta] = useState("");
  const [abierta, setAbierta] = useState(false);
  const [activa, setActiva] = useState(0);

  const elegidos = parametros.h;
  const lleno = elegidos.length >= MAXIMO_HASHTAGS;
  const indice = useMemo(() => new Map(catalogo.map((e) => [e.hashtag, e])), [catalogo]);

  const sugerencias = useMemo(
    () => buscarEnCatalogo(catalogo, consulta, 10).filter((e) => !elegidos.includes(e.hashtag)),
    [catalogo, consulta, elegidos],
  );
  const masUsados = useMemo(
    () => catalogo.filter((e) => !elegidos.includes(e.hashtag)).slice(0, 14),
    [catalogo, elegidos],
  );

  const con = (h: string[]) => urlHashtags({ ...parametros, h });

  const elegir = (hashtag: string) => {
    if (lleno || elegidos.includes(hashtag)) return;
    setConsulta("");
    setAbierta(false);
    router.push(con([...elegidos, hashtag]), { scroll: false });
  };

  /*
   * Enter con algo escrito que no está en la lista: se busca igual. Puede ser
   * un hashtag que en este período no se usó, y la respuesta "no se usó" también
   * es una respuesta.
   */
  const alEnviar = () => {
    const elegida = abierta ? sugerencias[activa] : undefined;
    if (elegida) return elegir(elegida.hashtag);
    const escrito = normalizarBusqueda(consulta);
    if (escrito) elegir(escrito);
  };

  const listaId = `${id}-lista`;

  return (
    <section className="tarjeta space-y-3 p-4">
      <div className="flex flex-wrap items-end gap-3">
        <div className="relative min-w-[16rem] flex-1 space-y-1">
          <label className="etiqueta" htmlFor={`${id}-q`}>
            Buscar hashtag
          </label>
          <input
            id={`${id}-q`}
            type="search"
            role="combobox"
            aria-expanded={abierta && sugerencias.length > 0}
            aria-controls={listaId}
            aria-autocomplete="list"
            autoComplete="off"
            placeholder={lleno ? `Máximo ${MAXIMO_HASHTAGS}: quita uno para sumar otro` : "#agendadlt"}
            disabled={lleno}
            value={consulta}
            onChange={(e) => {
              setConsulta(e.target.value);
              setAbierta(true);
              setActiva(0);
            }}
            onFocus={() => setAbierta(true)}
            onBlur={() => setTimeout(() => setAbierta(false), 120)}
            onKeyDown={(e) => {
              if (e.key === "ArrowDown") {
                e.preventDefault();
                setAbierta(true);
                setActiva((i) => Math.min(i + 1, sugerencias.length - 1));
              } else if (e.key === "ArrowUp") {
                e.preventDefault();
                setActiva((i) => Math.max(i - 1, 0));
              } else if (e.key === "Enter") {
                e.preventDefault();
                alEnviar();
              } else if (e.key === "Escape") {
                setAbierta(false);
              }
            }}
            className="campo w-full"
          />

          {abierta && consulta.trim() !== "" && (
            <ul
              id={listaId}
              role="listbox"
              className="absolute left-0 right-0 top-full z-20 mt-1 max-h-80 overflow-auto rounded-md border border-[var(--color-filete-fuerte)] bg-white py-1 shadow-sm"
            >
              {sugerencias.length === 0 ? (
                <li className="px-3 py-2 text-[13px] text-[var(--color-tinta-suave)]">
                  Ningún hashtag del período calza. Enter para buscar #
                  {normalizarBusqueda(consulta)} igual.
                </li>
              ) : (
                sugerencias.map((e, i) => (
                  <li
                    key={e.hashtag}
                    role="option"
                    aria-selected={i === activa}
                    onMouseDown={(ev) => {
                      // mousedown y no click: el click llega después del blur que cierra la lista.
                      ev.preventDefault();
                      elegir(e.hashtag);
                    }}
                    onMouseEnter={() => setActiva(i)}
                    className={`flex cursor-pointer items-baseline gap-2 px-3 py-1.5 text-[13px] ${
                      i === activa ? "bg-[var(--color-realce)]" : ""
                    }`}
                  >
                    <span className="font-medium">#{e.hashtag}</span>
                    <span className="ml-auto text-[11px] text-[var(--color-tinta-tenue)]">
                      {e.publicaciones} pub. · {e.cuentas} {e.cuentas === 1 ? "cuenta" : "cuentas"} ·
                      última {fechaCorta(e.ultima)}
                    </span>
                  </li>
                ))
              )}
            </ul>
          )}
        </div>

        {elegidos.length > 0 && (
          <Link href={con([])} scroll={false} className="boton-suave">
            Limpiar
          </Link>
        )}
      </div>

      {elegidos.length > 0 && (
        <div className="flex flex-wrap items-center gap-2">
          <span className="etiqueta">Comparando</span>
          {elegidos.map((h) => {
            const e = indice.get(h);
            return (
              <span
                key={h}
                className="inline-flex items-center gap-1.5 rounded-full border border-[var(--color-filete-fuerte)] bg-white py-0.5 pl-2.5 pr-1 text-[13px]"
              >
                <span
                  aria-hidden
                  className="inline-block size-2.5 rounded-full"
                  style={{ backgroundColor: colores[h] ?? APAGADO }}
                />
                <span className="font-medium">#{h}</span>
                <span className="text-[11px] text-[var(--color-tinta-tenue)]">
                  {e ? `${e.publicaciones} pub.` : "sin uso en el período"}
                </span>
                <Link
                  href={con(elegidos.filter((x) => x !== h))}
                  scroll={false}
                  aria-label={`Quitar #${h}`}
                  className="ml-0.5 rounded-full px-1.5 text-[var(--color-tinta-tenue)] hover:bg-[var(--color-realce)] hover:text-[var(--color-tinta)]"
                >
                  ×
                </Link>
              </span>
            );
          })}
        </div>
      )}

      {!lleno && masUsados.length > 0 && (
        <div className="flex flex-wrap items-center gap-1.5">
          <span className="etiqueta mr-1">Más usados en el período</span>
          {masUsados.map((e) => (
            <button
              key={e.hashtag}
              type="button"
              onClick={() => elegir(e.hashtag)}
              className="rounded-full border border-[var(--color-filete)] px-2.5 py-0.5 text-[12px] text-[var(--color-tinta-suave)] transition hover:border-[var(--color-filete-fuerte)] hover:text-[var(--color-tinta)]"
            >
              #{e.hashtag}
              <span className="ml-1 text-[11px] text-[var(--color-tinta-tenue)]">{e.publicaciones}</span>
            </button>
          ))}
        </div>
      )}
    </section>
  );
}
