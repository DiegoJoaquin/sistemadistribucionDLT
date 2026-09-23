/**
 * Motor de cálculo. Acá viven las reglas de §9 que se rompieron en el Excel.
 * Todo es puro: sin acceso a red ni a base de datos, para poder testearlo.
 *
 * Las filas se agrupan por **cuenta**, y las reglas que dependen de la
 * plataforma (el engagement de YouTube) se resuelven por **red**. Antes las dos
 * cosas eran lo mismo; dejaron de serlo cuando las cuentas pasaron a ser datos.
 */

import { type Categoria } from "./categorias";
import { type Cuenta, denominadorEngagementRed, type Red, tieneAlcanceRed } from "./redes";

/** Fila de registro tal como se necesita para calcular. */
export interface FilaCalculo {
  cuentaId: string;
  /** La red de la cuenta: de ella dependen las reglas, no del nombre. */
  red: Red;
  categoria: Categoria | null;
  publicaciones: number;
  alcance: number | null;
  visualizaciones: number | null;
  interacciones: number | null;
  nuevos_seguidores: number | null;
  visitas_perfil: number | null;
  vistas_seguidores: number | null;
  vistas_no_seguidores: number | null;
}

export type MetricaBase =
  | "alcance"
  | "visualizaciones"
  | "interacciones"
  | "nuevos_seguidores";

export type MetricaPerfil =
  | "visitas_perfil"
  | "vistas_seguidores"
  | "vistas_no_seguidores";

export const METRICAS_DELTA = [
  "alcance",
  "visualizaciones",
  "interacciones",
  "nuevos_seguidores",
] as const satisfies readonly MetricaBase[];

/**
 * §9.1 y §4.2 — LA regla. Los valores del día son promedios POR PUBLICACIÓN,
 * nunca sumas:
 *
 *     promedio_dia = suma(metrica del dia) / suma(publicaciones del dia)
 *
 * §9.4 — sin dato NO es cero: las filas que no traen la métrica quedan fuera
 * del numerador Y del denominador. Si sumáramos sus publicaciones al
 * denominador, el promedio se diluiría hacia abajo inventando ceros.
 *
 * Devuelve null si ninguna fila aporta la métrica (nunca 0).
 */
export function promedioPorPublicacion(
  filas: readonly FilaCalculo[],
  metrica: MetricaBase | MetricaPerfil,
): number | null {
  let suma = 0;
  let publicaciones = 0;
  for (const fila of filas) {
    const valor = fila[metrica];
    if (valor === null || valor === undefined) continue;
    if (!Number.isFinite(fila.publicaciones) || fila.publicaciones <= 0) continue;
    suma += valor;
    publicaciones += fila.publicaciones;
  }
  if (publicaciones === 0) return null;
  return suma / publicaciones;
}

/** Total de publicaciones del conjunto de filas. */
export function totalPublicaciones(filas: readonly FilaCalculo[]): number {
  return filas.reduce(
    (acc, f) => acc + (Number.isFinite(f.publicaciones) ? f.publicaciones : 0),
    0,
  );
}

/**
 * Engagement = interacciones / denominador, como RAZON DE SUMAS.
 *
 * El denominador es alcance, salvo en YouTube que no lo entrega y usa
 * visualizaciones (§9.6). Se calcula como suma/suma y no como promedio de
 * razones por fila: así el engagement del día y el de la línea base se computan
 * igual y el delta entre ambos es una comparación legítima. (El Excel promediaba
 * razones en la base y dividía promedios en el día: dos cosas distintas.)
 */
export function engagement(filas: readonly FilaCalculo[], red: Red): number | null {
  const clave = denominadorEngagementRed(red);
  let interacciones = 0;
  let denominador = 0;
  let hubo = false;
  for (const fila of filas) {
    const d = fila[clave];
    const i = fila.interacciones;
    if (d === null || d === undefined || i === null || i === undefined) continue;
    interacciones += i;
    denominador += d;
    hubo = true;
  }
  if (!hubo || denominador === 0) return null;
  return interacciones / denominador;
}

/**
 * §4.2 — el delta compara promedio del día contra promedio de la línea base:
 *
 *     delta = (promedio_dia - promedio_base) / promedio_base
 *
 * §4.1 — si no hay línea base para esa combinación, devuelve null y la interfaz
 * muestra un guion. NUNCA 0%.
 */
export function delta(
  valorDia: number | null | undefined,
  valorBase: number | null | undefined,
): number | null {
  if (valorDia === null || valorDia === undefined) return null;
  if (valorBase === null || valorBase === undefined) return null;
  if (!Number.isFinite(valorDia) || !Number.isFinite(valorBase)) return null;
  if (valorBase === 0) return null;
  return (valorDia - valorBase) / valorBase;
}

/** alcance / publicaciones (§3.3, campo calculado de una fila individual). */
export function alcancePorPost(fila: FilaCalculo): number | null {
  if (fila.alcance === null || fila.publicaciones <= 0) return null;
  return fila.alcance / fila.publicaciones;
}

/** vistas_no_seguidores / (vistas_seguidores + vistas_no_seguidores) (§3.3). */
export function pctNoSeguidores(
  vistasSeguidores: number | null | undefined,
  vistasNoSeguidores: number | null | undefined,
): number | null {
  if (vistasSeguidores === null || vistasSeguidores === undefined) return null;
  if (vistasNoSeguidores === null || vistasNoSeguidores === undefined) return null;
  const total = vistasSeguidores + vistasNoSeguidores;
  if (total === 0) return null;
  return vistasNoSeguidores / total;
}

/* ------------------------------------------------------------------ */
/* Selección de filas                                                  */
/* ------------------------------------------------------------------ */

/**
 * §9.2 — el TOTAL de una cuenta se calcula sobre TODAS sus filas de la fecha,
 * sin filtrar por categoría. No se suman las categorías entre sí porque en
 * Instagram una publicación aparece tanto en Reactivo/Normal como en
 * Imagen/Reel/Carrusel y se contaría dos veces (§3.2).
 */
export function filasDeCuenta(
  filas: readonly FilaCalculo[],
  cuentaId: string,
): FilaCalculo[] {
  return filas.filter((f) => f.cuentaId === cuentaId);
}

export function filasDeCategoria(
  filas: readonly FilaCalculo[],
  cuentaId: string,
  categoria: Categoria,
): FilaCalculo[] {
  return filas.filter((f) => f.cuentaId === cuentaId && f.categoria === categoria);
}

/* ------------------------------------------------------------------ */
/* Armado de una línea del panel diario                                */
/* ------------------------------------------------------------------ */

/** Promedios por publicación de una línea de la línea base mensual. */
export interface PromediosBase {
  n_publicaciones: number;
  alcance_prom: number | null;
  visualizaciones_prom: number | null;
  interacciones_prom: number | null;
  nuevos_seguidores_prom: number | null;
  engagement_prom: number | null;
}

export interface LineaPanel {
  cuenta: Cuenta;
  /** null = fila TOTAL de la cuenta. */
  categoria: Categoria | null;
  etiqueta: string;
  publicaciones: number;
  /** true si no hay ninguna fila registrada para esta combinación. */
  sinDatos: boolean;
  dia: {
    alcance: number | null;
    visualizaciones: number | null;
    interacciones: number | null;
    nuevos_seguidores: number | null;
    engagement: number | null;
  };
  base: PromediosBase | null;
  deltas: {
    alcance: number | null;
    visualizaciones: number | null;
    interacciones: number | null;
    nuevos_seguidores: number | null;
    engagement: number | null;
  };
  /** §9.6 — el engagement de YouTube no es comparable con el de otras redes. */
  engagementNoComparable: boolean;
}

export function construirLinea(
  filas: readonly FilaCalculo[],
  cuenta: Cuenta,
  categoria: Categoria | null,
  base: PromediosBase | null,
): LineaPanel {
  const seleccion =
    categoria === null
      ? filasDeCuenta(filas, cuenta.id)
      : filasDeCategoria(filas, cuenta.id, categoria);

  const dia = {
    alcance: promedioPorPublicacion(seleccion, "alcance"),
    visualizaciones: promedioPorPublicacion(seleccion, "visualizaciones"),
    interacciones: promedioPorPublicacion(seleccion, "interacciones"),
    nuevos_seguidores: promedioPorPublicacion(seleccion, "nuevos_seguidores"),
    engagement: engagement(seleccion, cuenta.red),
  };

  return {
    cuenta,
    categoria,
    etiqueta: categoria ?? "TOTAL",
    publicaciones: totalPublicaciones(seleccion),
    sinDatos: seleccion.length === 0,
    dia,
    base,
    deltas: {
      alcance: delta(dia.alcance, base?.alcance_prom),
      visualizaciones: delta(dia.visualizaciones, base?.visualizaciones_prom),
      interacciones: delta(dia.interacciones, base?.interacciones_prom),
      nuevos_seguidores: delta(dia.nuevos_seguidores, base?.nuevos_seguidores_prom),
      engagement: delta(dia.engagement, base?.engagement_prom),
    },
    engagementNoComparable: !tieneAlcanceRed(cuenta.red),
  };
}

/* ------------------------------------------------------------------ */
/* Métricas de perfil (§4.3)                                           */
/* ------------------------------------------------------------------ */

export interface LineaPerfil {
  /** null = fila TOTAL de todas las cuentas. */
  cuenta: Cuenta | null;
  etiqueta: string;
  publicaciones: number;
  visitas_perfil: number | null;
  vistas_seguidores: number | null;
  vistas_no_seguidores: number | null;
  pct_no_seguidores: number | null;
  sinDatos: boolean;
}

/**
 * §4.3 y §9.7 — promedios por publicación del día, SIN columnas de variación:
 * estas tres métricas se ingresan a mano y todavía no existe línea base
 * histórica para ellas.
 */
export function construirLineaPerfil(
  filas: readonly FilaCalculo[],
  cuenta: Cuenta | null,
): LineaPerfil {
  const seleccion = cuenta === null ? [...filas] : filasDeCuenta(filas, cuenta.id);

  const visitas = promedioPorPublicacion(seleccion, "visitas_perfil");
  const seguidores = promedioPorPublicacion(seleccion, "vistas_seguidores");
  const noSeguidores = promedioPorPublicacion(seleccion, "vistas_no_seguidores");

  return {
    cuenta,
    etiqueta: cuenta?.nombre ?? "TOTAL",
    publicaciones: totalPublicaciones(seleccion),
    visitas_perfil: visitas,
    vistas_seguidores: seguidores,
    vistas_no_seguidores: noSeguidores,
    pct_no_seguidores: pctNoSeguidores(seguidores, noSeguidores),
    sinDatos: visitas === null && seguidores === null && noSeguidores === null,
  };
}
