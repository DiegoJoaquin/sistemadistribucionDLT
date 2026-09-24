"use client";

import { useRef, useState } from "react";

/**
 * Vista previa del correo dentro de un iframe con `srcDoc`: los estilos en
 * línea del correo quedan aislados de los de la aplicación, así que lo que se
 * ve acá es lo que llega al buzón.
 *
 * La comparten el reporte semanal, el diario y el informe por cliente.
 */
export function VistaPreviaReporte({
  html,
  texto,
  nombreArchivo,
  titulo = "Vista previa del correo",
}: {
  html: string;
  texto: string;
  /** Sin extensión: se le agrega la que corresponda al descargar. */
  nombreArchivo: string;
  titulo?: string;
}) {
  const [aviso, setAviso] = useState<string | null>(null);
  const marco = useRef<HTMLIFrameElement>(null);

  const avisar = (m: string) => {
    setAviso(m);
    setTimeout(() => setAviso(null), 6000);
  };

  const copiar = async (contenido: string, que: string) => {
    try {
      await navigator.clipboard.writeText(contenido);
      avisar(`${que} copiado al portapapeles.`);
    } catch {
      avisar("El navegador bloqueó el portapapeles. Usa Descargar.");
    }
  };

  /*
   * El PDF se genera con la impresión del navegador y no en el servidor.
   *
   * Es una decisión, no una limitación: generarlo en el servidor obliga a
   * empaquetar un Chromium headless de unos 50 MB, que en el plan gratuito de
   * Vercel puede pasarse del límite de tamaño de la función y tumbar el
   * despliegue entero. La impresión del navegador produce un PDF de igual o
   * mejor calidad —texto de verdad, seleccionable, no una imagen— usando este
   * mismo HTML, que es exactamente lo que se ve en la vista previa.
   *
   * El nombre del archivo que propone el diálogo sale del <title> del
   * documento, que ya viene con el cliente y el período.
   */
  const guardarPDF = () => {
    const ventana = marco.current?.contentWindow;
    if (!ventana) {
      avisar("No pude abrir el diálogo de impresión. Descarga el HTML y ábrelo.");
      return;
    }
    try {
      ventana.focus();
      ventana.print();
      avisar('En el diálogo, elige "Guardar como PDF" como destino.');
    } catch {
      avisar("El navegador bloqueó la impresión. Descarga el HTML y ábrelo.");
    }
  };

  const descargarHTML = () => {
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
            Así se ve en el buzón y así sale el PDF.
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
          <button type="button" className="boton" onClick={guardarPDF}>
            Descargar PDF
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

      {/*
        `allow-same-origin` es lo que permite al botón llamar a print() dentro
        del marco, y `allow-modals` que se abra el diálogo. `allow-scripts` NO
        va: el HTML es nuestro y no lleva scripts, así que mantenerlo apagado
        no cuesta nada y cierra la puerta por si alguna vez entrara texto de un
        archivo ajeno sin escapar.
      */}
      <iframe
        ref={marco}
        title={titulo}
        srcDoc={html}
        className="h-[70vh] w-full border-0 bg-[var(--color-papel)]"
        sandbox="allow-same-origin allow-modals"
      />

      <div className="flex flex-wrap items-center justify-between gap-2 border-t border-[var(--color-filete)] px-4 py-2">
        <p className="text-[11px] leading-relaxed text-[var(--color-tinta-tenue)]">
          El PDF se guarda desde el diálogo de impresión: elige{" "}
          <strong>Guardar como PDF</strong> en Destino. Sale con los colores y
          sin cortar los bloques entre páginas.
        </p>
        <button
          type="button"
          onClick={descargarHTML}
          className="text-[11px] text-[var(--color-tinta-tenue)] underline-offset-2 hover:text-[var(--color-tinta)] hover:underline"
        >
          Descargar el HTML
        </button>
      </div>
    </section>
  );
}
