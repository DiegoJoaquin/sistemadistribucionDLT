import { describe, expect, it } from "vitest";
import type { Espejo } from "@/lib/dominio/espejos";
import { seccionEspejosHTML, seccionEspejosTexto, TOPE_ESPEJOS_CORREO } from "./espejos-correo";

const DISPAR: Espejo = {
  id: "a+b+c",
  titulo: "¿QUÉ CHU*** PASÓ EN AZUL AZUL?",
  fecha: "2026-10-19",
  versiones: [
    { id: "a", red: "Instagram", cuenta: "Instagram DLT", fecha: "2026-10-19", visualizaciones: 133_300, habitual: 80_000, indice: 1.67, enlace: "https://www.instagram.com/reel/De1kJuPRfRn/", porDuracion: false, temprano: false },
    { id: "b", red: "TikTok", cuenta: "DBF", fecha: "2026-10-19", visualizaciones: 23_537, habitual: 50_000, indice: 0.47, enlace: "https://www.tiktok.com/@debuenafuente.dlt/video/7699843600997371157", porDuracion: false, temprano: false },
    { id: "c", red: "YouTube", cuenta: "YouTube", fecha: "2026-10-20", visualizaciones: 4_100, habitual: null, indice: null, enlace: "https://www.youtube.com/shorts/SwtRhyFCVJg", porDuracion: true, temprano: false },
  ],
  disparidad: 3.54,
  dispar: true,
  mejor: "Instagram",
  peor: "TikTok",
};

const PAREJO: Espejo = {
  ...DISPAR,
  id: "d+e",
  titulo: "Para que Gago tome nota",
  versiones: DISPAR.versiones.slice(0, 2).map((v) => ({ ...v, indice: 1 })),
  disparidad: 1,
  dispar: false,
  mejor: "Instagram",
  peor: "TikTok",
};

describe("sección de espejos en el correo", () => {
  const html = seccionEspejosHTML([DISPAR, PAREJO]);

  it("muestra una tabla con las tres redes y el rendimiento de cada versión", () => {
    expect(html).toContain("Publicaciones espejo");
    for (const red of ["Instagram", "TikTok", "YouTube"]) expect(html).toContain(red);
    expect(html).toContain("133.300");
    expect(html).toContain("sin habitual");
    expect(html).toContain("por duración");
  });

  it("marca el dispar y dice cuántas veces rinde una red lo que otra", () => {
    expect(html).toContain("Instagram rinde 3,5 veces lo que TikTok");
    expect(html).toContain("1 con rendimiento muy distinto");
    expect(html).toContain("Parejo");
    expect(html).toContain("1,7× su habitual");
  });

  it("enlaza cada versión", () => {
    expect(html).toContain('href="https://www.youtube.com/shorts/SwtRhyFCVJg"');
  });

  it("una red sin versión queda con guion", () => {
    expect(seccionEspejosHTML([PAREJO])).toContain(">—</td>");
  });

  it("sin espejos lo dice, en vez de mostrar una tabla vacía", () => {
    expect(seccionEspejosHTML([])).toContain("no hay videos que se hayan subido a más de una red");
  });

  it("corta en el tope para no pasar el límite de Gmail", () => {
    const muchos = Array.from({ length: TOPE_ESPEJOS_CORREO + 5 }, (_, i) => ({ ...PAREJO, id: `p${i}` }));
    const h = seccionEspejosHTML(muchos);
    expect(h.match(/<tr/g)?.length).toBe(TOPE_ESPEJOS_CORREO + 1);
    expect(h).toContain("Y 5 espejos parejos más");
  });

  it("la versión de texto lleva lo mismo", () => {
    const t = seccionEspejosTexto([DISPAR]).join("\n");
    expect(t).toContain("⚠ ¿QUÉ CHU*** PASÓ EN AZUL AZUL? — Instagram rinde 3,5 veces lo que TikTok");
    expect(t).toContain("TikTok (DBF): 23.537 visualizaciones, 0,5× su habitual");
    expect(t).toContain("(por duración)");
  });

  it("una versión temprana lo dice", () => {
    const temprano = { ...DISPAR, versiones: DISPAR.versiones.map((v, i) => ({ ...v, temprano: i === 0 })) };
    expect(seccionEspejosHTML([temprano])).toContain("dato temprano");
  });
});
