import { spawnSync } from 'node:child_process';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const projectRoot = resolve(fileURLToPath(new URL('..', import.meta.url)));
const configuredUrl = process.env.LOCAMAIS_API_URL?.trim();

if (!configuredUrl) {
  throw new Error('Defina LOCAMAIS_API_URL com o hostname HTTPS da API antes de sincronizar Android.');
}

let apiUrl;
try {
  apiUrl = new URL(configuredUrl);
} catch {
  throw new Error('LOCAMAIS_API_URL não é uma URL válida.');
}

if (apiUrl.protocol !== 'https:') {
  throw new Error('Android exige LOCAMAIS_API_URL com HTTPS; sincronização HTTP foi bloqueada.');
}
const hostname = apiUrl.hostname.toLowerCase();
const androidMode = process.env.LOCAMAIS_ANDROID_MODE;
if (androidMode === 'usb' && hostname !== 'localhost') {
  throw new Error('O modo USB exige https://localhost:3000/api com ADB Reverse ativo.');
}
if (androidMode === 'wifi') {
  const hotspotIp = process.env.LOCAMAIS_HOTSPOT_IP?.trim();
  if (!hotspotIp || hostname !== hotspotIp) {
    throw new Error('O modo Wi-Fi exige que a URL da API corresponda ao LOCAMAIS_HOTSPOT_IP atual.');
  }
}
if (!androidMode && ['localhost', '127.0.0.1', '[::1]', '0.0.0.0'].includes(hostname)) {
  throw new Error('Loopback só é permitido pelos scripts de modo USB com ADB Reverse.');
}

function runNodeScript(script, args = []) {
  const result = spawnSync(process.execPath, [script, ...args], {
    cwd: projectRoot,
    stdio: 'inherit',
    windowsHide: true,
  });
  if (result.error) throw result.error;
  if (result.status !== 0) process.exit(result.status ?? 1);
}

runNodeScript(resolve(projectRoot, 'scripts', 'build-server.mjs'));
runNodeScript(resolve(projectRoot, 'node_modules', '@capacitor', 'cli', 'bin', 'capacitor'), ['sync', 'android']);
