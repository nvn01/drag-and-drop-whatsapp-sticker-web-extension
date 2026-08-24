$ErrorActionPreference = 'Stop'

$projectRoot = [IO.Path]::GetFullPath((Join-Path $PSScriptRoot '..'))
$distPath = [IO.Path]::GetFullPath((Join-Path $projectRoot 'dist'))
$artifactPath = [IO.Path]::GetFullPath((Join-Path $projectRoot '.artifacts'))
$manifestPath = Join-Path $distPath 'manifest.json'

if (-not (Test-Path -LiteralPath $manifestPath)) {
    throw 'Verified dist manifest is missing. Run npm run verify first.'
}

$manifest = Get-Content -Raw -LiteralPath $manifestPath | ConvertFrom-Json
$archiveName = "whatsapp-sticker-plugin-$($manifest.version).zip"
$archivePath = [IO.Path]::GetFullPath((Join-Path $artifactPath $archiveName))

if ([IO.Path]::GetDirectoryName($archivePath) -ne $artifactPath) {
    throw 'Refusing to package outside the project artifact directory.'
}

New-Item -ItemType Directory -Path $artifactPath -Force | Out-Null
if (Test-Path -LiteralPath $archivePath) {
    Remove-Item -LiteralPath $archivePath -Force
}

Compress-Archive -Path (Join-Path $distPath '*') -DestinationPath $archivePath -CompressionLevel Optimal
$sha256 = [Security.Cryptography.SHA256]::Create()
$stream = [IO.File]::OpenRead($archivePath)
try {
    $hashBytes = $sha256.ComputeHash($stream)
} finally {
    $stream.Dispose()
    $sha256.Dispose()
}
$hash = ([BitConverter]::ToString($hashBytes)).Replace('-', '').ToLowerInvariant()

[pscustomobject]@{
    Artifact = $archivePath
    Bytes = (Get-Item -LiteralPath $archivePath).Length
    SHA256 = $hash
} | Format-List
