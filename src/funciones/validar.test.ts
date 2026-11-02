import { describe, expect, it } from 'vitest';
import { accesoSimulado } from '../../test/apoyo.js';
import { metadataSimulada, T } from '../../test/funciones-apoyo.js';
import type { Fila, ValorParametro } from '../db/firebird.js';
import { esquemaArchivoFunciones } from './esquema.js';
import { proceduresDeSsql, SQL_ESCRIBE_USER_SESSION, validarContraBase } from './validar.js';
import { SQL_METODO, SQL_PARAMETROS_METODO } from './webservice.js';

const archivo = (tools: unknown[]) => esquemaArchivoFunciones.parse({ servidor: { nombre: 's', claimRequerida: 'COD_VENDEDOR' }, tools });

function base(escribenContexto: string[] = []) {
  const metadata = metadataSimulada({ P_OK: { entradas: ['A'], salidas: { X: T.INTEGER } }, P_CTX: { salidas: { X: T.INTEGER } } });
  const sql = (s: string, p: ValorParametro[]): Fila[] | undefined => {
    if (s === SQL_ESCRIBE_USER_SESSION) return escribenContexto.includes(String(p[0])) ? [{ SI: 1 }] : [];
    if (s === SQL_METODO) return p[0] === 'wsOk' ? [{ COD_METODO_WEBSERVICE: 1, TIPO: 'EXECUTE_PROCEDURE', SSQL: 'EXECUTE PROCEDURE P_CTX(@A)', COD_CATEGORIA_WEBSERVICE: 1 }] : [];
    if (s === SQL_PARAMETROS_METODO) return [{ NOMBRE: 'A', TIPO: 'Integer', LONGITUD: 0 }];
    return metadata(s, p);
  };
  return accesoSimulado({}, null, { contratoResultado: false, sql }).acceso;
}

const validar = (tools: unknown[], escribenContexto?: string[]) =>
  base(escribenContexto).enTransaccionConContexto({ contexto: {}, escritura: false }, (ejecutarSql) => validarContraBase(archivo(tools), ejecutarSql));

describe('validar-funciones', () => {
  it('informa todos los problemas juntos: procedure y método inexistentes, parámetros de más', async () => {
    const reporte = await validar([
      { tipo: 'procedure', nombre: 'no_existe', procedure: 'PROC_NO_EXISTE', descripcion: 'x' },
      { tipo: 'procedure', nombre: 'de_mas', procedure: 'P_OK', descripcion: 'x', parametros: [{ nombre: 'Z', tipo: 'entero' }] },
      { tipo: 'webservice', nombre: 'ws_no', metodo: 'noExiste', descripcion: 'x' },
      { tipo: 'webservice', nombre: 'ws_de_mas', metodo: 'wsOk', descripcion: 'x', escritura: true, parametros: [{ nombre: 'B', tipo: 'entero' }] },
      { tipo: 'procedure', nombre: 'bien', procedure: 'P_OK', descripcion: 'x', parametros: [{ nombre: 'A', tipo: 'entero' }] },
    ]);
    expect(reporte.problemas).toEqual([
      expect.stringMatching(/'no_existe'.*PROC_NO_EXISTE/),
      expect.stringMatching(/'de_mas'.*P_OK no tiene Z/),
      expect.stringMatching(/'ws_no'.*noExiste/),
      expect.stringMatching(/'ws_de_mas'.*wsOk no tiene B.*acepta: A/),
    ]);
  });

  it('advierte procedures que escriben USER_SESSION sin conexionExclusiva y EXECUTE sin escritura', async () => {
    const reporte = await validar(
      [
        { tipo: 'procedure', nombre: 'con_contexto', procedure: 'P_CTX', descripcion: 'x' },
        { tipo: 'procedure', nombre: 'exclusiva', procedure: 'P_CTX', descripcion: 'x', conexionExclusiva: true },
        { tipo: 'webservice', nombre: 'ws', metodo: 'wsOk', descripcion: 'x', parametros: [{ nombre: 'A', tipo: 'entero' }] },
      ],
      ['P_CTX'],
    );
    expect(reporte.problemas).toEqual([]);
    expect(reporte.advertencias).toEqual([
      expect.stringMatching(/'con_contexto'.*P_CTX.*conexionExclusiva/),
      expect.stringMatching(/'ws'.*EXECUTE_PROCEDURE.*escritura/),
      expect.stringMatching(/'ws'.*P_CTX.*conexionExclusiva/),
    ]);
  });

  it('extrae los procedures de un SSQL', () => {
    expect(proceduresDeSsql('SELECT * FROM PROC_A(@X) a JOIN PROC_B(1) b ON 1=1')).toEqual(['PROC_A', 'PROC_B']);
    expect(proceduresDeSsql('EXECUTE PROCEDURE ACT_X(\n @FILTRO\n)')).toEqual(['ACT_X']);
  });
});
