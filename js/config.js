/* =====================================================================
   js/config.js — Configuración central (pesos, umbrales, red, fuentes)
   Toda la ponderación del motor de coincidencia se ajusta aquí.
   ===================================================================== */
window.BB = window.BB || {};

BB.CONFIG = {
  // Pesos del motor de coincidencia (se normalizan sobre los campos solicitados)
  pesos: { isbn: 35, titulo: 25, autor: 20, editorial: 12, anio: 8 },

  // Umbrales de clasificación
  umbrales: {
    confirmado: 85,        // puntuación mínima para CONFIRMADO
    probable: 60,          // puntuación mínima para COINCIDENCIA PROBABLE
    minimo: 35,            // por debajo: NO ENCONTRADO
    margenAmbiguedad: 6,   // diferencia de puntos que vuelve ambiguas dos ediciones
    tituloObra: 0.75,      // similitud de título para considerar la misma obra
    autorObra: 0.6,        // similitud de autor para considerar la misma obra
    editorialEdicion: 0.75 // similitud de editorial para considerar la misma edición
  },

  // Control de red para procesamiento masivo
  red: { concurrencia: 3, pausaMs: 300, timeoutMs: 12000, reintentos: 2, backoffMs: 1500 },

  // Fuentes bibliográficas
  fuentes: {
    openLibrary: { activa: true, maxObras: 3, maxEdicionesPorObra: 40 },
    googleBooks: { activa: true, maxResultados: 20, apiKey: '' } // clave opcional, solo en memoria
  },

  // Portadas
  portadas: { timeoutMs: 8000, ladoMinimo: 20, verificarPrimeros: 6 },

  // Exportación
  excel: { anchoImagen: 60, altoImagen: 88, altoFila: 72, concurrenciaImagenes: 4 }
};

BB.ESTADOS = {
  CONFIRMADO: 'CONFIRMADO',
  PROBABLE: 'COINCIDENCIA PROBABLE',
  DIFERENTE: 'EDICIÓN DIFERENTE',
  NO_ENCONTRADO: 'NO ENCONTRADO',
  REVISION: 'REVISIÓN MANUAL',
  PENDIENTE: 'PENDIENTE',
  PROCESANDO: 'PROCESANDO'
};
