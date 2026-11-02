/** Regenera funciones/functions.schema.json desde src/funciones/esquema.ts (`npm run schema:funciones`). */
import { writeFileSync } from 'node:fs';
import { RUTA_SCHEMA_FUNCIONES, textoSchemaFunciones } from '../src/funciones/esquema-publicado.js';

writeFileSync(RUTA_SCHEMA_FUNCIONES, textoSchemaFunciones());
process.stdout.write(`Escrito ${RUTA_SCHEMA_FUNCIONES}\n`);
