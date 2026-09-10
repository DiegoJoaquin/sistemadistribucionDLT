/**
 * Los esquemas se prueban con FormData de verdad, armado como lo manda el
 * navegador — incluidos los campos que NO viajan porque no se renderizaron o
 * están deshabilitados.
 *
 * Esa era la falla: la sección de métricas de perfil viene colapsada por
 * defecto, sus tres campos no existen en el DOM, y el esquema rechazaba el
 * envío con "expected nonoptional, received undefined". El formulario principal
 * de la aplicación no funcionaba en su estado por defecto.
 */
import { describe, expect, it } from "vitest";
import {
  desdeFormData,
  enteroDeFormulario,
  esquemaRegistro,
  esquemaReporte,
  primerError,
} from "./esquemas";

/** Arma un FormData con solo las claves indicadas, como haría el navegador. */
function formulario(campos: Record<string, string>): FormData {
  const fd = new FormData();
  for (const [k, v] of Object.entries(campos)) fd.set(k, v);
  return fd;
}

/** Lo que envía el formulario de registro con la sección de perfil cerrada. */
const COMO_LO_MANDA_EL_NAVEGADOR = {
  fecha: "2026-09-10",
  plataforma: "Instagram DLT",
  categoria: "Reel",
  publicaciones: "3",
  alcance: "45000",
  visualizaciones: "90000",
  interacciones: "3200",
  nuevos_seguidores: "12",
  titulo_contenido: "",
  enlace: "",
  // visitas_perfil, vistas_seguidores y vistas_no_seguidores NO están:
  // la sección venía colapsada.
};

describe("el formulario de registro en su estado por defecto", () => {
  it("acepta el envío sin las métricas de perfil", () => {
    const r = esquemaRegistro.safeParse(
      desdeFormData(formulario(COMO_LO_MANDA_EL_NAVEGADOR)),
    );
    expect(r.success, r.success ? "" : primerError(r.error)).toBe(true);
  });

  it("deja las métricas ausentes en null, no en cero (§9.4)", () => {
    const d = esquemaRegistro.parse(
      desdeFormData(formulario(COMO_LO_MANDA_EL_NAVEGADOR)),
    );
    expect(d.visitas_perfil).toBeNull();
    expect(d.vistas_seguidores).toBeNull();
    expect(d.vistas_no_seguidores).toBeNull();
  });

  it("convierte los campos de texto vacíos en null", () => {
    const d = esquemaRegistro.parse(
      desdeFormData(formulario(COMO_LO_MANDA_EL_NAVEGADOR)),
    );
    expect(d.titulo_contenido).toBeNull();
    expect(d.enlace).toBeNull();
  });

  it("lee bien las métricas que sí vienen", () => {
    const d = esquemaRegistro.parse(
      desdeFormData(formulario(COMO_LO_MANDA_EL_NAVEGADOR)),
    );
    expect(d.publicaciones).toBe(3);
    expect(d.alcance).toBe(45_000);
    expect(d.visualizaciones).toBe(90_000);
    expect(d.interacciones).toBe(3_200);
    expect(d.nuevos_seguidores).toBe(12);
    expect(d.categoria).toBe("Reel");
  });
});

describe("campos que el navegador no envía por estar deshabilitados", () => {
  it("acepta que falte la categoría", () => {
    const { categoria: _, ...sinCategoria } = COMO_LO_MANDA_EL_NAVEGADOR;
    const r = esquemaRegistro.safeParse(desdeFormData(formulario(sinCategoria)));
    expect(r.success, r.success ? "" : primerError(r.error)).toBe(true);
    if (r.success) expect(r.data.categoria).toBeNull();
  });

  it("acepta que falte el alcance en YouTube, donde el campo va deshabilitado", () => {
    const r = esquemaRegistro.safeParse(
      desdeFormData(
        formulario({
          fecha: "2026-09-10",
          plataforma: "YouTube",
          categoria: "Short",
          publicaciones: "2",
          visualizaciones: "8000",
          interacciones: "300",
          nuevos_seguidores: "4",
        }),
      ),
    );
    expect(r.success, r.success ? "" : primerError(r.error)).toBe(true);
    if (r.success) expect(r.data.alcance).toBeNull();
  });

  it("acepta un envío con lo mínimo indispensable", () => {
    const r = esquemaRegistro.safeParse(
      desdeFormData(
        formulario({ fecha: "2026-09-10", plataforma: "TikTok", publicaciones: "1" }),
      ),
    );
    expect(r.success, r.success ? "" : primerError(r.error)).toBe(true);
  });
});

describe("las reglas que sí deben rechazar", () => {
  const con = (extra: Record<string, string>) =>
    esquemaRegistro.safeParse(
      desdeFormData(formulario({ ...COMO_LO_MANDA_EL_NAVEGADOR, ...extra })),
    );

  it("§9.5 — rechaza cero publicaciones", () => {
    const r = con({ publicaciones: "0" });
    expect(r.success).toBe(false);
    if (!r.success) expect(primerError(r.error)).toMatch(/al menos 1 publicación/i);
  });

  it("§9.5 — rechaza publicaciones con decimales", () => {
    const r = con({ publicaciones: "2.5" });
    expect(r.success).toBe(false);
  });

  it("§9.6 — rechaza alcance en YouTube", () => {
    const r = con({ plataforma: "YouTube", categoria: "Short", alcance: "5000" });
    expect(r.success).toBe(false);
    if (!r.success) expect(primerError(r.error)).toMatch(/YouTube no entrega alcance/i);
  });

  it("§9.3 — rechaza una categoría que no es de la plataforma", () => {
    const r = con({ plataforma: "YouTube", categoria: "Carrusel" });
    expect(r.success).toBe(false);
    if (!r.success) expect(primerError(r.error)).toMatch(/no corresponde a la plataforma/i);
  });

  it("§9.3 — rechaza una plataforma inventada", () => {
    const r = con({ plataforma: "Instagram" });
    expect(r.success).toBe(false);
  });

  it("rechaza un enlace sin protocolo", () => {
    const r = con({ enlace: "instagram.com/p/abc" });
    expect(r.success).toBe(false);
    if (!r.success) expect(primerError(r.error)).toMatch(/http/i);
  });

  it("acepta un enlace bien formado", () => {
    const r = con({ enlace: "https://www.instagram.com/reel/DcuvFhyugm-/" });
    expect(r.success).toBe(true);
    if (r.success) expect(r.data.enlace).toBe("https://www.instagram.com/reel/DcuvFhyugm-/");
  });

  it("rechaza una fecha ausente con un mensaje entendible", () => {
    const { fecha: _, ...sinFecha } = COMO_LO_MANDA_EL_NAVEGADOR;
    const r = esquemaRegistro.safeParse(desdeFormData(formulario(sinFecha)));
    expect(r.success).toBe(false);
    if (!r.success) expect(primerError(r.error)).toBe("Falta la fecha.");
  });

  it("rechaza una fecha mal formada con un mensaje entendible", () => {
    const r = con({ fecha: "10-09-2026" });
    expect(r.success).toBe(false);
    if (!r.success) expect(primerError(r.error)).toBe("La fecha no es válida.");
  });

  it("rechaza una plataforma ausente con un mensaje entendible", () => {
    const { plataforma: _, ...sinPlataforma } = COMO_LO_MANDA_EL_NAVEGADOR;
    const r = esquemaRegistro.safeParse(desdeFormData(formulario(sinPlataforma)));
    expect(r.success).toBe(false);
    if (!r.success) expect(primerError(r.error)).toMatch(/plataforma/i);
  });

  it("ningún mensaje de error deja escapar la jerga de Zod", () => {
    const casos: Record<string, string>[] = [
      {},
      { fecha: "no es fecha", plataforma: "Instagram DLT", publicaciones: "1" },
      { fecha: "2026-09-10", plataforma: "Marte", publicaciones: "1" },
      { fecha: "2026-09-10", plataforma: "TikTok", publicaciones: "0" },
      { fecha: "2026-09-10", plataforma: "TikTok" },
    ];
    for (const caso of casos) {
      const r = esquemaRegistro.safeParse(desdeFormData(formulario(caso)));
      expect(r.success, `este caso no debería pasar: ${JSON.stringify(caso)}`).toBe(false);
      if (!r.success) {
        const msg = primerError(r.error);
        expect(msg, `mensaje crudo de Zod para ${JSON.stringify(caso)}`).not.toMatch(
          /Invalid input|expected|received|nonoptional/i,
        );
      }
    }
  });
});

describe("números como los escribe la gente", () => {
  const parsear = (v: string | undefined) => {
    const fd = new FormData();
    if (v !== undefined) fd.set("x", v);
    return enteroDeFormulario.parse(desdeFormData(fd).x);
  };

  it("acepta miles con punto", () => {
    expect(parsear("58.095")).toBe(58_095);
    expect(parsear("1.234.567")).toBe(1_234_567);
  });

  it("acepta decimales con coma y redondea", () => {
    expect(parsear("1.234,6")).toBe(1_235);
  });

  it("acepta un número pelado", () => {
    expect(parsear("45000")).toBe(45_000);
  });

  it("ignora espacios", () => {
    expect(parsear(" 45 000 ")).toBe(45_000);
  });

  it("§9.4 — vacío y ausente son null; el cero real es cero", () => {
    expect(parsear("")).toBeNull();
    expect(parsear(undefined)).toBeNull();
    expect(parsear("0")).toBe(0);
  });

  it("el texto que no es número queda en null, no revienta", () => {
    expect(parsear("no sé")).toBeNull();
  });
});

describe("el formulario del reporte", () => {
  it("acepta que todas las secciones de texto vengan vacías", () => {
    const r = esquemaReporte.safeParse(
      desdeFormData(formulario({ fecha: "2026-09-10" })),
    );
    expect(r.success, r.success ? "" : primerError(r.error)).toBe(true);
    if (r.success) expect(r.data.aprendizajes).toBeNull();
  });

  it("conserva el texto escrito", () => {
    const d = esquemaReporte.parse(
      desdeFormData(
        formulario({
          fecha: "2026-09-10",
          aprendizajes: "  Los reels reactivos rinden mejor de noche.  ",
        }),
      ),
    );
    expect(d.aprendizajes).toBe("Los reels reactivos rinden mejor de noche.");
  });
});
