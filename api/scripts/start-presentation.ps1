$ErrorActionPreference = 'Stop'

$certDir = Join-Path $env:LOCALAPPDATA 'LocaMais\certs'
$certPath = Join-Path $certDir 'locamais-presentation.pem'
$keyPath = Join-Path $certDir 'locamais-presentation-key.pem'
foreach ($path in @($certPath, $keyPath)) {
  if (-not (Test-Path -LiteralPath $path -PathType Leaf)) {
    throw "Certificado/chave de apresentação ausente: $path"
  }
}

$listener = Get-NetTCPConnection -State Listen -LocalPort 3000 -ErrorAction SilentlyContinue
if ($listener) {
  $owners = ($listener | Select-Object -ExpandProperty OwningProcess -Unique) -join ', '
  throw "A porta 3000 já tem listener (PID $owners). Encerre a instância anterior da API antes de iniciar HTTPS. Nenhum processo foi encerrado."
}

$env:HTTPS_ENABLED = 'true'
$env:HTTPS_KEY_PATH = $keyPath
$env:HTTPS_CERT_PATH = $certPath
$env:HOST = '0.0.0.0'
$env:PORT = '3000'
$env:CORS_ORIGINS = 'https://localhost,capacitor://localhost,ionic://localhost'
$env:DATABASE_LOGGING = 'false'

npm run build
if ($LASTEXITCODE -ne 0) { throw 'Build da API falhou.' }
npm run start:prod
if ($LASTEXITCODE -ne 0) { throw 'A API encerrou com erro.' }
