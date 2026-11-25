import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import { loadHttpsOptions } from './https-options.js';

describe('loadHttpsOptions', () => {
  let temporaryDirectory: string | undefined;

  afterEach(() => {
    if (temporaryDirectory) rmSync(temporaryDirectory, { recursive: true, force: true });
    temporaryDirectory = undefined;
  });

  it('preserves HTTP when HTTPS is disabled', () => {
    expect(loadHttpsOptions({ HTTPS_ENABLED: 'false' })).toBeUndefined();
    expect(loadHttpsOptions({})).toBeUndefined();
  });

  it('fails explicitly when HTTPS is enabled without certificate paths', () => {
    expect(() => loadHttpsOptions({ HTTPS_ENABLED: 'true' })).toThrow(
      'HTTPS_KEY_PATH e HTTPS_CERT_PATH',
    );
  });

  it('fails explicitly when configured certificate files are missing', () => {
    expect(() => loadHttpsOptions({
      HTTPS_ENABLED: 'true',
      HTTPS_KEY_PATH: 'missing-key.pem',
      HTTPS_CERT_PATH: 'missing-cert.pem',
    })).toThrow('não foi possível ler');
  });

  it('fails explicitly for invalid certificate or private key data', () => {
    temporaryDirectory = mkdtempSync(join(tmpdir(), 'locamais-tls-'));
    const keyPath = join(temporaryDirectory, 'key.pem');
    const certPath = join(temporaryDirectory, 'cert.pem');
    writeFileSync(keyPath, 'not a private key');
    writeFileSync(certPath, 'not a certificate');

    expect(() => loadHttpsOptions({
      HTTPS_ENABLED: 'true',
      HTTPS_KEY_PATH: keyPath,
      HTTPS_CERT_PATH: certPath,
    })).toThrow('são inválidos');
  });
});
