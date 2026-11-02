import { randomBytes } from 'node:crypto';
import type { Claims } from './jwt.js';

export interface CodigoAutorizacion {
  claims: Claims;
  clientId: string;
  redirectUri: string;
  codeChallenge: string;
  vence: number;
}

export interface AlmacenCodigos {
  emitir(datos: Omit<CodigoAutorizacion, 'vence'>): string;
  /** Consume (borra) el código: vale una sola vez y solo si no venció. */
  consumir(codigo: string): CodigoAutorizacion | null;
}

const VIGENCIA_MS = 5 * 60_000;

/**
 * Códigos del flujo Authorization Code + PKCE, en memoria: si el proceso se reinicia en medio de
 * un login, el usuario reintenta (igual que la v1). Las claims ya vienen resueltas del formulario.
 */
export function crearAlmacenCodigos(ahora: () => number = Date.now): AlmacenCodigos {
  const codigos = new Map<string, CodigoAutorizacion>();

  function purgarVencidos() {
    const t = ahora();
    for (const [codigo, datos] of codigos) if (datos.vence <= t) codigos.delete(codigo);
  }

  return {
    emitir(datos) {
      purgarVencidos();
      const codigo = randomBytes(24).toString('hex');
      codigos.set(codigo, { ...datos, vence: ahora() + VIGENCIA_MS });
      return codigo;
    },
    consumir(codigo) {
      const datos = codigos.get(codigo);
      codigos.delete(codigo);
      return datos && datos.vence > ahora() ? datos : null;
    },
  };
}
