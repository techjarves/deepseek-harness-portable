[CmdletBinding()]
param([Parameter(ValueFromRemainingArguments = $true)][string[]]$Arguments)
$ErrorActionPreference = 'Stop'
$root = [IO.Path]::GetFullPath((Join-Path $PSScriptRoot '..'))
if (-not [Environment]::Is64BitOperatingSystem -or $env:PROCESSOR_ARCHITECTURE -notin @('AMD64','x86')) {
  throw 'Unsupported Windows CPU. Version 1 supports Windows x64 only.'
}
$runtime = Join-Path $root 'runtimes\windows-x64'
$node = Join-Path $runtime 'node\node.exe'
$archive = Join-Path $root 'packages\bootstrap\windows-x64\node.zip'
$url = 'https://nodejs.org/dist/v24.21.0/node-v24.21.0-win-x64.zip'
$hash = '158f7685b44de51f6c0df1d153526cbcd3e1bc739a8dfc607721cef75de9e541'

function Get-Sha256([string]$Path) {
  $stream = [IO.File]::OpenRead($Path)
  try {
    $sha = [Security.Cryptography.SHA256]::Create()
    try { return ([BitConverter]::ToString($sha.ComputeHash($stream))).Replace('-', '').ToLowerInvariant() }
    finally { $sha.Dispose() }
  }
  finally { $stream.Dispose() }
}

if (-not (Test-Path $node -PathType Leaf)) {
  Write-Host 'Preparing portable Node.js for windows-x64...'
  New-Item -ItemType Directory -Force -Path (Split-Path $archive), $runtime | Out-Null
  if (-not (Test-Path $archive -PathType Leaf)) {
    $partial = "$archive.part"
    Invoke-WebRequest -UseBasicParsing -Uri $url -OutFile $partial
    Move-Item -Force $partial $archive
  }
  if ((Get-Sha256 $archive) -ne $hash) {
    Move-Item -Force $archive "$archive.bad"
    throw 'Node.js checksum mismatch; the download was quarantined.'
  }
  $stage = Join-Path $root "temp\node-windows-x64-$PID"
  New-Item -ItemType Directory -Force -Path $stage | Out-Null
  Expand-Archive -LiteralPath $archive -DestinationPath $stage
  $extracted = Get-ChildItem -LiteralPath $stage -Directory | Select-Object -First 1
  if (-not $extracted -or -not (Test-Path (Join-Path $extracted.FullName 'node.exe'))) { throw 'Node.js archive has an unexpected layout.' }
  $new = Join-Path $runtime 'node.new'
  if (Test-Path $new) { Move-Item -Force $new (Join-Path $root "temp\old-node-new-$PID") }
  Move-Item $extracted.FullName $new
  if (Test-Path (Join-Path $runtime 'node')) { Move-Item (Join-Path $runtime 'node') (Join-Path $root "temp\old-node-$PID") }
  Move-Item $new (Join-Path $runtime 'node')
}

& $node (Join-Path $PSScriptRoot 'portable.mjs') --root $root --target windows-x64 @Arguments
exit $LASTEXITCODE
