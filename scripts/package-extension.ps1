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
$checksumPath = "$archivePath.sha256"

if ([IO.Path]::GetDirectoryName($archivePath) -ne $artifactPath) {
    throw 'Refusing to package outside the project artifact directory.'
}

New-Item -ItemType Directory -Path $artifactPath -Force | Out-Null
if (Test-Path -LiteralPath $archivePath) {
    Remove-Item -LiteralPath $archivePath -Force
}
if (Test-Path -LiteralPath $checksumPath) {
    Remove-Item -LiteralPath $checksumPath -Force
}

Add-Type -AssemblyName System.IO.Compression
Add-Type -AssemblyName System.IO.Compression.FileSystem

$fixedTimestamp = [DateTimeOffset]::new(1980, 1, 1, 0, 0, 0, [TimeSpan]::Zero)
$archiveStream = [IO.File]::Open(
    $archivePath,
    [IO.FileMode]::CreateNew,
    [IO.FileAccess]::Write,
    [IO.FileShare]::None
)
try {
    $archive = [IO.Compression.ZipArchive]::new(
        $archiveStream,
        [IO.Compression.ZipArchiveMode]::Create,
        $false
    )
    try {
        $files = Get-ChildItem -LiteralPath $distPath -File -Recurse |
            Sort-Object { $_.FullName.Substring($distPath.Length + 1) }
        foreach ($file in $files) {
            $relativeName = $file.FullName.Substring($distPath.Length + 1).Replace('\', '/')
            $entry = $archive.CreateEntry($relativeName, [IO.Compression.CompressionLevel]::Optimal)
            $entry.LastWriteTime = $fixedTimestamp
            $entryStream = $entry.Open()
            $sourceStream = [IO.File]::OpenRead($file.FullName)
            try {
                $sourceStream.CopyTo($entryStream)
            } finally {
                $sourceStream.Dispose()
                $entryStream.Dispose()
            }
        }
    } finally {
        $archive.Dispose()
    }
} finally {
    $archiveStream.Dispose()
}

$sha256 = [Security.Cryptography.SHA256]::Create()
$stream = [IO.File]::OpenRead($archivePath)
try {
    $hashBytes = $sha256.ComputeHash($stream)
} finally {
    $stream.Dispose()
    $sha256.Dispose()
}
$hash = ([BitConverter]::ToString($hashBytes)).Replace('-', '').ToLowerInvariant()
[IO.File]::WriteAllText(
    $checksumPath,
    "$hash  $archiveName`n",
    [Text.UTF8Encoding]::new($false)
)

[pscustomobject]@{
    Artifact = $archivePath
    Checksum = $checksumPath
    Bytes = (Get-Item -LiteralPath $archivePath).Length
    SHA256 = $hash
} | Format-List
