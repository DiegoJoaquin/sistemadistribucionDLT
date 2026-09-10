/**
 * Formato de números y escala de color de los deltas.
 *
 * §8: números en fuente tabular, formato chileno (miles con punto, decimales
 * con coma), y los deltas como elemento visual protagonista.
 */

const LOCALE = "es-CL";

const fEntero = new Intl.NumberFormat(LOCALE, { maximumFractionDigits: 0 });
const fUnDecimal = new Intl.NumberFormat(LOCALE, {
  minimumFractionDigits: 1,
  maximumFractionDigits: 1,
});

/** §9.4 — sin dato se muestra como guion, nunca como 0. */
export const GUION = "—";

export function numero(v: number | null | undefined): string {
  if (v === null || v === undefined || !Number.isFinite(v)) return GUION;
  return fEntero.format(Math.round(v));
}

/** Para promedios chicos (ej. 10,2 seguidores por publicación). */
export function numeroFino(v: number | null | undefined): string {
  if (v === null || v === undefined || !Number.isFinite(v)) return GUION;
  if (Math.abs(v) >= 100) return fEntero.format(Math.round(v));
  return fUnDecimal.format(v);
}

/** Porcentaje absoluto, como el engagement: 9,6% */
export function porcentaje(v: number | null | undefined, decimales = 1): string {
  if (v === null || v === undefined || !Number.isFinite(v)) return GUION;
  return (
    new Intl.NumberFormat(LOCALE, {
      minimumFractionDigits: decimales,
      maximumFractionDigits: decimales,
    }).format(v * 100) + "%"
  );
}

/** Delta con signo explícito: +31,6% / -77,7% */
export function porcentajeDelta(v: number | null | undefined, decimales = 1): string {
  if (v === null || v === undefined || !Number.isFinite(v)) return GUION;
  const signo = v > 0 ? "+" : "";
  return (
    signo +
    new Intl.NumberFormat(LOCALE, {
      minimumFractionDigits: decimales,
      maximumFractionDigits: decimales,
    }).format(v * 100) +
    "%"
  );
}

/**
 * Limpia la salida de Intl para que el servidor y el navegador produzcan
 * exactamente el mismo texto.
 *
 * Dos motivos, y los dos causaban errores de hidratación:
 *  - Las versiones de ICU de Node y del navegador no coinciden: unas separan
 *    con espacio fino sin salto (U+202F) y otras con espacio normal. El texto
 *    se ve idéntico en pantalla y React igual lo marca como diferente.
 *  - Nunca se usa formato de 12 horas, así no aparece el "a. m." que es
 *    justamente donde vive ese espacio.
 */
const mismoTexto = (s: string) => s.replace(/[  ]/g, " ");

/*
 * Las fechas sin hora se construyen como medianoche UTC, así que hay que
 * formatearlas en UTC. Sin eso, en Chile (UTC-3/-4) el 10 de septiembre se
 * mostraría como 9 de septiembre.
 */
const EN_UTC = { timeZone: "UTC" } as const;

export function fechaLarga(iso: string): string {
  const [a, m, d] = iso.split("-").map(Number);
  return mismoTexto(
    new Intl.DateTimeFormat(LOCALE, {
      ...EN_UTC,
      weekday: "long",
      day: "numeric",
      month: "long",
      year: "numeric",
    }).format(new Date(Date.UTC(a, m - 1, d))),
  );
}

export function fechaCorta(iso: string): string {
  const [a, m, d] = iso.split("-").map(Number);
  return mismoTexto(
    new Intl.DateTimeFormat(LOCALE, {
      ...EN_UTC,
      day: "2-digit",
      month: "2-digit",
      year: "numeric",
    }).format(new Date(Date.UTC(a, m - 1, d))),
  );
}

export function diaSemana(iso: string): string {
  const [a, m, d] = iso.split("-").map(Number);
  const texto = mismoTexto(
    new Intl.DateTimeFormat(LOCALE, { ...EN_UTC, weekday: "long" }).format(
      new Date(Date.UTC(a, m - 1, d)),
    ),
  );
  return texto.charAt(0).toUpperCase() + texto.slice(1);
}

export function mesLargo(iso: string): string {
  const [a, m] = iso.split("-").map(Number);
  const texto = mismoTexto(
    new Intl.DateTimeFormat(LOCALE, {
      ...EN_UTC,
      month: "long",
      year: "numeric",
    }).format(new Date(Date.UTC(a, m - 1, 1))),
  );
  return texto.charAt(0).toUpperCase() + texto.slice(1);
}

/*
 * Los timestamps sí llevan zona (vienen de `timestamptz`), y va explícita: sin
 * ella el servidor formatea en UTC y el navegador en la hora del usuario, que
 * es otra fuente de error de hidratación además de mostrar una hora equivocada.
 */
export function horaCorta(iso: string): string {
  return mismoTexto(
    new Intl.DateTimeFormat(LOCALE, {
      timeZone: ZONA,
      hour: "2-digit",
      minute: "2-digit",
      hour12: false,
    }).format(new Date(iso)),
  );
}

export function fechaHoraCorta(iso: string): string {
  return mismoTexto(
    new Intl.DateTimeFormat(LOCALE, {
      timeZone: ZONA,
      day: "2-digit",
      month: "2-digit",
      hour: "2-digit",
      minute: "2-digit",
      hour12: false,
    }).format(new Date(iso)),
  );
}

export const ZONA = "America/Santiago";

/**
 * Fecha de hoy en Santiago, formato YYYY-MM-DD.
 *
 * Va anclada a la zona a propósito: en Vercel el servidor corre en UTC, y a
 * partir de las 21:00 en Chile "hoy" ya sería el día siguiente. El equipo
 * carga de noche, así que sin esto la mitad de los registros caerían al día
 * equivocado.
 */
export function hoyISO(): string {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: ZONA,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(new Date());
}

/** Mes actual en Santiago, formato YYYY-MM. */
export function mesActualISO(): string {
  return hoyISO().slice(0, 7);
}

/**
 * ¿Cae la fecha dentro del rango? Los tres son "YYYY-MM-DD".
 *
 * La comparación es de texto a propósito: en formato ISO el orden alfabético
 * coincide con el cronológico, así que no hace falta construir objetos Date ni
 * arrastrar sus problemas de zona horaria.
 */
export function estaEnRango(fecha: string, desde: string, hasta: string): boolean {
  return fecha >= desde && fecha <= hasta;
}

export function sumarDias(iso: string, dias: number): string {
  const [a, m, d] = iso.split("-").map(Number);
  const fecha = new Date(Date.UTC(a, m - 1, d));
  fecha.setUTCDate(fecha.getUTCDate() + dias);
  const p = (n: number) => String(n).padStart(2, "0");
  return `${fecha.getUTCFullYear()}-${p(fecha.getUTCMonth() + 1)}-${p(fecha.getUTCDate())}`;
}

/* ------------------------------------------------------------------ */
/* Escala de color de los deltas                                       */
/* ------------------------------------------------------------------ */

/**
 * §4.1 — escala CONTINUA, no semáforo de tres pasos:
 *   verde intenso sobre +50% · verde suave 0 a +50% · gris cerca de 0 ·
 *   rojo suave 0 a -50% · rojo intenso bajo -50%
 *
 * La intensidad crece linealmente hasta ±50% y satura ahí, así un -77% y un
 * -320% se leen ambos como "muy malo" sin que el color se desborde.
 */
export function intensidadDelta(d: number | null): number {
  if (d === null || !Number.isFinite(d)) return 0;
  return Math.min(Math.abs(d) / 0.5, 1);
}

const HUE_VERDE = 150;
const HUE_ROJO = 27;

interface ColoresDelta {
  fondo: string;
  texto: string;
  borde: string;
  barra: string;
  /** 0 a 1: ancho de la micro-barra de magnitud. */
  magnitud: number;
  positivo: boolean;
}

const NEUTRO: ColoresDelta = {
  fondo: "oklch(0.968 0.003 250)",
  texto: "oklch(0.55 0.015 250)",
  borde: "oklch(0.92 0.005 250)",
  barra: "oklch(0.85 0.008 250)",
  magnitud: 0,
  positivo: true,
};

const lerp = (a: number, b: number, t: number) => a + (b - a) * t;

/** Colores del badge de delta. Devuelve gris neutro si el delta es null. */
export function coloresDelta(d: number | null): ColoresDelta {
  if (d === null || !Number.isFinite(d)) return NEUTRO;

  const m = intensidadDelta(d);
  const positivo = d >= 0;
  const hue = positivo ? HUE_VERDE : HUE_ROJO;

  // De gris casi puro (m=0) a color pleno (m=1).
  return {
    fondo: `oklch(${lerp(0.968, 0.912, m).toFixed(3)} ${lerp(0.003, 0.105, m).toFixed(3)} ${hue})`,
    texto: `oklch(${lerp(0.55, 0.4, m).toFixed(3)} ${lerp(0.015, 0.15, m).toFixed(3)} ${hue})`,
    borde: `oklch(${lerp(0.92, 0.83, m).toFixed(3)} ${lerp(0.005, 0.12, m).toFixed(3)} ${hue})`,
    barra: `oklch(${lerp(0.85, 0.62, m).toFixed(3)} ${lerp(0.008, 0.17, m).toFixed(3)} ${hue})`,
    magnitud: m,
    positivo,
  };
}

/* ------------------------------------------------------------------ */
/* Variante hexadecimal, para el correo                                */
/* ------------------------------------------------------------------ */

const hex = (n: number) => Math.round(Math.min(255, Math.max(0, n))).toString(16).padStart(2, "0");
const mezcla = (a: [number, number, number], b: [number, number, number], t: number) =>
  `#${hex(lerp(a[0], b[0], t))}${hex(lerp(a[1], b[1], t))}${hex(lerp(a[2], b[2], t))}`;

const GRIS_FONDO: [number, number, number] = [244, 244, 243];
const GRIS_TEXTO: [number, number, number] = [110, 110, 104];
const VERDE_FONDO: [number, number, number] = [214, 240, 224];
const VERDE_TEXTO: [number, number, number] = [21, 105, 63];
const ROJO_FONDO: [number, number, number] = [250, 222, 216];
const ROJO_TEXTO: [number, number, number] = [153, 45, 28];

/**
 * Misma escala continua que en pantalla, pero en hexadecimal: los clientes de
 * correo no entienden oklch() y lo renderizarían como texto negro sobre blanco.
 */
export function coloresDeltaHex(d: number | null): { fondo: string; texto: string } {
  if (d === null || !Number.isFinite(d)) {
    return { fondo: "#f4f4f3", texto: "#8a8a82" };
  }
  const m = intensidadDelta(d);
  const positivo = d >= 0;
  return {
    fondo: mezcla(GRIS_FONDO, positivo ? VERDE_FONDO : ROJO_FONDO, m),
    texto: mezcla(GRIS_TEXTO, positivo ? VERDE_TEXTO : ROJO_TEXTO, m),
  };
}
