import { describe, expect, it } from "vitest";
import {
  fechaCorta,
  fechaHoraCorta,
  fechaLarga,
  horaCorta,
  mesLargo,
  numero,
  porcentaje,
  porcentajeDelta,
  coloresDelta,
  estaEnRango,
  GUION,
  intensidadDelta,
} from "./formato";

/**
 * El error de hidratación venía de acá: el servidor y el navegador usan
 * versiones distintas de ICU, y una separa el "a. m." con espacio fino sin
 * salto (U+202F) mientras la otra usa un espacio normal. El texto se ve
 * idéntico y React igual descarta el árbol.
 */
describe("las fechas se formatean igual en el servidor y en el navegador", () => {
  const ESPACIOS_RAROS = /[  ]/;

  it("no deja espacios especiales en ninguna salida", () => {
    const salidas = [
      fechaCorta("2026-09-10"),
      fechaLarga("2026-09-10"),
      mesLargo("2026-08-01"),
      horaCorta("2026-09-10T13:04:22.000Z"),
      fechaHoraCorta("2026-09-10T13:04:22.000Z"),
    ];
    for (const s of salidas) {
      expect(s, `"${s}" trae un espacio especial`).not.toMatch(ESPACIOS_RAROS);
    }
  });

  it("usa formato de 24 horas, así no aparece el a. m. que causaba el problema", () => {
    expect(horaCorta("2026-09-10T13:04:22.000Z")).not.toMatch(/m\./);
    expect(fechaHoraCorta("2026-09-10T23:30:00.000Z")).not.toMatch(/m\./);
  });
});

describe("las fechas sin hora no se corren de día", () => {
  it("muestra el 10 de septiembre como 10, no como 9", () => {
    // Se construyen como medianoche UTC: sin formatear en UTC, en Chile
    // (UTC-3/-4) esto mostraría el día anterior.
    expect(fechaCorta("2026-09-10")).toBe("10-09-2026");
    expect(fechaCorta("2026-01-01")).toBe("01-01-2026");
  });

  it("mantiene el mes correcto en el primer día", () => {
    expect(mesLargo("2026-08-01")).toBe("Agosto de 2026");
    expect(mesLargo("2026-01-01")).toBe("Enero de 2026");
  });

  it("da el día de la semana correcto", () => {
    // El 10 de septiembre de 2026 fue jueves.
    expect(fechaLarga("2026-09-10")).toMatch(/jueves/i);
  });
});

/**
 * Es lo que decide si avisar "guardado, pero quedó fuera del rango que estás
 * viendo". Sin ese aviso, guardar en otra fecha se veía como si no hubiera
 * guardado nada.
 */
describe("estaEnRango", () => {
  it("incluye los dos extremos", () => {
    expect(estaEnRango("2026-09-10", "2026-09-10", "2026-09-10")).toBe(true);
    expect(estaEnRango("2026-09-01", "2026-09-01", "2026-09-30")).toBe(true);
    expect(estaEnRango("2026-09-30", "2026-09-01", "2026-09-30")).toBe(true);
  });

  it("deja fuera lo anterior y lo posterior", () => {
    expect(estaEnRango("2026-08-31", "2026-09-01", "2026-09-30")).toBe(false);
    expect(estaEnRango("2026-10-01", "2026-09-01", "2026-09-30")).toBe(false);
  });

  it("compara cronológicamente aunque sea comparación de texto", () => {
    // El caso que rompería una comparación alfabética ingenua sin ceros: el 9
    // de septiembre es anterior al 10, y "09" < "10" también.
    expect(estaEnRango("2026-09-09", "2026-09-10", "2026-09-20")).toBe(false);
    expect(estaEnRango("2026-09-15", "2026-09-10", "2026-09-20")).toBe(true);
    // Cruce de año y de mes.
    expect(estaEnRango("2025-12-31", "2026-01-01", "2026-01-31")).toBe(false);
    expect(estaEnRango("2026-02-01", "2026-01-01", "2026-01-31")).toBe(false);
  });
});

describe("formato chileno de números", () => {
  it("usa punto para los miles", () => {
    expect(numero(58_095)).toBe("58.095");
    expect(numero(108_991)).toBe("108.991");
  });

  it("usa coma para los decimales", () => {
    expect(porcentaje(0.096)).toBe("9,6%");
    expect(porcentajeDelta(-0.39)).toBe("-39,0%");
    expect(porcentajeDelta(0.344)).toBe("+34,4%");
  });

  it("§9.4 — sin dato muestra guion, nunca 0", () => {
    expect(numero(null)).toBe(GUION);
    expect(porcentaje(null)).toBe(GUION);
    expect(porcentajeDelta(null)).toBe(GUION);
    expect(numero(0)).toBe("0"); // un cero real sí se muestra
  });
});

describe("§4.1 — la escala de color de los deltas es continua", () => {
  it("es gris neutro cerca de cero", () => {
    expect(intensidadDelta(0.01)).toBeLessThan(0.05);
  });

  it("crece de forma gradual, no en tres saltos", () => {
    const puntos = [0.05, 0.15, 0.25, 0.35, 0.45].map(intensidadDelta);
    for (let i = 1; i < puntos.length; i++) {
      expect(puntos[i]).toBeGreaterThan(puntos[i - 1]);
    }
  });

  it("satura en ±50% para que un -77% y un -320% se lean igual de mal", () => {
    expect(intensidadDelta(-0.5)).toBe(1);
    expect(intensidadDelta(-0.777)).toBe(1);
    expect(intensidadDelta(-3.2)).toBe(1);
  });

  it("distingue el signo", () => {
    expect(coloresDelta(0.6).positivo).toBe(true);
    expect(coloresDelta(-0.6).positivo).toBe(false);
  });

  it("un delta ausente queda neutro, sin magnitud", () => {
    const c = coloresDelta(null);
    expect(c.magnitud).toBe(0);
  });
});
