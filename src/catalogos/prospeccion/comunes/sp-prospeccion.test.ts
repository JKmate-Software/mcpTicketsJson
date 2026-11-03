import { describe, expect, it } from 'vitest';
import { parametrosProspeccion } from './sp-prospeccion.js';
import { P } from '../../../../test/datos/prospeccion-registro.js';

describe('parámetros de MM_PROC_SET_PROSPECCION_MOVILB2', () => {
  it('36 parámetros, en el orden de la firma, con NULL en lo que no se expone', () => {
    const p = parametrosProspeccion(874, 12, { codProspecto: 3, apellido: 'PEREZ', nombre: 'ANA', montoCotizacion: 1500.6 });
    expect(p).toHaveLength(36);
    expect(p[P.COD_USUARIO]).toBe(874);
    expect(p[P.COD_VENDEDOR]).toBe(12);
    expect(p[P.COD_PROSPECTO]).toBe(3);
    expect(p[P.APELLIDO_SOLO]).toBe('PEREZ');
    expect(p[P.NOMBRE_SOLO]).toBe('ANA');
    expect(p[P.MONTO_COTIZACION]).toBe(1501);
    for (const nulo of [P.COD_CLIENTE_SQLITE, P.COD_RECLAMO_SQLITE, P.APELLIDO_MATERNO, P.GEO_X, P.GEO_Y, P.CUIT]) expect(p[nulo]).toBeNull();
  });
});
