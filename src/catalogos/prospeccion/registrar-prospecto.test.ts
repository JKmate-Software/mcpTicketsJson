import { describe, expect, it } from 'vitest';
import { CODIGOS, invocar, P } from '../../../test/datos/prospeccion-registro.js';

describe('registrar_prospecto', () => {
  const ALTA = { apellido: 'TEST-MCP', nombre: 'Prueba', ...CODIGOS };

  it('alta sin contacto: PARAMETRO_INVALIDO y no escribe nada', async () => {
    const { datos, llamadas } = await invocar('registrar_prospecto', ALTA);
    expect(datos.error?.codigo).toBe('PARAMETRO_INVALIDO');
    expect(JSON.stringify(datos.error)).toContain('al menos un dato de contacto');
    expect(llamadas).toHaveLength(0);
  });

  it('alta exitosa con celular', async () => {
    const { datos, parametros } = await invocar('registrar_prospecto', { ...ALTA, telefonoMovil: '3515550000', fechaNacimiento: '1990-05-20' });
    expect(datos.codProspectacionMovil).toBe(991);
    expect(parametros[P.COD_PROSPECTO]).toBeNull();
    expect(parametros[P.COD_CLIENTE_FIREBIRD]).toBeNull();
    expect(parametros[P.TELEFONO_MOVIL]).toBe('3515550000');
    expect(parametros[P.FECHA_NACIMIENTO]).toBe('1990-05-20');
    expect(parametros[P.APELLIDO_SOLO]).toBe('TEST-MCP');
  });

  it('respeta los largos del procedure', async () => {
    const { datos } = await invocar('registrar_prospecto', { ...ALTA, email: 'x'.repeat(51) });
    expect(datos.error?.codigo).toBe('PARAMETRO_INVALIDO');
  });
});
