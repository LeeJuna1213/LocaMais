param([switch]$NoMenu)

$ErrorActionPreference = 'Stop'
$script:PanelRoot = Split-Path -Parent $PSScriptRoot
$script:ApiRoot = Join-Path $script:PanelRoot 'api'
$script:FrontendRoot = Join-Path $script:PanelRoot 'frontend'
$script:ApkDirectory = Join-Path $script:FrontendRoot 'android\app\build\outputs\apk\debug'
$script:StateDirectory = Join-Path $env:LOCALAPPDATA 'LocaMais\control-panel'
$script:StatePath = Join-Path $script:StateDirectory 'state.json'
$script:ApiLauncher = Join-Path $script:ApiRoot 'scripts\start-presentation.ps1'
$script:AdbPath = $null

function Write-PanelLine([string]$Text, [ConsoleColor]$Color = [ConsoleColor]::Gray) {
  Write-Host $Text -ForegroundColor $Color
}

function Write-Status([string]$Label, [ValidateSet('OK','WARN','FAIL','INFO')][string]$State, [string]$Detail = '') {
  $color = switch ($State) { 'OK' { 'Green' } 'WARN' { 'Yellow' } 'FAIL' { 'Red' } default { 'Cyan' } }
  $icon = switch ($State) { 'OK' { '[OK]' } 'WARN' { '[!] ' } 'FAIL' { '[X] ' } default { '[i] ' } }
  $suffix = if ($Detail) { " — $Detail" } else { '' }
  Write-PanelLine "$icon $Label$suffix" $color
}

function Get-ADBPath {
  $candidates = @()
  if ($env:LOCALAPPDATA) { $candidates += Join-Path $env:LOCALAPPDATA 'Android\Sdk\platform-tools\adb.exe' }
  if ($env:ANDROID_HOME) { $candidates += Join-Path $env:ANDROID_HOME 'platform-tools\adb.exe' }
  if ($env:ANDROID_SDK_ROOT) { $candidates += Join-Path $env:ANDROID_SDK_ROOT 'platform-tools\adb.exe' }
  $command = Get-Command adb.exe -ErrorAction SilentlyContinue
  if ($command) { $candidates += $command.Source }
  foreach ($candidate in ($candidates | Select-Object -Unique)) {
    if (Test-Path -LiteralPath $candidate -PathType Leaf) { return (Resolve-Path -LiteralPath $candidate).Path }
  }
  return $null
}

function Invoke-Adb([string[]]$Arguments, [switch]$AllowFailure) {
  if (-not $script:AdbPath) { $script:AdbPath = Get-ADBPath }
  if (-not $script:AdbPath) { throw 'ADB não encontrado. Instale Android SDK Platform Tools ou configure ANDROID_HOME.' }
  $previousPreference = $ErrorActionPreference
  $ErrorActionPreference = 'Continue'
  try {
    $output = & $script:AdbPath @Arguments 2>&1
    $code = $LASTEXITCODE
  } finally { $ErrorActionPreference = $previousPreference }
  if ($code -ne 0 -and -not $AllowFailure) { throw "ADB falhou (código $code): $($output -join ' ')" }
  return [pscustomobject]@{ ExitCode = $code; Output = ($output -join "`n") }
}

function ConvertFrom-AdbDevicesOutput([string]$Output) {
  foreach ($line in ($Output -split "`r?`n" | Select-Object -Skip 1)) {
    if ($line -match '^\s*(\S+)\s+(device|unauthorized|offline)(?:\s+(.*))?$') {
      [pscustomobject]@{ Serial = $Matches[1]; State = $Matches[2]; Description = $Matches[3]; Line = $line.Trim() }
    }
  }
}

function Test-IPv4Address([string]$Address) {
  $parsed = $null
  return ($Address -match '^(?:\d{1,3}\.){3}\d{1,3}$' -and [System.Net.IPAddress]::TryParse($Address, [ref]$parsed) -and $parsed.AddressFamily -eq [System.Net.Sockets.AddressFamily]::InterNetwork)
}

function Test-AdbPort([string]$Port) {
  $number = 0
  return ([int]::TryParse($Port, [ref]$number) -and $number -ge 1 -and $number -le 65535)
}

function Test-AdbPairingCode([string]$Code) {
  return ($Code -match '^\d{6}$')
}

function ConvertFrom-AdbTcpEndpoint([string]$Endpoint) {
  if ($Endpoint -notmatch '^(?<host>(?:\d{1,3}\.){3}\d{1,3}):(?<port>\d{1,5})$') { return $null }
  if (-not (Test-IPv4Address $Matches.host) -or -not (Test-AdbPort $Matches.port)) { return $null }
  return [pscustomobject]@{ Host = $Matches.host; Port = [int]$Matches.port; Endpoint = "$($Matches.host):$([int]$Matches.port)" }
}

function Test-AdbPairSucceeded([int]$ExitCode, [string]$Output) {
  return ($ExitCode -eq 0 -and $Output -match '(?i)\b(successfully paired|already paired)\b')
}

function Test-AdbConnectSucceeded([int]$ExitCode, [string]$Output, [string]$Endpoint) {
  if ($ExitCode -ne 0 -or -not $Endpoint) { return $false }
  $target = [regex]::Escape($Endpoint)
  return ($Output -match "(?i)(?:connected to|already connected to)\s+$target(?:\s|$)")
}

function Get-AdbConnectionType($Device) {
  if (Test-UsbAdbDevice $Device) { return 'USB' }
  if ((ConvertFrom-AdbTcpEndpoint $Device.Serial) -or $Device.Serial -match '(?i)_adb-tls-connect(?:\._tcp)?$') { return 'TCP/IP' }
  return 'desconhecido'
}

function Ensure-AdbServer {
  $start = Invoke-Adb @('start-server')
  $devices = Invoke-Adb @('devices','-l')
  if ($devices.Output -notmatch '(?m)^List of devices attached\s*$') { throw 'ADB Server não confirmou a listagem de dispositivos. Feche e reabra a Central ou verifique a instalação do Android SDK Platform Tools.' }
  if ($start.Output -match '(?i)cannot connect|failed to start') { throw 'Não foi possível iniciar o ADB Server. Confira se outro ADB não está bloqueando a porta local 5037.' }
  return $true
}

function Read-PairingCodeSecurely {
  $secure = Read-Host 'Código temporário de 6 dígitos (entrada oculta)' -AsSecureString
  $pointer = [IntPtr]::Zero
  try {
    $pointer = [Runtime.InteropServices.Marshal]::SecureStringToBSTR($secure)
    return [Runtime.InteropServices.Marshal]::PtrToStringBSTR($pointer)
  } finally {
    if ($pointer -ne [IntPtr]::Zero) { [Runtime.InteropServices.Marshal]::ZeroFreeBSTR($pointer) }
    if ($secure) { $secure.Dispose() }
  }
}

function Connect-AdbTcpEndpoint([string]$HostName, [string]$Port, [switch]$Quiet) {
  if (-not (Test-IPv4Address $HostName)) { throw 'IP inválido. Informe o IPv4 mostrado no celular em Depuração sem fio.' }
  if (-not (Test-AdbPort $Port)) { throw 'Porta inválida. Informe a porta atual exibida na tela principal de Depuração sem fio.' }
  $endpoint = "$HostName`:$([int]$Port)"
  $result = Invoke-Adb @('connect',$endpoint) -AllowFailure
  if (-not (Test-AdbConnectSucceeded $result.ExitCode $result.Output $endpoint)) {
    if (-not $Quiet) { Write-Status 'Conexão ADB Wi-Fi' FAIL (Get-AdbConnectFailureMessage $result.Output) }
    return $false
  }
  $devices = @(Get-AdbDevices)
  $device = $devices | Where-Object { $_.Serial -eq $endpoint -and $_.State -eq 'device' } | Select-Object -First 1
  if (-not $device) {
    $entry = $devices | Where-Object Serial -eq $endpoint | Select-Object -First 1
    $reason = if ($entry -and $entry.State -eq 'unauthorized') { 'Conexão feita, mas o Android ainda não autorizou o ADB. Confirme o diálogo de Depuração sem fio.' } elseif ($entry -and $entry.State -eq 'offline') { 'O Android aparece offline. Reative Depuração sem fio e tente novamente.' } else { 'O ADB informou conexão, mas o dispositivo não apareceu como autorizado em adb devices -l.' }
    if (-not $Quiet) { Write-Status 'Conexão ADB Wi-Fi' WARN $reason }
    return $false
  }
  $state = Get-ControlState
  $known = @($state.KnownWifiEndpoints | Where-Object { $_ -ne $endpoint })
  $state.KnownWifiEndpoints = @($known + $endpoint)
  $state.PreferredSerial = $endpoint
  $state.DeviceSerial = $endpoint
  Save-ControlState $state
  if (-not $Quiet) { Write-Status 'ADB Wi-Fi' OK "conectado e verificado: $endpoint" }
  return $true
}

function Invoke-AdbWifiPairing {
  $script:AdbPath = Get-ADBPath
  if (-not $script:AdbPath) { throw 'ADB não encontrado. Instale Android SDK Platform Tools.' }
  Write-Status 'ADB' OK $script:AdbPath
  $null = Ensure-AdbServer
  Write-Status 'ADB Server' OK 'em execução; adb devices -l respondeu'
  Write-PanelLine 'No Android: Opções do desenvolvedor > Depuração sem fio > “Parear dispositivo com código de pareamento”.' Yellow
  Write-PanelLine 'Mantenha celular e notebook na mesma rede Wi-Fi. Não use a porta da tela principal nesta etapa.' Gray
  $hostName = Read-Host 'IP IPv4 do celular exibido na tela de pareamento'
  if (-not (Test-IPv4Address $hostName)) { throw 'IP inválido. Digite o IPv4 do celular, não o IP do notebook.' }
  $pairPort = Read-Host 'Porta indicada em “Parear dispositivo com código de pareamento”'
  if (-not (Test-AdbPort $pairPort)) { throw 'Porta de pareamento inválida. Use a porta ao lado do IP dentro da tela de pareamento.' }
  $code = Read-PairingCodeSecurely
  if (-not (Test-AdbPairingCode $code)) { $code = $null; throw 'O código precisa ter exatamente seis dígitos. Gere um novo código e tente novamente.' }
  $endpoint = "$hostName`:$([int]$pairPort)"
  try {
    # ADB exige o código como argumento; ele é mantido apenas em memória e nunca impresso ou persistido.
    $previousPreference = $ErrorActionPreference
    $ErrorActionPreference = 'Continue'
    try {
      $pairOutput = & $script:AdbPath pair $endpoint $code 2>&1
      $pairExitCode = $LASTEXITCODE
    } finally { $ErrorActionPreference = $previousPreference }
    $pairText = $pairOutput -join "`n"
  } finally { $code = $null }
  if (-not (Test-AdbPairSucceeded $pairExitCode $pairText)) {
    Write-Status 'Pareamento ADB Wi-Fi' FAIL (Get-AdbPairFailureMessage $pairText)
    return
  }
  Write-Status 'Pareamento ADB Wi-Fi' OK "ADB confirmou o pareamento com $endpoint"

  Write-PanelLine 'Agora abra a tela principal “Depuração sem fio” (fora do diálogo de pareamento) e use a porta indicada em “Endereço IP e porta”.' Yellow
  Write-PanelLine 'Essa porta pode ser diferente da porta temporária usada para parear.' Gray
  $connectPort = Read-Host 'Porta de conexão exibida na tela principal (deixe vazia se precisar localizar a tela)'
  if ([string]::IsNullOrWhiteSpace($connectPort)) {
    Write-PanelLine 'Android: Opções do desenvolvedor > Depuração sem fio. A tela principal mostra “Endereço IP e porta”; use somente essa porta para conectar.' Yellow
    $connectPort = Read-Host 'Porta de conexão'
  }
  if (-not (Test-AdbPort $connectPort)) { throw 'Porta de conexão inválida. Leia “Endereço IP e porta” na tela principal de Depuração sem fio, não a porta do diálogo de pareamento.' }
  if (-not (Connect-AdbTcpEndpoint $hostName $connectPort)) { return }
}

function Invoke-AdbWifiReconnect {
  $script:AdbPath = Get-ADBPath
  if (-not $script:AdbPath) { throw 'ADB não encontrado. Instale Android SDK Platform Tools.' }
  $null = Ensure-AdbServer
  $state = Get-ControlState
  $devicesBefore = @(Get-AdbDevices)
  foreach ($device in $devicesBefore) {
    if ($device.State -eq 'offline') { Write-Status 'Dispositivo offline' WARN "$($device.Serial): confirme Depuração sem fio ativa e atualize a porta no Android" }
    elseif ($device.State -eq 'unauthorized') { Write-Status 'Dispositivo não autorizado' WARN "$($device.Serial): confirme a autorização no celular" }
  }
  $alreadyConnected = @($devicesBefore | Where-Object { $_.State -eq 'device' -and (Get-AdbConnectionType $_) -eq 'TCP/IP' })
  if (-not $state.KnownWifiEndpoints.Count -and $alreadyConnected.Count) {
    Write-Status 'Reconexão ADB Wi-Fi' OK 'já existe conexão TCP/IP ativa; nenhum endereço antigo foi reutilizado'
    Show-AdbDevices | Out-Null
    return
  }
  $attempted = $false
  foreach ($oldEndpoint in @($state.KnownWifiEndpoints)) {
    $parsed = ConvertFrom-AdbTcpEndpoint ([string]$oldEndpoint)
    if (-not $parsed) { continue }
    if (-not (Test-TcpPort $parsed.Host $parsed.Port 600)) {
      Write-Status 'Endereço ADB salvo' WARN "$($parsed.Endpoint) não responde; porta antiga ignorada"
      continue
    }
    $attempted = $true
    if (Connect-AdbTcpEndpoint $parsed.Host ([string]$parsed.Port) -Quiet) { Write-Status 'Reconexão ADB Wi-Fi' OK "reconectado em $($parsed.Endpoint)" }
  }
  if (-not $attempted -or -not (@(Get-AdbDevices | Where-Object { $_.State -eq 'device' -and (ConvertFrom-AdbTcpEndpoint $_.Serial) }).Count)) {
    Write-Status 'Reconexão' WARN 'nenhum endereço salvo continua acessível; informe o endereço e a porta atuais'
    $hostName = Read-Host 'IP IPv4 atual do celular'
    $port = Read-Host 'Porta atual de “Endereço IP e porta” na tela principal de Depuração sem fio'
    $null = Connect-AdbTcpEndpoint $hostName $port
  }
  Show-AdbDevices
}

function Show-AdbDevices {
  $devices = @(Get-AdbDevices)
  if (-not $devices.Count) { Write-Status 'ADB' WARN 'nenhum dispositivo conectado; use Parear celular por ADB Wi-Fi ou conecte por USB'; return @() }
  $mdnsResult = Invoke-Adb @('mdns','services') -AllowFailure
  $mdnsServices = ConvertFrom-AdbMdnsServices $mdnsResult.Output
  Write-PanelLine 'Dispositivos ADB:' Cyan
  for ($i = 0; $i -lt $devices.Count; $i++) {
    $device = $devices[$i]
    $type = Get-AdbConnectionType $device
    $endpoint = Get-AdbDeviceNetworkEndpoint $device $mdnsServices
    if ($endpoint) { $device | Add-Member -NotePropertyName NetworkEndpoint -NotePropertyValue $endpoint.Endpoint -Force }
    $location = if ($endpoint) { "IP $($endpoint.Host), porta $($endpoint.Port)" } elseif (Test-UsbAdbDevice $device) { 'conexão USB' } else { $device.Description }
    Write-PanelLine "[$($i + 1)] $($device.Serial) | $type | $($device.State) | $location" $(if ($device.State -eq 'device') { 'Green' } else { 'Yellow' })
  }
  return $devices
}

function Select-DeviceFromList($Devices, [switch]$ConnectedOnly) {
  $options = @($Devices)
  if ($ConnectedOnly) { $options = @($options | Where-Object State -eq 'device') }
  if (-not $options.Count) { throw 'Não há dispositivo nesse estado para selecionar.' }
  if ($options.Count -eq 1) { return $options[0] }
  $choice = Read-Host 'Número do dispositivo de destino'
  $index = 0
  if (-not [int]::TryParse($choice, [ref]$index) -or $index -lt 1 -or $index -gt $options.Count) { throw 'Seleção de dispositivo inválida; nenhuma ação foi executada.' }
  return $options[$index - 1]
}

function Invoke-DeviceManagement {
  $script:AdbPath = Get-ADBPath
  if (-not $script:AdbPath) { throw 'ADB não encontrado. Instale Android SDK Platform Tools.' }
  while ($true) {
    $devices = @(Show-AdbDevices)
    Write-PanelLine '[1] Selecionar dispositivo de destino' Cyan
    Write-PanelLine '[2] Desconectar dispositivo TCP/IP específico' Cyan
    Write-PanelLine '[3] Atualizar listagem' Cyan
    Write-PanelLine '[0] Voltar' Cyan
    $action = Read-Host 'Ação'
    switch ($action) {
      '1' {
        try {
          $device = Select-DeviceFromList $devices -ConnectedOnly
          $state = Get-ControlState
          $state.PreferredSerial = $device.Serial
          $state.DeviceSerial = $device.Serial
          Save-ControlState $state
          Write-Status 'Dispositivo de destino' OK "$($device.Serial) ($((Get-AdbConnectionType $device)))"
        } catch { Write-Status 'Seleção' FAIL $_.Exception.Message }
      }
      '2' {
        $tcp = @($devices | Where-Object { (Get-AdbConnectionType $_) -eq 'TCP/IP' -and $_.NetworkEndpoint })
        if (-not $tcp.Count) { Write-Status 'Desconexão' WARN 'nenhum dispositivo TCP/IP para desconectar'; continue }
        try {
          $device = Select-DeviceFromList $tcp
          $confirmation = Read-Host "Desconectar somente $($device.Serial)? [S/N]"
          if ($confirmation -notmatch '^(?i)s$') { Write-Status 'Desconexão' INFO 'cancelada'; continue }
          $result = Invoke-Adb @('disconnect',$device.NetworkEndpoint) -AllowFailure
          $remaining = @(Get-AdbDevices | Where-Object Serial -eq $device.Serial)
          if ($result.ExitCode -eq 0 -and -not $remaining.Count) {
            $state = Get-ControlState
            if ($state.PreferredSerial -eq $device.Serial) { $state.PreferredSerial = $null }
            if ($state.DeviceSerial -eq $device.Serial) { $state.DeviceSerial = $null }
            Save-ControlState $state
            Write-Status 'Desconexão ADB Wi-Fi' OK "$($device.Serial) desconectado; autorizações do Android não foram removidas"
          } else { Write-Status 'Desconexão ADB Wi-Fi' WARN 'ADB não confirmou a desconexão; atualize a listagem e tente novamente' }
        } catch { Write-Status 'Desconexão' FAIL $_.Exception.Message }
      }
      '3' { continue }
      '0' { return }
      default { Write-Status 'Gerenciamento' WARN 'opção inválida' }
    }
    [void](Read-Host 'Enter para atualizar a listagem')
  }
}

function Invoke-AdbWifiDisconnect {
  Stop-ControlledApi
  $script:AdbPath = Get-ADBPath
  if (-not $script:AdbPath) { throw 'ADB não encontrado. A API controlada foi encerrada, mas não foi possível consultar conexões.' }
  $devices = @(Show-AdbDevices | Where-Object { (Get-AdbConnectionType $_) -eq 'TCP/IP' -and $_.NetworkEndpoint })
  if (-not $devices.Count) { Write-Status 'Desconexão ADB Wi-Fi' INFO 'nenhuma conexão TCP/IP ativa; USB não foi desconectado'; return }
  $device = Select-DeviceFromList $devices
  $result = Invoke-Adb @('disconnect',$device.NetworkEndpoint) -AllowFailure
  if ($result.ExitCode -eq 0 -and -not (@(Get-AdbDevices | Where-Object Serial -eq $device.Serial).Count)) {
    Write-Status 'Desconexão ADB Wi-Fi' OK "$($device.Serial) desconectado; pareamento/autorização permanecem no Android"
  } else { Write-Status 'Desconexão ADB Wi-Fi' WARN 'ADB não confirmou a desconexão' }
  Write-Status 'USB' INFO 'conexões USB não foram alteradas'
}

function Invoke-ApiStartMenu {
  $deps = Test-Dependencies
  if (-not $deps.MySql) { throw 'MySQL não responde em 127.0.0.1:3306; API não iniciada.' }
  if (-not $deps.Redis) { Write-Status 'Memurai/Redis' WARN 'API pode não completar o bootstrap sem Redis disponível' }
  $null = Start-ControlledApi
  Write-Status 'URLs do aplicativo' INFO 'USB permanece https://localhost:3000/api; o APK Wi-Fi usa o IP HTTPS gravado no próprio build.'
  foreach ($mode in @('usb','wifi')) {
    $metadata = Join-Path $script:ApkDirectory "locamais-debug-$mode.json"
    if (Test-Path -LiteralPath $metadata) {
      try { $url = (Get-Content -LiteralPath $metadata -Raw | ConvertFrom-Json).apiUrl; Write-Status "APK $mode" INFO $url } catch { Write-Status "APK $mode" WARN 'metadados inválidos' }
    } else { Write-Status "APK $mode" WARN 'metadados/build ainda não existem' }
  }
}

function Get-AdbPairFailureMessage([string]$Output) {
  if ($Output -match '(?i)authentication|pairing code|pairing failed|failed to authenticate') { return 'Código de pareamento incorreto ou expirado. Gere um novo código no Android e tente novamente.' }
  if ($Output -match '(?i)protocol fault|failed to read|unexpectedly closed') { return 'A porta informada não parece ser a porta de pareamento. Use a porta exibida em “Parear dispositivo com código”.' }
  if ($Output -match '(?i)failed to connect|connection refused|no route|timed out') { return 'Não foi possível alcançar o celular. Confira IP, porta de pareamento, mesma rede e Depuração sem fio ativa.' }
  return 'O ADB não confirmou o pareamento. Confira IP/porta, gere um novo código e tente novamente.'
}

function Get-AdbConnectFailureMessage([string]$Output) {
  if ($Output -match '(?i)unauthorized|not authorized') { return 'Celular não autorizado. Confirme o aviso de autorização/Depuração sem fio no Android.' }
  if ($Output -match '(?i)offline') { return 'Celular está offline. Reative Depuração sem fio e tente Reconectar.' }
  if ($Output -match '(?i)failed to connect|connection refused|no route|timed out') { return 'Falha de conexão. IP/porta podem ter mudado ou o celular está fora da rede; confira a porta na tela principal de Depuração sem fio.' }
  return 'O ADB não confirmou a conexão TCP/IP. Confira o IP e a porta de conexão do Android.'
}

function Test-IPv4SameSubnet([string]$First, [string]$Second, [int]$PrefixLength) {
  if (-not (Test-IPv4Address $First) -or -not (Test-IPv4Address $Second) -or $PrefixLength -lt 0 -or $PrefixLength -gt 32) { return $false }
  $a = ([System.Net.IPAddress]::Parse($First)).GetAddressBytes()
  $b = ([System.Net.IPAddress]::Parse($Second)).GetAddressBytes()
  for ($i = 0; $i -lt 4; $i++) {
    $remaining = $PrefixLength - ($i * 8)
    [int]$mask = if ($remaining -ge 8) { 255 } elseif ($remaining -le 0) { 0 } else { (256 - [math]::Pow(2, 8 - $remaining)) }
    if (($a[$i] -band $mask) -ne ($b[$i] -band $mask)) { return $false }
  }
  return $true
}

function Get-AdbRouteSourceAddress([string]$RouteOutput) {
  if ($RouteOutput -match '(?i)\bsrc\s+((?:\d{1,3}\.){3}\d{1,3})') { return $Matches[1] }
  return $null
}

function ConvertFrom-AdbMdnsServices([string]$Output) {
  $services = @{}
  foreach ($line in ($Output -split "`r?`n")) {
    if ($line -match '^\s*(?<service>\S+).*?(?<endpoint>(?:\d{1,3}\.){3}\d{1,3}:\d{1,5})\s*$') {
      $endpoint = ConvertFrom-AdbTcpEndpoint $Matches.endpoint
      if ($endpoint) { $services[$Matches.service] = $endpoint }
    }
  }
  return $services
}

function Get-AdbDeviceNetworkEndpoint($Device, $MdnsServices = $null) {
  $direct = ConvertFrom-AdbTcpEndpoint $Device.Serial
  if ($direct) { return $direct }
  if ($MdnsServices -and $MdnsServices.ContainsKey($Device.Serial)) { return $MdnsServices[$Device.Serial] }
  return $null
}

function Get-AdbDevices {
  $result = Invoke-Adb @('devices','-l')
  return @(ConvertFrom-AdbDevicesOutput $result.Output)
}

function Test-UsbAdbDevice($Device) {
  if (ConvertFrom-AdbTcpEndpoint $Device.Serial) { return $false }
  return ($Device.Serial -notmatch '(?i)_adb-tls-connect(?:\._tcp)?$' -and $Device.Description -notmatch '(?i)transport_id:\d+.*wifi')
}

function Select-AdbDevice([switch]$RequireUsb, [switch]$AlwaysPrompt) {
  $devices = @(Get-AdbDevices)
  $unauthorized = @($devices | Where-Object State -eq 'unauthorized')
  foreach ($device in $unauthorized) { Write-Status 'Autorização ADB' WARN "$($device.Serial): desbloqueie o celular e aceite o aviso de depuração correspondente" }
  $online = @($devices | Where-Object State -eq 'device')
  if ($RequireUsb) {
    $online = @($online | Where-Object { Test-UsbAdbDevice $_ })
    if ($online.Count -eq 0) { throw 'Nenhum dispositivo físico USB autorizado. Conecte o cabo, ative Depuração USB e aceite a chave RSA; conexões ADB por Wi-Fi não atendem esta opção.' }
  }
  if ($online.Count -eq 0) { throw 'Nenhum dispositivo Android detectado pelo ADB. Em Depuração sem fio, use "Parear dispositivo com código de pareamento" e execute adb pair IP:PORTA; depois execute adb connect IP:PORTA. Ativar a opção, sozinho, não cria uma sessão ADB.' }
  if ($online.Count -gt 1 -and -not $AlwaysPrompt) {
    $state = Get-ControlState
    $preferred = @($online | Where-Object Serial -eq $state.PreferredSerial)
    if ($preferred.Count -eq 1) { return $preferred[0] }
  }
  if ($online.Count -eq 1) { return $online[0] }
  Write-PanelLine 'Dispositivos autorizados:' Cyan
  for ($i = 0; $i -lt $online.Count; $i++) { Write-PanelLine "[$($i + 1)] $($online[$i].Serial) $($online[$i].Description)" Gray }
  $choice = Read-Host 'Selecione o dispositivo'
  $index = 0
  if (-not [int]::TryParse($choice, [ref]$index) -or $index -lt 1 -or $index -gt $online.Count) { throw 'Seleção de dispositivo inválida.' }
  return $online[$index - 1]
}

function Get-IPv4FromAddress([string]$Address) {
  if ($Address -match '^(?<ip>(?:\d{1,3}\.){3}\d{1,3})(?:/\d{1,2})?$') { return $Matches.ip }
  return $null
}

function Get-HotspotAdapters {
  $configs = @(Get-NetIPConfiguration -ErrorAction Stop | Where-Object { $_.NetAdapter.Status -eq 'Up' })
  $records = foreach ($config in $configs) {
    foreach ($entry in @($config.IPv4Address)) {
      $ip = Get-IPv4FromAddress $entry.IPAddress
      if (-not $ip -or $ip -like '127.*' -or $ip -like '169.254.*') { continue }
      [pscustomobject]@{
        InterfaceAlias = $config.InterfaceAlias
        InterfaceDescription = $config.NetAdapter.InterfaceDescription
        IPv4 = $ip
        PrefixLength = $entry.PrefixLength
        HotspotHint = (($config.InterfaceAlias + ' ' + $config.NetAdapter.InterfaceDescription) -match '(?i)mobile.?hotspot|hotspot|wi-?fi direct|wireless virtual|local area connection\*')
      }
    }
  }
  $hinted = @($records | Where-Object HotspotHint)
  if ($hinted.Count) { return $hinted }
  return @($records)
}

function Test-WifiApkMatchesIp([string]$Metadata, [string]$Ip) {
  try {
    $parsed = $Metadata | ConvertFrom-Json
    $uri = [Uri]$parsed.apiUrl
    return ($uri.Scheme -eq 'https' -and $uri.Host -eq $Ip -and $uri.Port -eq 3000)
  } catch { return $false }
}

function Test-PresentationCertificateIp([string]$Ip) {
  $certificatePath = Join-Path $env:LOCALAPPDATA 'LocaMais\certs\locamais-presentation.pem'
  $node = Get-Command node.exe -ErrorAction SilentlyContinue
  if (-not $node -or -not (Test-Path -LiteralPath $certificatePath)) { return $false }
  $check = 'const fs=require("fs");const {X509Certificate}=require("crypto");const c=new X509Certificate(fs.readFileSync(process.argv[2]));process.stdout.write(c.checkIP(process.argv[3])?"MATCH":"MISMATCH")'
  $encodedCheck = [Convert]::ToBase64String([Text.Encoding]::UTF8.GetBytes($check))
  $runner = "eval(Buffer.from(process.argv[1],'base64').toString())"
  $result = & $node.Source -e $runner $encodedCheck $certificatePath $Ip 2>$null
  return ($LASTEXITCODE -eq 0 -and $result -eq 'MATCH')
}

function Test-TcpPort([string]$HostName, [int]$Port, [int]$TimeoutMilliseconds = 900) {
  $client = New-Object System.Net.Sockets.TcpClient
  try {
    $result = $client.BeginConnect($HostName, $Port, $null, $null)
    if (-not $result.AsyncWaitHandle.WaitOne($TimeoutMilliseconds, $false)) { return $false }
    $client.EndConnect($result)
    return $true
  } catch { return $false } finally { $client.Close() }
}

function Test-ApiHttps([string]$HostName = 'localhost') {
  try {
    $request = [System.Net.HttpWebRequest]::Create("https://${HostName}:3000/api")
    $request.Method = 'GET'
    $request.Timeout = 2500
    $request.ReadWriteTimeout = 2500
    $request.AllowAutoRedirect = $false
    $response = $request.GetResponse()
    $code = [int]$response.StatusCode
    $response.Close()
    return ($code -ge 200 -and $code -lt 500)
  } catch [System.Net.WebException] {
    if ($_.Exception.Response) { $_.Exception.Response.Close(); return $true }
    return $false
  } catch { return $false }
}

function Test-ManagedApiCommandLine([string]$CommandLine) {
  $expectedPath = [regex]::Escape($script:ApiLauncher)
  return ($CommandLine -match "(?i)$expectedPath(?:`"|\s|$)")
}

function Get-ControlState {
  if (Test-Path -LiteralPath $script:StatePath) {
    try {
      $state = Get-Content -LiteralPath $script:StatePath -Raw | ConvertFrom-Json
      foreach ($property in @(@{ Name = 'PreferredSerial'; Value = $null }, @{ Name = 'KnownWifiEndpoints'; Value = @() })) {
        if (-not $state.PSObject.Properties[$property.Name]) { $state | Add-Member -NotePropertyName $property.Name -NotePropertyValue $property.Value }
      }
      return $state
    } catch { }
  }
  return [pscustomobject]@{ ApiPid = $null; ApiStartedAt = $null; DeviceSerial = $null; PreferredSerial = $null; KnownWifiEndpoints = @(); ReverseCreated = $false; ReverseSerial = $null }
}

function Save-ControlState($State) {
  if (-not (Test-Path -LiteralPath $script:StateDirectory)) { New-Item -ItemType Directory -Path $script:StateDirectory -Force | Out-Null }
  $State | ConvertTo-Json | Set-Content -LiteralPath $script:StatePath -Encoding UTF8
}

function Get-ApiPortOwner {
  @(Get-NetTCPConnection -State Listen -LocalPort 3000 -ErrorAction SilentlyContinue | Select-Object -ExpandProperty OwningProcess -Unique)
}

function Start-ControlledApi {
  if (Test-ApiHttps 'localhost') { Write-Status 'API HTTPS' OK 'já está respondendo; não será iniciada outra instância'; return $true }
  $owners = @(Get-ApiPortOwner)
  if ($owners.Count) {
    $names = foreach ($owner in $owners) { try { (Get-Process -Id $owner -ErrorAction Stop).ProcessName } catch { "PID $owner" } }
    throw "A porta 3000 já está ocupada ($($names -join ', ')), mas HTTPS não respondeu. Nada foi encerrado."
  }
  if (-not (Test-Path -LiteralPath $script:ApiLauncher)) { throw "Script de apresentação ausente: $script:ApiLauncher" }
  $powerShell = (Get-Process -Id $PID).Path
  if (-not $powerShell) { $powerShell = Join-Path $PSHOME 'powershell.exe' }
  $process = Start-Process -FilePath $powerShell -ArgumentList @('-NoProfile','-ExecutionPolicy','Bypass','-File',('"' + $script:ApiLauncher + '"')) -WorkingDirectory $script:ApiRoot -PassThru -WindowStyle Hidden
  $state = Get-ControlState
  $state.ApiPid = $process.Id
  $state.ApiStartedAt = (Get-Date).ToString('o')
  Save-ControlState $state
  Write-Status 'API' INFO 'inicializando (build e validação do banco em andamento)'
  for ($i = 0; $i -lt 90; $i++) {
    Start-Sleep -Seconds 1
    if (Test-ApiHttps 'localhost') { Write-Status 'API HTTPS' OK 'https://localhost:3000/api respondeu'; return $true }
    try { $process.Refresh(); if ($process.HasExited) { break } } catch { break }
  }
  try { $process.Refresh(); $exit = if ($process.HasExited) { " (código $($process.ExitCode))" } else { '' } } catch { $exit = '' }
  throw "A API não ficou disponível por HTTPS$exit. Confira MySQL, Memurai e o certificado de apresentação. A central não expõe conteúdo do .env."
}

function Stop-ControlledApi {
  $state = Get-ControlState
  if ($state.ApiPid) {
    $process = Get-CimInstance Win32_Process -Filter "ProcessId = $($state.ApiPid)" -ErrorAction SilentlyContinue
    if ($process -and (Test-ManagedApiCommandLine $process.CommandLine)) {
      $killOutput = & taskkill.exe /PID ([string]$state.ApiPid) /T /F 2>&1
      if ($LASTEXITCODE -ne 0) { throw "Não foi possível encerrar a API controlada: $($killOutput -join ' ')" }
      Write-Status 'API iniciada pela central' OK 'processo e descendentes encerrados'
    } else { Write-Status 'API iniciada pela central' WARN 'PID não pertence mais ao inicializador validado; não foi encerrado' }
  } else { Write-Status 'API iniciada pela central' INFO 'nenhuma instância registrada' }

  if ($state.ReverseCreated -and $state.ReverseSerial) {
    $mapping = Invoke-Adb @('-s',[string]$state.ReverseSerial,'reverse','--list') -AllowFailure
    if ($mapping.ExitCode -eq 0 -and $mapping.Output -match '(?m)\btcp:3000\s+tcp:3000\s*$') {
      $null = Invoke-Adb @('-s',[string]$state.ReverseSerial,'reverse','--remove','tcp:3000')
      Write-Status 'ADB Reverse LocaMais' OK 'encaminhamento tcp:3000 removido'
    } else { Write-Status 'ADB Reverse LocaMais' WARN 'encaminhamento não está ativo; nada foi alterado' }
  }
  $state.ApiPid = $null; $state.ApiStartedAt = $null; $state.ReverseCreated = $false; $state.ReverseSerial = $null; $state.DeviceSerial = $null
  Save-ControlState $state
  # Não encerra MySQL, Memurai nem processos que não foram iniciados pela central.
}

function Ensure-AdbReverse($Device) {
  $before = Invoke-Adb @('-s',$Device.Serial,'reverse','--list')
  $already = $before.Output -match '(?m)\btcp:3000\s+tcp:3000\s*$'
  $null = Invoke-Adb @('-s',$Device.Serial,'reverse','tcp:3000','tcp:3000')
  $after = Invoke-Adb @('-s',$Device.Serial,'reverse','--list')
  if ($after.Output -notmatch '(?m)\btcp:3000\s+tcp:3000\s*$') { throw 'ADB Reverse não apareceu na lista após configuração.' }
  $state = Get-ControlState
  if (-not $already) { $state.ReverseCreated = $true; $state.ReverseSerial = $Device.Serial }
  $state.DeviceSerial = $Device.Serial
  Save-ControlState $state
  Write-Status 'ADB Reverse' OK "localhost:3000 → notebook:3000 ($($Device.Serial))"
}

function Test-Dependencies {
  $mysql = Test-TcpPort '127.0.0.1' 3306
  $redis = Test-TcpPort '127.0.0.1' 6379
  Write-Status 'MySQL' $(if ($mysql) { 'OK' } else { 'FAIL' }) $(if ($mysql) { 'porta local 3306 disponível' } else { 'sem resposta em 127.0.0.1:3306' })
  Write-Status 'Memurai/Redis' $(if ($redis) { 'OK' } else { 'WARN' }) $(if ($redis) { 'porta local 6379 disponível' } else { 'sem resposta em 127.0.0.1:6379' })
  return [pscustomobject]@{ MySql = $mysql; Redis = $redis }
}

function Invoke-InstallApk([ValidateSet('usb','wifi')][string]$Mode, $Device = $null) {
  if (-not $Device) { $Device = Select-AdbDevice -AlwaysPrompt }
  $apkName = "locamais-debug-$Mode.apk"
  $apkPath = Join-Path $script:ApkDirectory $apkName
  if (-not (Test-Path -LiteralPath $apkPath -PathType Leaf)) { throw "APK não encontrado: $apkPath. Compile o modo correspondente primeiro." }
  if ($Mode -eq 'usb') { Ensure-AdbReverse $Device }
  $result = Invoke-Adb @('-s',$Device.Serial,'install','-r',$apkPath)
  Write-PanelLine $result.Output Green
  $null = Invoke-Adb @('-s',$Device.Serial,'shell','monkey','-p','com.locamais.app','1')
  Write-Status 'Instalação' OK "$apkName instalado e iniciado em $($Device.Serial)"
}

function Invoke-UsbConnect {
  $script:AdbPath = Get-ADBPath
  if (-not $script:AdbPath) { throw 'ADB não encontrado. Instale Android SDK Platform Tools.' }
  Write-Status 'ADB' OK $script:AdbPath
  $device = Select-AdbDevice -RequireUsb -AlwaysPrompt
  Write-Status 'Dispositivo' OK "$($device.Serial) autorizado"
  Ensure-AdbReverse $device
  $deps = Test-Dependencies
  if (-not $deps.MySql) { throw 'MySQL não está disponível; API não iniciada.' }
  if (-not $deps.Redis) { Write-Status 'Memurai/Redis' WARN 'a API pode não iniciar corretamente sem cache disponível' }
  $null = Start-ControlledApi
  if (-not (Test-ApiHttps 'localhost')) { throw 'Validação HTTPS local falhou.' }
  Write-Status 'Conexão USB' OK 'encaminhamento ativo e API HTTPS validada'
  Write-Status 'Comunicação física' INFO 'o diagnóstico local não substitui teste funcional no celular'
}

function Invoke-WifiConnect {
  $script:AdbPath = Get-ADBPath
  if (-not $script:AdbPath) { throw 'ADB não encontrado. Instale Android SDK Platform Tools.' }
  $device = Select-AdbDevice -AlwaysPrompt
  $adapters = @(Get-HotspotAdapters)
  if (-not $adapters.Count) { throw 'Nenhum adaptador ativo com IPv4 não-loopback foi encontrado.' }
  if (-not @($adapters | Where-Object HotspotHint).Count) {
    Write-Status 'Hotspot do notebook' WARN 'não identifiquei um adaptador dedicado de Mobile Hotspot; os endereços listados podem ser da rede Wi-Fi normal. Só prossiga se o celular estiver na mesma rede.'
  }
  Write-PanelLine 'Adaptadores e IPv4 ativos candidatos:' Cyan
  for ($i = 0; $i -lt $adapters.Count; $i++) {
    $kind = if ($adapters[$i].HotspotHint) { 'hotspot' } else { 'rede normal/candidata' }
    Write-PanelLine "[$($i + 1)] $($adapters[$i].InterfaceAlias) — $($adapters[$i].IPv4) ($kind; $($adapters[$i].InterfaceDescription))" Gray
  }
  $selection = Read-Host 'Selecione o IPv4 do hotspot após conferir a rede do celular'
  $index = 0
  if (-not [int]::TryParse($selection, [ref]$index) -or $index -lt 1 -or $index -gt $adapters.Count) { throw 'Seleção de adaptador inválida.' }
  $adapter = $adapters[$index - 1]
  $confirm = Read-Host "Confirmar IP $($adapter.IPv4) para o hotspot? [S/N]"
  if ($confirm -notmatch '^(?i)s$') { Write-Status 'Hotspot' WARN 'operação cancelada'; return }
  $route = Invoke-Adb @('-s',$device.Serial,'shell','ip','route','get',$adapter.IPv4) -AllowFailure
  $phoneIp = if ($route.ExitCode -eq 0) { Get-AdbRouteSourceAddress $route.Output } else { $null }
  if (-not $phoneIp) { throw 'Não consegui identificar o IP de rede do celular pela rota. Confirme que o telefone está conectado à rede selecionada e que o dispositivo ADB está online.' }
  Write-Status 'IP do servidor (notebook)' INFO $adapter.IPv4
  Write-Status 'IP do celular' INFO $phoneIp
  if (-not (Test-IPv4SameSubnet $adapter.IPv4 $phoneIp $adapter.PrefixLength)) {
    throw "Celular ($phoneIp) e notebook ($($adapter.IPv4)) não estão na mesma sub-rede /$($adapter.PrefixLength). Conecte o celular à rede correta; ADB Wi-Fi sozinho não dá acesso de rede ao servidor."
  }
  Write-Status 'Rede do celular e notebook' OK "mesma sub-rede /$($adapter.PrefixLength)"

  $metaPath = Join-Path $script:ApkDirectory 'locamais-debug-wifi.json'
  $matches = $false
  if (Test-Path -LiteralPath $metaPath) { $matches = Test-WifiApkMatchesIp (Get-Content -LiteralPath $metaPath -Raw) $adapter.IPv4 }
  if (-not $matches) {
    Write-Status 'APK Hotspot' WARN 'ausente ou compilado para outro IP'
    if (-not (Test-PresentationCertificateIp $adapter.IPv4)) {
      throw "O certificado HTTPS de apresentação não cobre o IP $($adapter.IPv4). A compilação seria rejeitada pelo SAN TLS. Ative o hotspot correto ou reemita o certificado de apresentação para este IP pela rotina segura do projeto antes de compilar."
    }
    $rebuild = Read-Host 'Recompilar com o IP confirmado? [S/N]'
    if ($rebuild -match '^(?i)s$') {
      $env:LOCAMAIS_HOTSPOT_IP = $adapter.IPv4
      $env:ANDROID_HOME = Join-Path $env:LOCALAPPDATA 'Android\Sdk'
      $env:ANDROID_SDK_ROOT = $env:ANDROID_HOME
      $npm = Get-Command npm.cmd -ErrorAction SilentlyContinue
      if (-not $npm) { $npm = Get-Command npm -ErrorAction Stop }
      Push-Location $script:FrontendRoot
      try { & $npm.Source run android:build:wifi; if ($LASTEXITCODE -ne 0) { throw "Build Wi-Fi falhou com código $LASTEXITCODE." } } finally { Pop-Location }
      $matches = (Test-Path -LiteralPath $metaPath) -and (Test-WifiApkMatchesIp (Get-Content -LiteralPath $metaPath -Raw) $adapter.IPv4)
      if (-not $matches) { throw 'APK recompilado não declara o IP de hotspot selecionado.' }
    } else { throw 'APK Hotspot precisa ser compilado para o IP atual antes da instalação.' }
  } else { Write-Status 'APK Hotspot' OK "corresponde a $($adapter.IPv4)" }

  $deps = Test-Dependencies
  if (-not $deps.MySql) { throw 'MySQL não está disponível; API não iniciada.' }
  if (-not $deps.Redis) { Write-Status 'Memurai/Redis' WARN 'a API pode não iniciar corretamente sem cache disponível' }
  $null = Start-ControlledApi
  $portReachable = Test-TcpPort $adapter.IPv4 3000 1800
  if (-not $portReachable) { throw "Notebook não aceita conexão TCP em $($adapter.IPv4):3000. Verifique perfil/regras do Firewall do Windows; a central não altera firewall." }
  if (-not (Test-ApiHttps $adapter.IPv4)) { throw "HTTPS estrito falhou em https://$($adapter.IPv4):3000/api. Verifique SAN/CA do certificado e URL gravada no APK; nenhuma validação TLS foi desativada." }
  $install = Read-Host 'Instalar o APK Hotspot no celular agora? [S/N]'
  if ($install -match '^(?i)s$') { Invoke-InstallApk wifi $device }
  Write-Status 'Hotspot' OK "API HTTPS ativa em https://$($adapter.IPv4):3000/api"
  Write-Status 'Conexão física' INFO 'teste de login/dados no aparelho ainda precisa ser feito manualmente'
}

function Show-Diagnostics {
  $script:AdbPath = Get-ADBPath
  if ($script:AdbPath) {
    Write-Status 'ADB instalado' OK $script:AdbPath
    try {
      $devices = @(Get-AdbDevices)
      $online = @($devices | Where-Object State -eq 'device')
      $usbOnline = @($online | Where-Object { Test-UsbAdbDevice $_ })
      $unauth = @($devices | Where-Object State -eq 'unauthorized')
      if ($online.Count) { Write-Status 'Dispositivo Android conectado' OK (($online | ForEach-Object Serial) -join ', ') } else { Write-Status 'Dispositivo Android conectado' WARN 'nenhum autorizado/disponível' }
      if ($unauth.Count) { Write-Status 'Autorização USB' WARN (($unauth | ForEach-Object Serial) -join ', ') } elseif ($usbOnline.Count) { Write-Status 'Autorização USB' OK 'dispositivo USB autorizado' } else { Write-Status 'Autorização USB' WARN 'nenhum dispositivo USB autorizado (pode haver ADB por Wi-Fi)' }
      foreach ($device in $devices | Where-Object { $_.State -ne 'device' }) {
        $label = if ($device.State -eq 'offline') { 'Dispositivo offline' } else { 'Dispositivo não autorizado' }
        Write-Status $label WARN "$($device.Serial): $($device.State)"
      }
      $tcpDevices = @($online | Where-Object { ConvertFrom-AdbTcpEndpoint $_.Serial })
      if ($tcpDevices.Count) { Write-Status 'ADB Wi-Fi' OK (($tcpDevices | ForEach-Object Serial) -join ', ') } else { Write-Status 'ADB Wi-Fi' WARN 'nenhuma conexão TCP/IP ativa' }
      foreach ($device in $online) {
        $mapping = Invoke-Adb @('-s',$device.Serial,'reverse','--list') -AllowFailure
        if ($mapping.Output -match '(?m)\btcp:3000\s+tcp:3000\s*$') { Write-Status 'Configuração de conexão USB' OK "$($device.Serial): reverse tcp:3000 ativo"; break }
      }
      if (-not ($online | Where-Object { (Invoke-Adb @('-s',$_.Serial,'reverse','--list') -AllowFailure).Output -match '(?m)\btcp:3000\s+tcp:3000\s*$' })) { Write-Status 'Configuração de conexão USB' WARN 'ADB Reverse não encontrado' }
    } catch { Write-Status 'Dispositivos Android' FAIL $_.Exception.Message }
  } else { Write-Status 'ADB instalado' FAIL 'SDK Platform Tools não encontrados' }

  $deps = Test-Dependencies
  if (Test-ApiHttps 'localhost') { Write-Status 'API em execução' OK 'HTTPS localhost:3000 responde' } else { Write-Status 'API em execução' WARN 'HTTPS localhost:3000 não responde' }
  $owners = @(Get-ApiPortOwner)
  if ($owners.Count) { Write-Status 'Porta 3000' WARN "ocupada pelos PID(s): $($owners -join ', ')" } else { Write-Status 'Porta 3000' OK 'livre' }
  $hotspots = @()
  try { $hotspots = @(Get-HotspotAdapters) } catch { }
  if ($hotspots.Count) {
    $dedicated = @($hotspots | Where-Object HotspotHint)
    if ($dedicated.Count) { Write-Status 'Adaptador Hotspot' OK (($dedicated | ForEach-Object { "$($_.InterfaceAlias)=$($_.IPv4)" }) -join '; ') }
    else { Write-Status 'Adaptador Hotspot' WARN 'nenhum adaptador dedicado identificado; os IPs abaixo podem pertencer à rede Wi-Fi normal' }
    foreach ($adapter in $hotspots) {
      $certOk = Test-PresentationCertificateIp $adapter.IPv4
      Write-Status "IP servidor $($adapter.InterfaceAlias)" $(if ($certOk) { 'OK' } else { 'WARN' }) "$($adapter.IPv4); certificado $(if ($certOk) { 'cobre este IP' } else { 'não cobre este IP' })"
    }
  } else { Write-Status 'IP do hotspot' WARN 'nenhum IPv4 ativo detectado' }
  $wifiState = Get-ControlState
  if ($wifiState.KnownWifiEndpoints.Count) { Write-Status 'Endereços ADB Wi-Fi salvos' INFO (($wifiState.KnownWifiEndpoints) -join ', ') }
  foreach ($mode in @('usb','wifi')) {
    $apk = Join-Path $script:ApkDirectory "locamais-debug-$mode.apk"
    Write-Status "APK $mode" $(if (Test-Path -LiteralPath $apk) { 'OK' } else { 'WARN' }) $(if (Test-Path -LiteralPath $apk) { $apk } else { 'não encontrado' })
  }
}

function Invoke-InstallMenu {
  Write-PanelLine '[1] APK USB' Cyan
  Write-PanelLine '[2] APK Hotspot' Cyan
  $selection = Read-Host 'Selecione'
  switch ($selection) {
    '1' { Invoke-InstallApk usb }
    '2' { Invoke-InstallApk wifi }
    default { Write-Status 'Instalação' WARN 'opção inválida; instalação cancelada' }
  }
}

function Show-MainMenu {
  while ($true) {
    Clear-Host
    Write-PanelLine '========================================' DarkCyan
    Write-PanelLine '     LOCA MAIS — CENTRAL DE CONTROLE' Cyan
    Write-PanelLine '========================================' DarkCyan
    Write-PanelLine 'DIAGNÓSTICO:' Yellow
    $script:AdbPath = Get-ADBPath
    Write-Status 'ADB instalado' $(if ($script:AdbPath) { 'OK' } else { 'FAIL' }) $(if ($script:AdbPath) { 'disponível' } else { 'não encontrado' })
    $devices = @(); if ($script:AdbPath) { try { $devices = @(Get-AdbDevices) } catch { } }
    $online = @($devices | Where-Object State -eq 'device')
    $usbOnline = @($online | Where-Object { Test-UsbAdbDevice $_ })
    $tcpDevices = @($online | Where-Object { ConvertFrom-AdbTcpEndpoint $_.Serial })
    Write-Status 'Dispositivo Android conectado' $(if ($online.Count) { 'OK' } else { 'WARN' }) $(if ($online.Count) { "$($online.Count) autorizado(s)" } else { 'não detectado' })
    Write-Status 'ADB por Wi-Fi' $(if ($tcpDevices.Count) { 'OK' } else { 'WARN' }) $(if ($tcpDevices.Count) { ($tcpDevices.Serial -join ', ') } else { 'sem sessão; pareie ou reconecte no menu' })
    $unauthorized = @($devices | Where-Object State -eq 'unauthorized')
    Write-Status 'Autorização USB' $(if ($unauthorized.Count) { 'WARN' } elseif ($usbOnline.Count) { 'OK' } else { 'WARN' }) $(if ($unauthorized.Count) { 'aceite a chave RSA' } elseif ($usbOnline.Count) { 'dispositivo USB autorizado' } elseif ($online.Count) { 'ADB está conectado por Wi-Fi, não por USB' } else { 'aguardando celular' })
    $mysql = Test-TcpPort '127.0.0.1' 3306; $redis = Test-TcpPort '127.0.0.1' 6379
    Write-Status 'MySQL disponível' $(if ($mysql) { 'OK' } else { 'FAIL' }) $(if ($mysql) { '3306' } else { '3306 sem resposta' })
    Write-Status 'Memurai/Redis disponível' $(if ($redis) { 'OK' } else { 'WARN' }) $(if ($redis) { '6379' } else { '6379 sem resposta' })
    $api = Test-ApiHttps 'localhost'; Write-Status 'API em execução' $(if ($api) { 'OK' } else { 'WARN' }) $(if ($api) { 'HTTPS' } else { 'indisponível' })
    $portFree = @(Get-ApiPortOwner).Count -eq 0
    Write-Status 'Porta 3000 disponível' $(if ($api) { 'OK' } elseif ($portFree) { 'OK' } else { 'WARN' }) $(if ($api) { 'API HTTPS ativa' } elseif ($portFree) { 'livre' } else { 'ocupada por processo existente' })
    Write-Host ''
    Write-PanelLine 'MENU:' Yellow
    Write-PanelLine '[1] Conectar por USB' Gray
    Write-PanelLine '[2] Parear celular por ADB Wi-Fi' Gray
    Write-PanelLine '[3] Reconectar celular por ADB Wi-Fi' Gray
    Write-PanelLine '[4] Conectar pelo Hotspot' Gray
    Write-PanelLine '[5] Instalar APK' Gray
    Write-PanelLine '[6] Iniciar API' Gray
    Write-PanelLine '[7] Diagnóstico completo' Gray
    Write-PanelLine '[8] Gerenciar dispositivos conectados' Gray
    Write-PanelLine '[9] Desconectar' Gray
    Write-PanelLine '[0] Sair' Gray
    $choice = Read-Host 'Opção'
    try {
      switch ($choice) {
        '1' { Invoke-UsbConnect; [void](Read-Host 'Enter para continuar') }
        '2' { Invoke-AdbWifiPairing; [void](Read-Host 'Enter para continuar') }
        '3' { Invoke-AdbWifiReconnect; [void](Read-Host 'Enter para continuar') }
        '4' { Invoke-WifiConnect; [void](Read-Host 'Enter para continuar') }
        '5' { Invoke-InstallMenu; [void](Read-Host 'Enter para continuar') }
        '6' { Invoke-ApiStartMenu; [void](Read-Host 'Enter para continuar') }
        '7' { Show-Diagnostics; [void](Read-Host 'Enter para continuar') }
        '8' { Invoke-DeviceManagement }
        '9' { Invoke-AdbWifiDisconnect; [void](Read-Host 'Enter para continuar') }
        '0' { return }
        default { Write-Status 'Menu' WARN 'opção inválida'; Start-Sleep -Seconds 1 }
      }
    } catch {
      Write-Status 'Erro' FAIL $_.Exception.Message
      [void](Read-Host 'Enter para continuar')
    }
  }
}

if (-not $NoMenu) { Show-MainMenu }
