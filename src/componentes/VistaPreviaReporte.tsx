"use client";

import { useState } from "react";

/**
 * Vista previa del correo dentro de un iframe con `srcDoc`: los estilos en
 * línea del correo quedan aislados de los de la aplicación, así que lo que se
 * ve acá es lo que llega al buzón.
 *
 * La comparten el reporte semanal y el diario. El envío queda para después;
 * por ahora se copia o se descarga.
 */
export function VistaPreviaReporte({
  html,
  texto,
  nombreArchivo,
  titulo = "Vista previa del correo",
}: {
  html: string;
  texto: string;
  /** Sin extensión: se le agrega .html al descargar. */
  nombreArchivo: string;
  titulo?: string;
}) {
  const [aviso, setAviso] = useState<string | null>(null);

  const copiar = async (contenido: string, que: string) => {
    try {
      await navigator.clipboard.writeText(contenido);
      setAviso(`${que} copiado al portapapeles.`);
    } catch {
      setAviso("El navegador bloqueó el portapapeles. Usa Descargar.");
    }
    setTimeout(() => setAviso(null), 4000);
  };

  const descargar = () => {
    const blob = new Blob([html], { type: "text/html;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `${nombreArchivo}.html`;
    document.body.appendChild(a);
    a.click();
    a.remove();
    URL.revokeObjectURL(url);
  };

  return (
    <section className="tarjeta overflow-hidden">
      <div className="flex flex-wrap items-center justify-between gap-2 border-b border-[var(--color-filete)] px-4 py-3">
        <div>
          <h2 className="text-sm font-semibold">{titulo}</h2>
          <p className="mt-0.5 text-xs text-[var(--color-tinta-suave)]">
            Así se ve el reporte en el buzón.
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <button
            type="button"
            className="boton-suave"
            onClick={() => copiar(html, "HTML")}
          >
            Copiar HTML
          </button>
          <button
            type="button"
            className="boton-suave"
            onClick={() => copiar(texto, "Texto")}
          >
            Copiar texto
          </button>
          <button type="button" className="boton" onClick={descargar}>
            Descargar
          </button>
        </div>
      </div>

      {aviso && (
        <p
          role="status"
          className="border-b border-[var(--color-filete)] bg-[var(--color-realce)] px-4 py-2 text-sm text-[var(--color-tinta-suave)]"
        >
          {aviso}
        </p>
      )}

      <iframe
        title={titulo}
        srcDoc={html}
        className="h-[70vh] w-full border-0 bg-[var(--color-papel)]"
        sandbox=""
      />
    </section>
  );
}
