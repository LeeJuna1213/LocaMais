import { spawnSync } from 'node:child_process';
import { readFileSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const projectRoot = resolve(fileURLToPath(new URL('..', import.meta.url)));
const outputIndex = resolve(projectRoot, 'www', 'index.html');
const configuredUrl = process.env.LOCAMAIS_API_URL?.trim();

if (!configuredUrl) {
  throw new Error('Defina LOCAMAIS_API_URL antes do build (ex.: http://<IP-DO-NOTEBOOK>:3000/api).');
}

const apiUrl = new URL(configuredUrl);
if (!['http:', 'https:'].includes(apiUrl.protocol) || apiUrl.username || apiUrl.password) {
  throw new Error('LOCAMAIS_API_URL deve ser uma URL HTTP(S) sem credenciais.');
}

const apiPath = apiUrl.pathname.replace(/\/+$/, '');
apiUrl.pathname = apiPath.toLowerCase().endsWith('/api') ? apiPath : `${apiPath}/api`;
apiUrl.search = '';
apiUrl.hash = '';

const angularCli = resolve(projectRoot, 'node_modules', '@angular', 'cli', 'bin', 'ng.js');
const build = spawnSync(process.execPath, [angularCli, 'build', '--configuration', 'production'], {
  cwd: projectRoot,
  stdio: 'inherit',
  windowsHide: true,
});

if (build.error) throw build.error;
if (build.status !== 0) process.exit(build.status ?? 1);

const indexHtml = readFileSync(outputIndex, 'utf8');
const safeUrl = JSON.stringify(apiUrl.toString().replace(/</g, '\\u003c'));
const runtimeConfigScript = `<script>globalThis.__LOCAMAIS_API_URL__=${safeUrl};</script>`;
const headEnd = indexHtml.indexOf('</head>');
if (headEnd < 0) throw new Error('Não foi possível localizar </head> em frontend/www/index.html.');

writeFileSync(outputIndex, `${indexHtml.slice(0, headEnd)}  ${runtimeConfigScript}\n${indexHtml.slice(headEnd)}`);
console.log(`Build preparado para a API ${apiUrl.origin}${apiUrl.pathname}`);
