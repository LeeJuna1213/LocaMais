$ErrorActionPreference = 'Stop'
. (Join-Path (Split-Path $PSScriptRoot -Parent) 'locamais-control-panel.ps1') -NoMenu

Describe 'LocaMais Control Panel helpers' {
  It 'parses authorized and unauthorized ADB devices separately' {
    $devices = ConvertFrom-AdbDevicesOutput "List of devices attached`nusb-1 device product:x`nusb-2 unauthorized usb:1`n"
    @($devices | Where-Object State -eq 'device').Count | Should Be 1
    @($devices | Where-Object State -eq 'unauthorized').Count | Should Be 1
  }

  It 'distinguishes an ADB Wi-Fi transport from a physical USB transport' {
    (Test-UsbAdbDevice ([pscustomobject]@{ Serial = 'adb-123._adb-tls-connect._tcp'; Description = '' })) | Should Be $false
    (Test-UsbAdbDevice ([pscustomobject]@{ Serial = 'USB123'; Description = 'product:model transport_id:1' })) | Should Be $true
    (Get-AdbConnectionType ([pscustomobject]@{ Serial = 'adb-123._adb-tls-connect._tcp'; Description = '' })) | Should Be 'TCP/IP'
    (Get-AdbConnectionType ([pscustomobject]@{ Serial = '192.168.43.10:5555'; Description = '' })) | Should Be 'TCP/IP'
  }

  It 'finds a current IPv4 address without assuming a fixed hotspot subnet' {
    $ip = Get-IPv4FromAddress '192.168.43.1/24'
    $ip | Should Be '192.168.43.1'
  }

  It 'detects an APK metadata endpoint mismatch' {
    (Test-WifiApkMatchesIp '{"apiUrl":"https://192.168.137.1:3000/api"}' '192.168.43.1') | Should Be $false
  }

  It 'accepts the APK metadata endpoint when its IP matches' {
    (Test-WifiApkMatchesIp '{"apiUrl":"https://192.168.43.1:3000/api"}' '192.168.43.1') | Should Be $true
  }

  It 'does not treat arbitrary processes as managed API processes' {
    (Test-ManagedApiCommandLine 'node.exe other-project\\api\\dist\\main.js') | Should Be $false
    (Test-ManagedApiCommandLine "powershell.exe -File `"$script:ApiLauncher`"") | Should Be $true
  }

  It 'validates IPv4 addresses and ports before invoking ADB' {
    (Test-IPv4Address '192.168.43.10') | Should Be $true
    (Test-IPv4Address '999.1.1.1') | Should Be $false
    (Test-IPv4Address '192.168.1') | Should Be $false
    (Test-AdbPort '37123') | Should Be $true
    (Test-AdbPort '0') | Should Be $false
    (Test-AdbPort 'abc') | Should Be $false
    (Test-AdbPairingCode '001234') | Should Be $true
    (Test-AdbPairingCode '12345') | Should Be $false
    (Test-AdbPairingCode '12345x') | Should Be $false
  }

  It 'parses Wi-Fi ADB endpoints without confusing them with a phone IP alone' {
    $endpoint = ConvertFrom-AdbTcpEndpoint '192.168.43.10:37123'
    $endpoint.Host | Should Be '192.168.43.10'
    $endpoint.Port | Should Be 37123
    (ConvertFrom-AdbTcpEndpoint '192.168.43.10') | Should Be $null
  }

  It 'requires ADB confirmation before reporting that pairing succeeded' {
    (Test-AdbPairSucceeded 0 'Successfully paired to 192.168.43.10:37123') | Should Be $true
    (Test-AdbPairSucceeded 0 'already paired to 192.168.43.10:37123') | Should Be $true
    (Test-AdbPairSucceeded 1 'error: pairing failed') | Should Be $false
    (Test-AdbPairSucceeded 0 'error: protocol fault (could not read status message)') | Should Be $false
  }

  It 'recognizes successful and failed ADB TCP connections' {
    (Test-AdbConnectSucceeded 0 'connected to 192.168.43.10:5555' '192.168.43.10:5555') | Should Be $true
    (Test-AdbConnectSucceeded 0 'cannot connect to 192.168.43.10:5555' '192.168.43.10:5555') | Should Be $false
    (Test-AdbConnectSucceeded 1 'failed to connect' '192.168.43.10:5555') | Should Be $false
  }

  It 'checks whether phone and notebook IPv4 addresses share the selected subnet' {
    (Test-IPv4SameSubnet '192.168.43.1' '192.168.43.20' 24) | Should Be $true
    (Test-IPv4SameSubnet '192.168.43.1' '192.168.44.20' 24) | Should Be $false
    (Test-IPv4SameSubnet '192.168.32.1' '192.168.47.254' 20) | Should Be $true
    (Test-IPv4SameSubnet 'bad' '192.168.1.2' 24) | Should Be $false
  }

  It 'extracts the phone source IP from an ADB route without confusing it with the server IP' {
    (Get-AdbRouteSourceAddress '192.168.43.1 dev wlan0 src 192.168.43.20 uid 2000') | Should Be '192.168.43.20'
    (Get-AdbRouteSourceAddress 'Network is unreachable') | Should Be $null
  }

  It 'resolves advertised wireless-debugging service endpoints from ADB mDNS output' {
    $services = ConvertFrom-AdbMdnsServices "List of discovered mdns services`nadb-abc._adb-tls-connect._tcp _adb-tls-connect._tcp 192.168.43.20:37123`n"
    $services['adb-abc._adb-tls-connect._tcp'].Endpoint | Should Be '192.168.43.20:37123'
    (Get-AdbDeviceNetworkEndpoint ([pscustomobject]@{ Serial = 'adb-abc._adb-tls-connect._tcp' }) $services).Endpoint | Should Be '192.168.43.20:37123'
  }

  It 'provides actionable pairing and connection errors without including pairing codes' {
    $pairError = Get-AdbPairFailureMessage 'error: pairing failed for temporary secret 123456'
    $pairError | Should Match 'Código de pareamento incorreto'
    $pairError | Should Not Match '123456'
    (Get-AdbPairFailureMessage 'error: protocol fault (could not read status message)') | Should Match 'porta de pareamento'
    (Get-AdbConnectFailureMessage 'failed to connect to device') | Should Match 'IP/porta podem ter mudado'
    (Get-AdbConnectFailureMessage 'device unauthorized') | Should Match 'não autorizado'
    (Get-AdbConnectFailureMessage 'device offline') | Should Match 'offline'
  }
}
