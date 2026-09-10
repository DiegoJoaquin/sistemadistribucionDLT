/**
 * Utilidades compartidas por los importadores: fechas, números y hashtags.
 *
 * Las fechas se manejan como texto naive "YYYY-MM-DDTHH:mm:ss", sin zona
 * horaria. Es a propósito: lo que importa es la hora que muestra la plataforma.
 * Convertir a UTC y de vuelta movería publicaciones de día (y de mes, en los
 * bordes) sin ninguna ganancia.
 */

const p2 = (n: number) => String(n).padStart(2, "0");

export function naive(
  a: number,
  m: number,
  d: number,
  h = 0,
  mi = 0,
  s = 0,
): string {
  return `${a}-${p2(m)}-${p2(d)}T${p2(h)}:${p2(mi)}:${p2(s)}`;
}

/** "YYYY-MM" de un naive. */
export function mesDe(naiveISO: string): string {
  return naiveISO.slice(0, 7);
}

/** "YYYY-MM-DD" de un naive. */
export function fechaDe(naiveISO: string): string {
  return naiveISO.slice(0, 10);
}

/**
 * Normaliza a naive "YYYY-MM-DDTHH:mm:ss" algo que puede venir de dos lados:
 * de los lectores de archivos (ya es texto naive) o de la base de datos, donde
 * según el driver un `timestamp` llega como texto o como objeto Date.
 *
 * Si trae zona horaria (una Z al final o un ±HH:MM), se descarta: la columna es
 * `timestamp without time zone` y el valor ya está en la hora de la plataforma.
 */
export function aNaive(v: unknown): string | null {
  if (v === null || v === undefined) return null;

  if (v instanceof Date) {
    return Number.isNaN(v.getTime()) ? null : desdeCeldaExcel(v);
  }

  if (typeof v === "string") {
    const t = v.trim();
    if (!t) return null;
    const m = t.match(/^(\d{4})-(\d{2})-(\d{2})[ T](\d{2}):(\d{2})(?::(\d{2}))?/);
    if (!m) return null;
    return naive(
      Number(m[1]),
      Number(m[2]),
      Number(m[3]),
      Number(m[4]),
      Number(m[5]),
      Number(m[6] ?? 0),
    );
  }

  return null;
}

/** Minutos desde epoch de un naive, para comparar y ordenar sin objetos Date. */
export function minutosNaive(naiveISO: string): number {
  const a = Number(naiveISO.slice(0, 4));
  const m = Number(naiveISO.slice(5, 7));
  const d = Number(naiveISO.slice(8, 10));
  const h = Number(naiveISO.slice(11, 13));
  const mi = Number(naiveISO.slice(14, 16));
  return Date.UTC(a, m - 1, d, h, mi) / 60_000;
}

/** Suma horas a un naive y devuelve otro naive. */
export function sumarHorasNaive(naiveISO: string, horas: number): string {
  const ms = minutosNaive(naiveISO) * 60_000 + horas * 3_600_000;
  const f = new Date(ms);
  return naive(
    f.getUTCFullYear(),
    f.getUTCMonth() + 1,
    f.getUTCDate(),
    f.getUTCHours(),
    f.getUTCMinutes(),
  );
}

/**
 * Fecha de una celda de Excel. SheetJS con `cellDates: true` devuelve un Date
 * construido en hora local, así que se leen los componentes locales.
 */
export function desdeCeldaExcel(v: unknown): string | null {
  if (v instanceof Date && !Number.isNaN(v.getTime())) {
    return naive(
      v.getFullYear(),
      v.getMonth() + 1,
      v.getDate(),
      v.getHours(),
      v.getMinutes(),
      v.getSeconds(),
    );
  }
  return null;
}

export type OrdenFecha = "DMY" | "MDY";

/**
 * Parsea "31/08/2026 23:59:02" o "08/01/2026 07:51".
 *
 * El orden va explícito porque los exportadores no coinciden: YouTube entrega
 * DD/MM/YYYY y Meta Business Suite MM/DD/YYYY. Adivinarlo produciría un
 * silencioso cambio de día para todo lo anterior al día 13.
 */
export function desdeTextoFecha(v: unknown, orden: OrdenFecha): string | null {
  if (typeof v !== "string") return null;
  const t = v.trim();
  if (!t) return null;

  const m = t.match(
    /^(\d{1,4})[/-](\d{1,2})[/-](\d{2,4})(?:[ T](\d{1,2}):(\d{2})(?::(\d{2}))?)?$/,
  );
  if (!m) return null;

  const [, a1, a2, a3, hh, mm, ss] = m;

  // Formato ISO "2026-08-31 23:59:02"
  if (a1.length === 4) {
    return naive(
      Number(a1),
      Number(a2),
      Number(a3),
      Number(hh ?? 0),
      Number(mm ?? 0),
      Number(ss ?? 0),
    );
  }

  const dia = orden === "DMY" ? Number(a1) : Number(a2);
  const mes = orden === "DMY" ? Number(a2) : Number(a1);
  let anio = Number(a3);
  if (anio < 100) anio += 2000;

  if (mes < 1 || mes > 12 || dia < 1 || dia > 31) return null;

  return naive(anio, mes, dia, Number(hh ?? 0), Number(mm ?? 0), Number(ss ?? 0));
}

/** Fecha de una celda que puede venir como Date o como texto. */
export function fechaDeCelda(v: unknown, orden: OrdenFecha): string | null {
  return desdeCeldaExcel(v) ?? desdeTextoFecha(v, orden);
}

/**
 * Número de una celda. §9.4: vacío, guion o texto no numérico devuelven null,
 * jamás 0. Un "0" explícito sí es 0.
 */
export function num(v: unknown): number | null {
  if (v === null || v === undefined) return null;
  if (typeof v === "number") return Number.isFinite(v) ? v : null;
  if (typeof v === "string") {
    const t = v.trim();
    if (t === "" || t === "-" || t === "—" || t === "N/A") return null;
    // Miles con punto o coma y decimal con coma: "1.234" / "1.234,5"
    const limpio = t.replace(/\s/g, "").replace(/\.(?=\d{3}\b)/g, "").replace(",", ".");
    const n = Number(limpio);
    return Number.isFinite(n) ? n : null;
  }
  return null;
}

/** Suma tratando null como ausente; devuelve null si TODOS son null (§9.4). */
export function sumaOpcional(...valores: (number | null)[]): number | null {
  let total = 0;
  let hubo = false;
  for (const v of valores) {
    if (v === null) continue;
    total += v;
    hubo = true;
  }
  return hubo ? total : null;
}

export function texto(v: unknown): string | null {
  if (v === null || v === undefined) return null;
  const t = String(v).trim();
  return t === "" ? null : t;
}

/** Quita tildes y pasa a mayúsculas, para comparar sin sorpresas. */
export function normalizar(s: string): string {
  return s
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toUpperCase();
}

/**
 * Primer hashtag del caption, sin el "#" y normalizado.
 * Devuelve null si el caption no tiene ninguno.
 */
export function primerHashtag(caption: string | null): string | null {
  if (!caption) return null;
  const m = caption.match(/#([\p{L}\p{N}_]+)/u);
  if (!m) return null;
  return normalizar(m[1]);
}
