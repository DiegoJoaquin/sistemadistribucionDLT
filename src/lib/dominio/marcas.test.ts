import { describe, expect, it } from "vitest";
import {
  arrobasSinMarca,
  globalDeMarcas,
  type Marca,
  marcasDe,
  normalizarSenal,
  parsearSenales,
  type PublicacionMarca,
  senalesComoTexto,
  senalesDe,
} from "./marcas";

const SPARTA: Marca = {
  id: "sparta",
  nombre: "Sparta",
  activa: true,
  senales: [
    { tipo: "hashtag", valor: "SPARTAXDLT" },
    { tipo: "hashtag", valor: "ELLIVINGDELTEAMCHILE" },
    { tipo: "mencion", valor: "spartachile" },
    { tipo: "campana", valor: "SPARTA GLOBAL" },
  ],
};
const CROCS: Marca = {
  id: "crocs",
  nombre: "Crocs",
  activa: true,
  senales: [{ tipo: "mencion", valor: "crocschile" }],
};
const VIEJA: Marca = {
  id: "vieja",
  nombre: "Marca vieja",
  activa: false,
  senales: [{ tipo: "hashtag", valor: "SPARTAXDLT" }],
};

function pub(
  id: string,
  fecha: string,
  texto: string | null,
  extra: Partial<PublicacionMarca> & { campanas?: string | null; serie?: string | null } = {},
): PublicacionMarca {
  const { campanas = null, serie = null, ...resto } = extra;
  return {
    id,
    fecha,
    cuentaId: "ig-dlt",
    cuenta: "Instagram DLT",
    red: "Instagram",
    esInfluencer: false,
    categoria: "Reel",
    titulo: texto,
    enlace: null,
    textoCompleto: true,
    senales: senalesDe(texto, campanas, serie),
    ...resto,
  };
}

describe("normalizarSenal", () => {
  it("lleva los hashtags a mayúsculas sin tildes ni numeral", () => {
    expect(normalizarSenal("hashtag", "#QuéCambió")).toBe("QUECAMBIO");
  });

  it("lleva las arrobas a minúsculas y les quita el punto de la oración", () => {
    expect(normalizarSenal("mencion", "@SpartaChile.")).toBe("spartachile");
    expect(normalizarSenal("mencion", "@pf_marca_oficial")).toBe("pf_marca_oficial");
  });

  it("deja las campañas en mayúsculas, con sus espacios", () => {
    expect(normalizarSenal("campana", "  sparta   global ")).toBe("SPARTA GLOBAL");
  });

  it("devuelve null si no queda nada", () => {
    expect(normalizarSenal("mencion", "@")).toBeNull();
    expect(normalizarSenal("hashtag", "#")).toBeNull();
  });
});

describe("parsearSenales", () => {
  it("separa hashtags, arrobas y campañas como vengan pegados", () => {
    const s = parsearSenales("#SpartaXDLT, @spartachile\n#ElLivingDelTeamChile\ncampaña: SPARTA GLOBAL, el living");
    expect(s).toEqual([
      { tipo: "hashtag", valor: "SPARTAXDLT" },
      { tipo: "mencion", valor: "spartachile" },
      { tipo: "hashtag", valor: "ELLIVINGDELTEAMCHILE" },
      { tipo: "campana", valor: "SPARTA GLOBAL" },
      { tipo: "campana", valor: "EL LIVING" },
    ]);
  });

  it("toma una palabra sin prefijo como hashtag, igual que en los clientes", () => {
    expect(parsearSenales("BETANOxDLT")).toEqual([{ tipo: "hashtag", valor: "BETANOXDLT" }]);
  });

  it("no repite señales escritas de dos formas", () => {
    expect(parsearSenales("#betanoxdlt #BETANOxDLT @Betano_Chile @betano_chile")).toHaveLength(2);
  });

  it("vuelve a dar lo mismo al editarla", () => {
    const s = parsearSenales("@crocschile #CROCSXDLT\ncampana: CROCS");
    expect(parsearSenales(senalesComoTexto(s))).toEqual(
      expect.arrayContaining(s),
    );
    expect(parsearSenales(senalesComoTexto(s))).toHaveLength(s.length);
  });
});

describe("senalesDe y marcasDe", () => {
  it("reconoce una arroba escrita al final del texto", () => {
    const s = senalesDe("Mira esto 👀\n\nGracias @SpartaChile.", null);
    expect(marcasDe(s, [SPARTA, CROCS]).map((r) => r.marcaId)).toEqual(["sparta"]);
  });

  it("reconoce la campaña de Iconosquare aunque el texto no nombre la marca", () => {
    const s = senalesDe("Un video sin hashtags", "el living, SPARTA GLOBAL");
    const r = marcasDe(s, [SPARTA]);
    expect(r).toHaveLength(1);
    expect(r[0].por).toEqual([{ tipo: "campana", valor: "SPARTA GLOBAL" }]);
  });

  it("no cuenta una marca solo porque el texto la nombra sin su señal", () => {
    const s = senalesDe("Fuimos a la tienda Sparta del centro", null);
    expect(marcasDe(s, [SPARTA])).toEqual([]);
  });

  it("una arroba que solo empieza igual no es la de la marca", () => {
    const s = senalesDe("Saludos a @spartachile_oficial", null);
    expect(marcasDe(s, [SPARTA])).toEqual([]);
  });

  it("una publicación puede ser de dos marcas", () => {
    const s = senalesDe("#ElLivingDelTeamChile con @crocschile", null);
    expect(marcasDe(s, [SPARTA, CROCS]).map((r) => r.marcaId)).toEqual(["sparta", "crocs"]);
  });

  it("ignora las marcas desactivadas", () => {
    const s = senalesDe("#SpartaXDLT", null);
    expect(marcasDe(s, [VIEJA])).toEqual([]);
  });

  it("la serie del registro cuenta como hashtag aunque no haya texto", () => {
    const s = senalesDe(null, null, "SPARTAXDLT");
    expect(marcasDe(s, [SPARTA]).map((r) => r.marcaId)).toEqual(["sparta"]);
  });
});

describe("globalDeMarcas", () => {
  const pubs = [
    pub("1", "2026-10-05", "#ElLivingDelTeamChile capítulo nuevo"),
    pub("2", "2026-10-06", "Diegoat ready con @crocschile", { categoria: "Historia" }),
    pub("3", "2026-10-13", "Un video", { campanas: "SPARTA GLOBAL", red: "TikTok", cuentaId: "tt-dlt", cuenta: "TikTok DLT", categoria: "Video" }),
    pub("4", "2026-10-14", "#ElLivingDelTeamChile con @crocschile"),
    pub("5", "2026-10-14", "Nada de marca", { textoCompleto: false }),
    pub("6", "2026-10-15", "Saludos @spartachile", { cuentaId: "diegoat", cuenta: "Diegoat", esInfluencer: true }),
  ];

  const g = globalDeMarcas(pubs, [SPARTA, CROCS, VIEJA], "2026-10-05", "2026-10-18", "semana");

  it("cuenta las piezas de cada marca y ordena de más a menos", () => {
    expect(g.marcas.map((m) => [m.marca.nombre, m.piezas.length])).toEqual([
      ["Sparta", 4],
      ["Crocs", 2],
    ]);
  });

  it("no lista las marcas desactivadas", () => {
    expect(g.marcas.some((m) => m.marca.id === "vieja")).toBe(false);
  });

  it("separa por red, formato, cuenta y semana", () => {
    const sparta = g.marcas[0];
    expect(sparta.porRed).toEqual({ Instagram: 3, TikTok: 1 });
    expect(sparta.porFormato).toEqual({ Reel: 3, Video: 1 });
    expect(sparta.porPeriodo).toEqual([1, 3]);
    expect(sparta.periodosConPiezas).toBe(2);
    expect(sparta.porCuenta[0]).toMatchObject({ cuenta: "Instagram DLT", n: 2 });
  });

  it("separa las cuentas de DLT de las de los rostros", () => {
    expect(g.marcas[0].enCuentasDLT).toBe(3);
    expect(g.marcas[0].enRostros).toBe(1);
  });

  it("una pieza con dos marcas cuenta en las dos y una sola vez en el total", () => {
    expect(g.conMarca).toBe(5);
    expect(g.conVariasMarcas).toBe(1);
    expect(g.conMarcaEnRostros).toBe(1);
    expect(g.porPeriodo).toEqual([2, 3]);
  });

  it("guarda la primera y la última pieza de cada marca", () => {
    expect(g.marcas[1]).toMatchObject({ primera: "2026-10-06", ultima: "2026-10-14" });
  });

  it("avisa cuántas publicaciones tienen solo el texto recortado", () => {
    expect(g.sinTextoCompleto).toBe(1);
    expect(g.publicaciones).toBe(6);
  });
});

describe("arrobasSinMarca", () => {
  it("lista las arrobas que no son de ninguna marca ni de una cuenta propia", () => {
    const pubs = [
      pub("1", "2026-10-01", "Fans de las papas de @marcopolosnacks y de @spartachile"),
      pub("2", "2026-10-03", "@marcopolosnacks otra vez, con @diegoaaaat"),
      pub("3", "2026-10-02", "@eucerin.latam protegiendo del sol"),
    ];
    expect(arrobasSinMarca(pubs, [SPARTA], ["DiegoAAAAT"])).toEqual([
      { arroba: "marcopolosnacks", publicaciones: 2, ultima: "2026-10-03" },
      { arroba: "eucerin.latam", publicaciones: 1, ultima: "2026-10-02" },
    ]);
  });
});
