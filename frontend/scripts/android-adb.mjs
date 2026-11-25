import { existsSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const [action, mode] = process.argv.slice(2);
if (!['reverse', 'reverse-remove', 'install'].includes(action) || (action === 'install' && !['usb', 'wifi'].includes(mode))) {
  throw new Error('Uso: node scripts/android-adb.mjs <reverse|reverse-remove|install> [usb|wifi]');
}

const frontendRoot = resolve(fileURLToPath(new URL('..', import.meta.url)));
const androidRoot = join(frontendRoot, 'android');
const apkDirectory = join(androidRoot, 'app', 'build', 'outputs', 'apk', 'debug');
const sdk = process.env.ANDROID_HOME || process.env.ANDROID_SDK_ROOT || join(process.env.LOCALAPPDATA ?? '', 'Android', 'Sdk');
const adb = join(sdk, 'platform-tools', 'adb.exe');
if (!existsSync(adb)) throw new Error(`ADB não encontrado em ${adb}. Defina ANDROID_HOME para o Android SDK.`);

function adbRun(args) {
  const result = spawnSync(adb, args, { cwd: frontendRoot, encoding: 'utf8', windowsHide: true });
  if (result.error) throw result.error;
  if (result.status !== 0) throw new Error((result.stderr || result.stdout || `adb ${args.join(' ')} falhou`).trim());
  return result.stdout.trim();
}

const devices = adbRun(['devices', '-l']).split(/\r?\n/).slice(1).filter(Boolean);
const deviceRows = devices.map((line) => {
  const [deviceSerial, state] = line.trim().split(/\s+/);
  return { line, serial: deviceSerial, state };
});
const unauthorized = deviceRows.filter((device) => device.state === 'unauthorized');
if (unauthorized.length) throw new Error('Dispositivo ADB não autorizado. Desbloqueie o Android e aceite a chave RSA exibida.');
const online = deviceRows.filter((device) => device.state === 'device');
if (online.length === 0) throw new Error('Nenhum dispositivo Android autorizado. Ative Depuração USB, conecte o cabo e aceite a autorização RSA.');
const requestedSerial = process.env.ANDROID_SERIAL;
if (online.length > 1 && !requestedSerial) throw new Error('Há vários dispositivos. Defina ANDROID_SERIAL com o serial escolhido.');
const serial = requestedSerial || online[0].serial;
if (!online.some((device) => device.serial === serial)) throw new Error(`ANDROID_SERIAL=${serial} não está conectado/autorizado.`);
const deviceArgs = ['-s', serial];

if (action === 'reverse') {
  adbRun([...deviceArgs, 'reverse', 'tcp:3000', 'tcp:3000']);
  const mappings = adbRun([...deviceArgs, 'reverse', '--list']);
  const active = mappings.split(/\r?\n/).some((line) => line.trim().split(/\s+/).slice(-2).join(' ') === 'tcp:3000 tcp:3000');
  if (!active) throw new Error('ADB Reverse não apareceu na lista após configuração.');
  console.log(`ADB Reverse ativo no dispositivo ${serial}: localhost:3000 → notebook:3000.`);
} else if (action === 'reverse-remove') {
  adbRun([...deviceArgs, 'reverse', '--remove', 'tcp:3000']);
  console.log(`Mapeamento ADB Reverse tcp:3000 removido de ${serial}.`);
} else {
  const apkName = `locamais-debug-${mode}.apk`;
  const apk = join(apkDirectory, apkName);
  const metadata = join(apkDirectory, `locamais-debug-${mode}.json`);
  if (!existsSync(apk) || !existsSync(metadata)) throw new Error(`Build ${mode} não encontrado. Execute npm run android:build:${mode} primeiro.`);
  if (mode === 'usb') adbRun([...deviceArgs, 'reverse', 'tcp:3000', 'tcp:3000']);
  const installed = adbRun([...deviceArgs, 'install', '-r', apk]);
  console.log(installed);
  adbRun([...deviceArgs, 'shell', 'monkey', '-p', 'com.locamais.app', '1']);
  console.log(`LocaMais (${mode}) instalado e iniciado no dispositivo ${serial}.`);
}
