import { createHash, X509Certificate } from 'node:crypto';
import { copyFileSync, existsSync, readFileSync, writeFileSync } from 'node:fs';
import { networkInterfaces } from 'node:os';
import { isIP } from 'node:net';
import { dirname, join, resolve } from 'node:path';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { createSecureContext } from 'node:tls';

const [mode, action] = process.argv.slice(2);
if (!['usb', 'wifi'].includes(mode) || action !== 'build') {
  throw new Error('Uso: node scripts/android-mode.mjs <usb|wifi> build');
}

const frontendRoot = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const androidRoot = resolve(frontendRoot, 'android');
const localAppData = process.env.LOCALAPPDATA;
if (!localAppData) throw new Error('LOCALAPPDATA não está definido no Windows.');

const certRoot = join(localAppData, 'LocaMais', 'certs');
const caRoot = join(localAppData, 'mkcert');
const certPath = join(certRoot, 'locamais-presentation.pem');
const keyPath = join(certRoot, 'locamais-presentation-key.pem');
const caPath = join(caRoot, 'rootCA.pem');
const androidCaPath = join(androidRoot, 'app', 'src', 'main', 'res', 'raw', 'locamais_root_ca.cer');
const networkConfigTemplatePath = join(androidRoot, 'config', 'network_security_config.xml.template');
const networkConfigPath = join(androidRoot, 'app', 'src', 'main', 'res', 'xml', 'network_security_config.xml');

let apiHost;
if (mode === 'usb') {
  apiHost = 'localhost';
} else {
  apiHost = process.env.LOCAMAIS_HOTSPOT_IP?.trim() ?? '';
  if (isIP(apiHost) !== 4) throw new Error('Defina LOCAMAIS_HOTSPOT_IP com o IPv4 atual da interface hotspot.');
  const localAddresses = Object.values(networkInterfaces()).flatMap((items) => items ?? []).map((item) => item.address);
  if (!localAddresses.includes(apiHost)) {
    throw new Error(`LOCAMAIS_HOTSPOT_IP=${apiHost} não pertence a uma interface local ativa; confira Get-NetIPConfiguration.`);
  }
}

for (const path of [certPath, keyPath, caPath, androidCaPath]) {
  if (!existsSync(path)) throw new Error(`Certificado/configuração ausente: ${path}`);
}

const caBytes = readFileSync(caPath);
const bundledCaBytes = readFileSync(androidCaPath);
const hash = (bytes) => createHash('sha256').update(bytes).digest('hex');
if (hash(caBytes) !== hash(bundledCaBytes)) {
  throw new Error('A CA embutida no Android não corresponde ao rootCA.pem atual do mkcert.');
}

const ca = new X509Certificate(caBytes);
const cert = new X509Certificate(readFileSync(certPath));
const key = readFileSync(keyPath);
const now = Date.now();
if (Date.parse(cert.validFrom) > now || Date.parse(cert.validTo) < now) {
  throw new Error('O certificado de apresentação não está dentro do período de validade.');
}
const identityMatches = mode === 'usb' ? cert.checkHost('localhost') : cert.checkIP(apiHost);
if (!identityMatches) throw new Error(`O SAN do certificado não corresponde ao endpoint ${apiHost}.`);
if (!cert.checkIssued(ca) || !cert.verify(ca.publicKey)) {
  throw new Error('A cadeia/assinatura do certificado não corresponde à CA mkcert atual.');
}
createSecureContext({ key, cert: readFileSync(certPath), ca: caBytes });

const apiUrl = `https://${apiHost}:3000/api`;
process.env.LOCAMAIS_API_URL = apiUrl;
process.env.LOCAMAIS_ANDROID_MODE = mode;

const networkConfigTemplate = readFileSync(networkConfigTemplatePath, 'utf8');
if (networkConfigTemplate.split('__LOCAMAIS_API_HOST__').length !== 2) {
  throw new Error(`Network Security Config template must contain exactly one API-host placeholder: ${networkConfigTemplatePath}`);
}
writeFileSync(networkConfigPath, networkConfigTemplate.replace('__LOCAMAIS_API_HOST__', apiHost));

function run(command, args, cwd) {
  const result = spawnSync(command, args, { cwd, stdio: 'inherit', windowsHide: true });
  if (result.error) throw result.error;
  if (result.status !== 0) process.exit(result.status ?? 1);
}

run(process.execPath, [join(frontendRoot, 'scripts', 'android-sync.mjs')], frontendRoot);

const sdk = process.env.ANDROID_HOME || process.env.ANDROID_SDK_ROOT || join(localAppData, 'Android', 'Sdk');
const javaHome = process.env.JAVA_HOME || 'C:\\Program Files\\Android\\Android Studio\\jbr';
if (!existsSync(join(sdk, 'platform-tools', 'adb.exe'))) throw new Error(`Android SDK Platform Tools não encontrados em ${sdk}.`);
if (!existsSync(join(javaHome, 'bin', 'java.exe'))) throw new Error(`JDK/JBR não encontrado em ${javaHome}.`);
process.env.ANDROID_HOME = sdk;
process.env.ANDROID_SDK_ROOT = sdk;
process.env.JAVA_HOME = javaHome;
process.env.PATH = `${join(javaHome, 'bin')};${join(sdk, 'platform-tools')};${process.env.PATH ?? ''}`;

const wrapper = join(androidRoot, 'gradlew.bat');
if (!existsSync(wrapper)) throw new Error(`Gradle Wrapper ausente: ${wrapper}`);
const escapedWrapper = wrapper.replace(/'/g, "''");
const gradle = spawnSync(
  'powershell.exe',
  ['-NoProfile', '-NonInteractive', '-Command', `& '${escapedWrapper}' assembleDebug`],
  { cwd: androidRoot, stdio: 'inherit', windowsHide: true },
);
if (gradle.error) throw gradle.error;
if (gradle.status !== 0) process.exit(gradle.status ?? 1);

const apkPath = join(androidRoot, 'app', 'build', 'outputs', 'apk', 'debug', 'app-debug.apk');
if (!existsSync(apkPath)) throw new Error(`Gradle terminou sem criar o APK esperado: ${apkPath}`);
const outputDirectory = dirname(apkPath);
const namedApk = join(outputDirectory, `locamais-debug-${mode}.apk`);
copyFileSync(apkPath, namedApk);
writeFileSync(join(outputDirectory, `locamais-debug-${mode}.json`), JSON.stringify({ mode, apiUrl, apk: namedApk }, null, 2));
console.log(`APK ${mode.toUpperCase()} compilado: ${apkPath}`);
console.log(`Cópia identificada por modo: ${namedApk}`);
console.log(`Endpoint embutido: ${apiUrl}`);
