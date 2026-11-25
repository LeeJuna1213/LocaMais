import { createSecureContext, type SecureContextOptions } from 'node:tls';
import { readFileSync } from 'node:fs';
import { dirname, isAbsolute, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const apiRoot = resolve(dirname(fileURLToPath(import.meta.url)), '..');

/**
 * HTTPS is opt-in. Relative certificate paths are resolved from the API
 * directory, regardless of whether the app runs from src/ or dist/.
 */
export function loadHttpsOptions(
  env: NodeJS.ProcessEnv = process.env,
): SecureContextOptions | undefined {
  if (env.HTTPS_ENABLED?.trim().toLowerCase() !== 'true') return undefined;

  const keyPath = env.HTTPS_KEY_PATH?.trim();
  const certPath = env.HTTPS_CERT_PATH?.trim();
  if (!keyPath || !certPath) {
    throw new Error(
      'HTTPS_ENABLED=true requer HTTPS_KEY_PATH e HTTPS_CERT_PATH. A API não será iniciada em HTTP.',
    );
  }

  const resolveCertificatePath = (path: string) =>
    isAbsolute(path) ? path : resolve(apiRoot, path);

  let key: Buffer;
  let cert: Buffer;
  try {
    key = readFileSync(resolveCertificatePath(keyPath));
    cert = readFileSync(resolveCertificatePath(certPath));
  } catch (error) {
    const detail = error instanceof Error ? error.message : 'erro de leitura';
    throw new Error(`HTTPS habilitado, mas não foi possível ler a chave/certificado configurado: ${detail}`);
  }

  try {
    const options = { key, cert };
    // Validate PEM encoding and key/certificate correspondence before Nest boots.
    createSecureContext(options);
    return options;
  } catch (error) {
    const detail = error instanceof Error ? error.message : 'certificado ou chave inválidos';
    throw new Error(`HTTPS habilitado, mas o certificado ou a chave são inválidos: ${detail}`);
  }
}
