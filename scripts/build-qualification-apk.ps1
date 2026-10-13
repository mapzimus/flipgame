# Builds a separate, debug-signed offline app without publishing a release.
param(
    [Parameter(Mandatory)][string]$JavaHome,
    [Parameter(Mandatory)][string]$AndroidSdk,
    [Parameter(Mandatory)][string]$GradlePath,
    [Parameter(Mandatory)][string]$OutputDirectory
)
$ErrorActionPreference = 'Stop'
$repoPath = Split-Path $PSScriptRoot -Parent
Push-Location $repoPath
try {
    if (git status --porcelain) { throw 'Commit source changes before building an attributable qualification APK.' }
    $sourceCommit = git rev-parse HEAD
    $releaseVersion = node -p "require('./js/v111-interfaces.js').RELEASE_VERSION"
    if ($LASTEXITCODE) { throw 'Cannot read release metadata.' }
    $runtimeFiles = @(git ls-files index.html css js data icons manifest.json)
    if ($LASTEXITCODE -or !$runtimeFiles.Count) { throw 'Cannot enumerate tracked runtime assets.' }
    $assetDirectory = Join-Path $repoPath 'android/app/src/main/assets'
    New-Item -ItemType Directory -Force -Path $assetDirectory | Out-Null
    foreach ($relativePath in $runtimeFiles) {
        $destination = Join-Path $assetDirectory $relativePath
        New-Item -ItemType Directory -Force -Path (Split-Path $destination -Parent) | Out-Null
        Copy-Item -LiteralPath (Join-Path $repoPath $relativePath) -Destination $destination -Force
    }
    $metadata = @{sourceCommit=$sourceCommit; releaseVersion=$releaseVersion; qualificationBuild=$true; buildType='debug'}
    $metadata | ConvertTo-Json | Set-Content -LiteralPath (Join-Path $assetDirectory 'build-metadata.json') -Encoding utf8NoBOM
    $drawableDirectory = Join-Path $repoPath 'android/app/src/main/res/drawable'
    New-Item -ItemType Directory -Force -Path $drawableDirectory | Out-Null
    Copy-Item -LiteralPath (Join-Path $repoPath 'icons/icon-512.png') -Destination (Join-Path $drawableDirectory 'ic_launcher.png') -Force

    $previousJavaHome = $env:JAVA_HOME
    $previousAndroidHome = $env:ANDROID_HOME
    $previousAndroidSdkRoot = $env:ANDROID_SDK_ROOT
    try {
        $env:JAVA_HOME = $JavaHome
        $env:ANDROID_HOME = $AndroidSdk
        $env:ANDROID_SDK_ROOT = $AndroidSdk
        Push-Location (Join-Path $repoPath 'android')
        try {
            & $GradlePath assembleDebug --no-daemon --console=plain
            if ($LASTEXITCODE) { throw 'Gradle qualification build failed.' }
        } finally { Pop-Location }
        $apkPath = Join-Path $repoPath 'android/app/build/outputs/apk/debug/app-debug.apk'
        $zip = [System.IO.Compression.ZipFile]::OpenRead($apkPath)
        try {
            foreach ($relativePath in $runtimeFiles) {
                $entry = $zip.GetEntry('assets/' + $relativePath)
                if (!$entry) { throw "APK omits $relativePath" }
                $stream = $entry.Open()
                try { $actualHash = [Convert]::ToHexString([System.Security.Cryptography.SHA256]::HashData($stream)) }
                finally { $stream.Dispose() }
                $expectedHash = (Get-FileHash -LiteralPath (Join-Path $repoPath $relativePath) -Algorithm SHA256).Hash
                if ($actualHash -ne $expectedHash) { throw "APK has stale or altered bytes: $relativePath" }
            }
            $expectedEntries = @($runtimeFiles | ForEach-Object { 'assets/' + $_ }) + 'assets/build-metadata.json'
            $extraEntries = @($zip.Entries | Where-Object { $_.FullName.StartsWith('assets/') -and $_.Name -and $_.FullName -notin $expectedEntries })
            if ($extraEntries.Count) { throw "APK includes stale assets: $($extraEntries.FullName -join ', ')" }
            $reader = [System.IO.StreamReader]::new($zip.GetEntry('assets/build-metadata.json').Open())
            try { $packagedMetadata = $reader.ReadToEnd() | ConvertFrom-Json }
            finally { $reader.Dispose() }
            if ($packagedMetadata.sourceCommit -ne $sourceCommit -or !$packagedMetadata.qualificationBuild -or $packagedMetadata.releaseVersion -ne $releaseVersion) { throw 'APK source metadata differs.' }
        } finally { $zip.Dispose() }
        # Ensure files were not edited while Gradle was building them.
        if ((git status --porcelain) -or (git rev-parse HEAD) -ne $sourceCommit) { throw 'Source changed during the build.' }
        $buildTools = Get-ChildItem -LiteralPath (Join-Path $AndroidSdk 'build-tools') -Directory | Sort-Object { [version]$_.Name } | Select-Object -Last 1
        if (!$buildTools) { throw 'Android build-tools are missing.' }
        $signature = & (Join-Path $buildTools.FullName 'apksigner.bat') verify --verbose --print-certs $apkPath
        if ($LASTEXITCODE) { throw 'APK signature verification failed.' }
        $badging = & (Join-Path $buildTools.FullName 'aapt.exe') dump badging $apkPath
        if ($LASTEXITCODE -or !($badging -match "package: name='com.mapzimus.flipgame.qualification'")) { throw 'APK does not have the separate qualification app ID.' }
        if (!($badging -match "versionName='.*-qualification'")) { throw 'APK qualification version suffix is missing.' }
        New-Item -ItemType Directory -Force -Path $OutputDirectory | Out-Null
        $outputApk = Join-Path $OutputDirectory 'flipgame-qualification.apk'
        Copy-Item -LiteralPath $apkPath -Destination $outputApk -Force
        $apkHash = (Get-FileHash -LiteralPath $outputApk -Algorithm SHA256).Hash.ToLowerInvariant()
        "$apkHash  flipgame-qualification.apk" | Set-Content -LiteralPath (Join-Path $OutputDirectory 'flipgame-qualification.apk.sha256') -Encoding utf8NoBOM
        $signature | Set-Content -LiteralPath (Join-Path $OutputDirectory 'qualification-signature.txt') -Encoding utf8NoBOM
        $badging | Set-Content -LiteralPath (Join-Path $OutputDirectory 'qualification-badging.txt') -Encoding utf8NoBOM
        @{
            sourceCommit=$sourceCommit; releaseVersion=$releaseVersion; buildType='debug';
            applicationId='com.mapzimus.flipgame.qualification'; apkSha256=$apkHash;
            matchedRuntimeFiles=$runtimeFiles.Count; extraAssets=0; signatureVerified=$true;
            deviceExecutionVerified=$false
        } | ConvertTo-Json | Set-Content -LiteralPath (Join-Path $OutputDirectory 'qualification-apk-report.json') -Encoding utf8NoBOM
        Write-Output "Verified $($runtimeFiles.Count) runtime assets; qualification APK: $outputApk"
    } finally {
        $env:JAVA_HOME = $previousJavaHome
        $env:ANDROID_HOME = $previousAndroidHome
        $env:ANDROID_SDK_ROOT = $previousAndroidSdkRoot
    }
} finally { Pop-Location }
