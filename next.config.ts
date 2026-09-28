import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  reactCompiler: true,

  experimental: {
    serverActions: {
      /*
       * El tope por defecto son 1 MB, y era la causa de que la página se
       * pusiera en blanco al importar un período largo. Next rechaza el cuerpo
       * ANTES de ejecutar la acción, así que ni el try/catch ni el mensaje de
       * error alcanzaban a correr: la petición moría y la pantalla quedaba
       * vacía sin ninguna explicación.
       *
       * Los archivos ya no se suben —se leen en el navegador y viaja el JSON de
       * las filas, que pesa como un tercio— pero ese JSON igual se pasa del
       * megabyte: medido sobre los exports reales, son unos 1,1 KB por
       * publicación, o sea ~2,6 MB para nueve meses de la cuenta más activa.
       *
       * 8 MB cubre más de dos años de la cuenta más activa. Por encima de eso
       * el formulario avisa antes de mandar nada, en vez de dejar que la
       * petición se caiga.
       */
      bodySizeLimit: "8mb",
    },
  },
};

export default nextConfig;
