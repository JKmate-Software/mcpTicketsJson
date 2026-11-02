import { z } from 'zod';
import { ANOTACIONES_LECTURA, esquemaJson } from '../nucleo/esquema-json.js';
import type { HandlerCompleja } from '../funciones/tipos.js';

const sinParametros = z.object({}).strict();

const salidaInstrucciones = z.object({ instrucciones: z.string() });

/**
 * Devuelve el contenido de `servidor.instrucciones`. Por defecto van solo por esta tool y no por el
 * handshake (decisión de la v1: los agentes no las tomaban); ver `instruccionesEnHandshake`.
 */
export const handler: HandlerCompleja = {
  requiereInstrucciones: true,
  crear: ({ instrucciones }) => ({
    inputSchema: esquemaJson(sinParametros, 'input'),
    outputSchema: esquemaJson(salidaInstrucciones, 'output'),
    annotations: ANOTACIONES_LECTURA,
    entrada: sinParametros,
    async ejecutar() {
      return { datos: { instrucciones: instrucciones ?? '' }, resumen: instrucciones ?? '' };
    },
  }),
};
