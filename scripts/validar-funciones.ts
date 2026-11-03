/**
 * Verifica el archivo de funciones del catálogo configurado contra la base (`npm run validar-funciones`):
 * estructura, handlers y, para cada tool procedure/webservice, que existan el procedure o el método y
 * sus parámetros. Informa todos los problemas juntos y no ejecuta ninguna tool.
 * Usa MCP_CATALOGO (o MCP_FUNCIONES_ARCHIVO) y FIREBIRD_* del .env.
 */
import { CacheCatalogos } from '../src/busqueda/catalogo.js';
import { cargarCatalogo } from '../src/funciones/catalogo.js';
import { cargarConfig, rutaArchivoFunciones } from '../src/config.js';
import { crearAccesoFirebird } from '../src/db/firebird.js';
import { leerArchivoFunciones } from '../src/funciones/cargar.js';
import { importarCompletarSesion, importarHandler, mcpDeArchivo } from '../src/funciones/handlers.js';
import { validarContraBase } from '../src/funciones/validar.js';

const salida = (texto: string) => process.stdout.write(`${texto}\n`);

// Solo hacen falta la base y el catálogo: la identidad y el transporte no se usan acá.
const config = cargarConfig({ ...process.env, MCP_TRANSPORTE: 'http', MCP_JWT_SIGNING_KEY: process.env.MCP_JWT_SIGNING_KEY || 'validar-funciones' });
const ruta = rutaArchivoFunciones(config);
const acceso = crearAccesoFirebird(config);
let codigo = 0;
try {
  const archivo = leerArchivoFunciones(ruta);
  salida(`Archivo: ${ruta}`);
  salida(`Tools: ${archivo.tools.length} (${archivo.tools.filter((t) => t.tipo === 'procedure' || t.tipo === 'webservice').length} procedure/webservice)`);

  // Handlers de las tools complejas: todos los que no resuelven, no solo el primero.
  const sinResolver: string[] = [];
  const mcp = mcpDeArchivo(ruta);
  for (const tool of archivo.tools) {
    if (tool.tipo !== 'compleja') continue;
    await importarHandler(tool.handler, mcp, `Tool '${tool.nombre}', handler '${tool.handler}'`).catch((e: unknown) => sinResolver.push(e instanceof Error ? e.message : String(e)));
  }
  if (archivo.servidor.completarSesion) {
    await importarCompletarSesion(archivo.servidor.completarSesion, mcp).catch((e: unknown) => sinResolver.push(e instanceof Error ? e.message : String(e)));
  }
  for (const p of sinResolver) salida(`ERROR  ${p}`);
  if (sinResolver.length) throw new Error('Hay handlers que no resuelven: corregilos antes de validar contra la base.');

  // Estructura completa (variantes, descripciones, ...) y después la base.
  await cargarCatalogo(ruta, { acceso, zonaHoraria: config.ZONA_HORARIA_BASE, cache: new CacheCatalogos() });
  const reporte = await acceso.enTransaccionConContexto({ contexto: {}, escritura: false }, (ejecutarSql) => validarContraBase(archivo, ejecutarSql));
  for (const p of reporte.problemas) salida(`ERROR  ${p}`);
  for (const a of reporte.advertencias) salida(`AVISO  ${a}`);
  if (reporte.problemas.length) codigo = 1;
  else salida(reporte.advertencias.length ? 'Sin errores (revisá los avisos).' : 'Sin errores.');
} catch (error) {
  salida(`ERROR  ${error instanceof Error ? error.message : String(error)}`);
  codigo = 1;
} finally {
  await acceso.cerrar().catch(() => undefined);
}
process.exit(codigo);
