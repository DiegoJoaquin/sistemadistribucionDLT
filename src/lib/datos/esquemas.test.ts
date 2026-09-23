/**
 * Los esquemas se prueban con FormData de verdad, armado como lo manda el
 * navegador — incluidos los campos que NO viajan porque no se renderizaron o
 * están deshabilitados.
 *
 * Esa era la falla original: la sección de métricas de perfil viene colapsada
 * por defecto, sus tres campos no existen en el DOM, y el esquema rechazaba el
 * envío con "expected nonoptional, received undefined". El formulario principal
 * de la aplicación no funcionaba en su estado por defecto.
 */
import { describe, expect, it } from "vitest";
import {
  desdeFormData,
  enteroDeFormulario,
  esquemaCuenta,
  esquemaRegistroPara,
  esquemaReporte,
  primerError,
} from "./esquemas";
import { type Cuenta, type Red } from "@/lib/dominio/redes";

function cuenta(id: string, nombre: string, red: Red): Cuenta {
  return {
    id,
    nombre,
    usuario: null,
    red,
    es_influencer: false,
    activa: true,
    orden: 1,
  };
}

const ID_DLT = "11111111-1111-4111-8111-111111111111";
const ID_TIKTOK = "22222222-2222-4222-8222-222222222222";
const ID_YT = "33333333-3333-4333-8333-333333333333";
const ID_DIEGOAT = "44444444-4444-4444-8444-444444444444";

const CUENTAS: Cuenta[] = [
  cuenta(ID_DLT, "Instagram DLT", "Instagram"),
  cuenta(ID_TIKTOK, "TikTok", "TikTok"),
  cuenta(ID_YT, "YouTube", "YouTube"),
  { ...cuenta(ID_DIEGOAT, "DiegoAT", "TikTok"), es_influencer: true },
];

const esquema = esquemaRegistroPara(CUENTAS);

/** Arma un FormData con solo las claves indicadas, como haría el navegador. */
function formulario(campos: Record<string, string>): FormData {
  const fd = new FormData();
  for (const [k, v] of Object.entries(campos)) fd.set(k, v);
  return fd;
}

/** Lo que envía el formulario de registro con la sección de perfil cerrada. */
const COMO_LO_MANDA_EL_NAVEGADOR = {
  fecha: "2026-09-21",
  cuenta_id: ID_DLT,
  categoria: "Reel",
  tipo: "Reactivo",
  hashtag: "#Fecha21xDLT",
  publicaciones: "1",
  alcance: "45000",
  visualizaciones: "90000",
  interacciones: "3200",
  nuevos_seguidores: "12",
  titulo_contenido: "",
  enlace: "",
  // visitas_perfil, vistas_seguidores y vistas_no_seguidores NO están:
  // la sección venía colapsada.
};

const parsear = (extra: Record<string, string> = {}) =>
  esquema.safeParse(
    desdeFormData(formulario({ ...COMO_LO_MANDA_EL_NAVEGADOR, ...extra })),
  );

describe("el formulario de registro en su estado por defecto", () => {
  it("acepta el envío sin las métricas de perfil", () => {
    const r = parsear();
    expect(r.success, r.success ? "" : primerError(r.error)).toBe(true);
  });

  it("deja las métricas ausentes en null, no en cero (§9.4)", () => {
    const d = esquema.parse(desdeFormData(formulario(COMO_LO_MANDA_EL_NAVEGADOR)));
    expect(d.visitas_perfil).toBeNull();
    expect(d.vistas_seguidores).toBeNull();
    expect(d.vistas_no_seguidores).toBeNull();
    expect(d.titulo_contenido).toBeNull();
    expect(d.enlace).toBeNull();
  });

  it("lee bien la cuenta, el formato, el tipo y las métricas", () => {
    const d = esquema.parse(desdeFormData(formulario(COMO_LO_MANDA_EL_NAVEGADOR)));
    expect(d.cuenta_id).toBe(ID_DLT);
    expect(d.categoria).toBe("Reel");
    expect(d.tipo).toBe("Reactivo");
    expect(d.publicaciones).toBe(1);
    expect(d.alcance).toBe(45_000);
  });
});

describe("el hashtag se normaliza antes de guardarlo", () => {
  it("queda en mayúsculas, sin numeral y sin tildes", () => {
    expect(esquema.parse(desdeFormData(formulario({ ...COMO_LO_MANDA_EL_NAVEGADOR }))).hashtag).toBe(
      "FECHA21XDLT",
    );
    expect(parsear({ hashtag: "#QuéCambió" }).success).toBe(true);
    expect(esquema.parse(desdeFormData(formulario({ ...COMO_LO_MANDA_EL_NAVEGADOR, hashtag: "#QuéCambió" }))).hashtag).toBe(
      "QUECAMBIO",
    );
  });

  it("dos formas de escribir la misma serie quedan iguales", () => {
    const a = esquema.parse(
      desdeFormData(formulario({ ...COMO_LO_MANDA_EL_NAVEGADOR, hashtag: "fecha21xdlt" })),
    ).hashtag;
    const b = esquema.parse(
      desdeFormData(formulario({ ...COMO_LO_MANDA_EL_NAVEGADOR, hashtag: "  #FECHA21XDLT " })),
    ).hashtag;
    expect(a).toBe(b);
  });

  it("vacío o ausente queda en null (§9.4)", () => {
    expect(
      esquema.parse(desdeFormData(formulario({ ...COMO_LO_MANDA_EL_NAVEGADOR, hashtag: "  " })))
        .hashtag,
    ).toBeNull();
    const { hashtag: _, ...sinHashtag } = COMO_LO_MANDA_EL_NAVEGADOR;
    expect(esquema.parse(desdeFormData(formulario(sinHashtag))).hashtag).toBeNull();
  });
});

describe("campos que el navegador no envía por estar deshabilitados", () => {
  it("acepta que falte la categoría", () => {
    const { categoria: _, ...sin } = COMO_LO_MANDA_EL_NAVEGADOR;
    const r = esquema.safeParse(desdeFormData(formulario(sin)));
    expect(r.success, r.success ? "" : primerError(r.error)).toBe(true);
    if (r.success) expect(r.data.categoria).toBeNull();
  });

  it("acepta que falte el alcance en YouTube, donde el campo va deshabilitado", () => {
    const r = esquema.safeParse(
      desdeFormData(
        formulario({
          fecha: "2026-09-21",
          cuenta_id: ID_YT,
          categoria: "Short",
          publicaciones: "2",
          visualizaciones: "8000",
        }),
      ),
    );
    expect(r.success, r.success ? "" : primerError(r.error)).toBe(true);
    if (r.success) expect(r.data.alcance).toBeNull();
  });

  it("acepta un envío con lo mínimo indispensable", () => {
    const r = esquema.safeParse(
      desdeFormData(
        formulario({ fecha: "2026-09-21", cuenta_id: ID_TIKTOK, publicaciones: "1" }),
      ),
    );
    expect(r.success, r.success ? "" : primerError(r.error)).toBe(true);
  });
});

describe("las reglas que sí deben rechazar", () => {
  it("§9.5 — rechaza cero publicaciones", () => {
    const r = parsear({ publicaciones: "0" });
    expect(r.success).toBe(false);
    if (!r.success) expect(primerError(r.error)).toMatch(/al menos 1 publicación/i);
  });

  it("§9.6 — rechaza alcance en una cuenta de YouTube", () => {
    const r = parsear({ cuenta_id: ID_YT, categoria: "Short", tipo: "", alcance: "5000" });
    expect(r.success).toBe(false);
    if (!r.success) expect(primerError(r.error)).toMatch(/YouTube no entrega alcance/i);
  });

  it("§3.2 — rechaza una categoría que no es de la red de la cuenta", () => {
    const r = parsear({ cuenta_id: ID_YT, categoria: "Carrusel", tipo: "" });
    expect(r.success).toBe(false);
    if (!r.success) expect(primerError(r.error)).toMatch(/no corresponde a la red/i);
  });

  it("§3.2 — Reactivo y Normal solo existen en Instagram", () => {
    const r = parsear({ cuenta_id: ID_TIKTOK, categoria: "Video", tipo: "Reactivo" });
    expect(r.success).toBe(false);
    if (!r.success) expect(primerError(r.error)).toMatch(/clasificaciones de Instagram/i);
  });

  it("rechaza una cuenta que no existe", () => {
    const r = parsear({ cuenta_id: "99999999-9999-4999-8999-999999999999" });
    expect(r.success).toBe(false);
    if (!r.success) expect(primerError(r.error)).toMatch(/no existe o está desactivada/i);
  });

  it("rechaza un enlace sin protocolo", () => {
    const r = parsear({ enlace: "instagram.com/p/abc" });
    expect(r.success).toBe(false);
    if (!r.success) expect(primerError(r.error)).toMatch(/http/i);
  });

  it("las reglas valen igual en una cuenta de influencer", () => {
    // DiegoAT es TikTok: no puede llevar Carrusel ni Reactivo.
    expect(parsear({ cuenta_id: ID_DIEGOAT, categoria: "Carrusel", tipo: "" }).success).toBe(false);
    expect(parsear({ cuenta_id: ID_DIEGOAT, categoria: "Video", tipo: "" }).success).toBe(true);
  });

  it("ningún mensaje de error deja escapar la jerga de Zod", () => {
    const casos: Record<string, string>[] = [
      {},
      { fecha: "no es fecha", cuenta_id: ID_DLT, publicaciones: "1" },
      { fecha: "2026-09-21", cuenta_id: "no-es-uuid", publicaciones: "1" },
      { fecha: "2026-09-21", cuenta_id: ID_TIKTOK, publicaciones: "0" },
      { fecha: "2026-09-21", cuenta_id: ID_TIKTOK },
    ];
    for (const caso of casos) {
      const r = esquema.safeParse(desdeFormData(formulario(caso)));
      expect(r.success, `no debería pasar: ${JSON.stringify(caso)}`).toBe(false);
      if (!r.success) {
        expect(primerError(r.error), JSON.stringify(caso)).not.toMatch(
          /Invalid input|expected|received|nonoptional/i,
        );
      }
    }
  });
});

describe("números como los escribe la gente", () => {
  const num = (v: string | undefined) => {
    const fd = new FormData();
    if (v !== undefined) fd.set("x", v);
    return enteroDeFormulario.parse(desdeFormData(fd).x);
  };

  it("acepta miles con punto y decimales con coma", () => {
    expect(num("58.095")).toBe(58_095);
    expect(num("1.234.567")).toBe(1_234_567);
    expect(num("1.234,6")).toBe(1_235);
    expect(num(" 45 000 ")).toBe(45_000);
  });

  it("§9.4 — vacío y ausente son null; el cero real es cero", () => {
    expect(num("")).toBeNull();
    expect(num(undefined)).toBeNull();
    expect(num("0")).toBe(0);
    expect(num("no sé")).toBeNull();
  });
});

describe("el formulario de cuentas", () => {
  it("acepta lo mínimo y deja el orden por defecto", () => {
    const d = esquemaCuenta.parse(
      desdeFormData(formulario({ nombre: "DiegoAT", red: "TikTok" })),
    );
    expect(d.nombre).toBe("DiegoAT");
    expect(d.usuario).toBeNull();
    expect(d.es_influencer).toBe(false);
    expect(d.orden).toBe(100);
  });

  it("la casilla marcada llega como 'on'", () => {
    const d = esquemaCuenta.parse(
      desdeFormData(
        formulario({ nombre: "DiegoAT", red: "TikTok", es_influencer: "on", usuario: "@diegoat" }),
      ),
    );
    expect(d.es_influencer).toBe(true);
    expect(d.usuario).toBe("@diegoat");
  });

  it("§9.3 — rechaza una red inventada", () => {
    const r = esquemaCuenta.safeParse(
      desdeFormData(formulario({ nombre: "Kick DLT", red: "Kick" })),
    );
    expect(r.success).toBe(false);
    if (!r.success) expect(primerError(r.error)).toMatch(/red/i);
  });

  it("rechaza un nombre vacío", () => {
    const r = esquemaCuenta.safeParse(
      desdeFormData(formulario({ nombre: " ", red: "TikTok" })),
    );
    expect(r.success).toBe(false);
  });
});

describe("el formulario del reporte", () => {
  it("acepta que todas las secciones vengan vacías", () => {
    const r = esquemaReporte.safeParse(desdeFormData(formulario({ fecha: "2026-09-21" })));
    expect(r.success, r.success ? "" : primerError(r.error)).toBe(true);
    if (r.success) expect(r.data.aprendizajes).toBeNull();
  });

  it("conserva el texto escrito", () => {
    const d = esquemaReporte.parse(
      desdeFormData(
        formulario({ fecha: "2026-09-21", aprendizajes: "  Los reels rinden de noche.  " }),
      ),
    );
    expect(d.aprendizajes).toBe("Los reels rinden de noche.");
  });
});
