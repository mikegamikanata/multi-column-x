<#
.SYNOPSIS  実施前後のアプリデータ退避・復元・比較。
.DESCRIPTION
  対象: %APPDATA%\com.natsuyasai.multicolumnx（settings.json・アカウントごとのデータ）と
        %LOCALAPPDATA%\com.natsuyasai.multicolumnx（メイン UI の EBWebView）。
  Act:
    backup            （2 分以上かかることがある。タイムアウトを長めに）両方を -Dir 配下へ robocopy でコピー（アプリを止めた状態で実行）
    diff              退避時と現在の settings.json を意味比較（キー順・数値表記は無視。差分があればキーのパスを表示し終了コード 1）。
                      アプリが終了時に書く windowBounds を除外したいときは -IgnoreWindowBounds
    restore-settings  退避した settings.json だけを書き戻す（アプリ終了後に実行）
    restore-all       データ全体を退避時の状態へミラーリング（破壊的。アプリ終了後・必要時のみ）
.EXAMPLE   .\win-appdata.ps1 backup -Dir $env:TEMP\mcx-backup
#>
param(
  [Parameter(Position = 0, Mandatory)][ValidateSet('backup', 'diff', 'restore-settings', 'restore-all')][string]$Act,
  [Parameter(Mandatory)][string]$Dir,
  [string]$Identifier = 'com.natsuyasai.multicolumnx',
  [switch]$IgnoreWindowBounds   # diff で windowBounds を比較対象から外す
)
$roam = Join-Path $env:APPDATA $Identifier
$local = Join-Path $env:LOCALAPPDATA $Identifier
$bRoam = Join-Path $Dir 'roaming'
$bLocal = Join-Path $Dir 'local'
function Copy-Dir($src, $dst, [switch]$Mirror) {
  if (-not (Test-Path $src)) { return }
  $opt = if ($Mirror) { '/MIR' } else { '/E' }
  robocopy $src $dst $opt /NFL /NDL /NJH /NJS /NP | Out-Null
  if ($LASTEXITCODE -ge 8) { throw "robocopy 失敗 ($LASTEXITCODE): $src -> $dst" }
}
switch ($Act) {
  'backup' {
    if (Get-Process multicolumnx -ErrorAction SilentlyContinue) { Write-Warning 'アプリが起動中です。終了してから退避するのが安全です' }
    New-Item -ItemType Directory -Force -Path $Dir | Out-Null
    Copy-Dir $roam $bRoam; Copy-Dir $local $bLocal
    "backup -> $Dir"
  }
  'diff' {
    # JSON の意味比較は node（json-diff.cjs）で行う。PowerShell の ConvertTo-Json はキー順・数値表記が変わりうる
    $ig = if ($IgnoreWindowBounds) { '--ignore=windowBounds' } else { '--ignore=' }
    node (Join-Path $PSScriptRoot 'json-diff.cjs') (Join-Path $bRoam 'settings.json') (Join-Path $roam 'settings.json') $ig
    if ($LASTEXITCODE -ne 0) { exit 1 }
  }
  'restore-settings' {
    if (Get-Process multicolumnx -ErrorAction SilentlyContinue) { throw 'アプリが起動中です。終了してから復元してください' }
    Copy-Item (Join-Path $bRoam 'settings.json') (Join-Path $roam 'settings.json') -Force
    'settings.json を復元しました'
  }
  'restore-all' {
    if (Get-Process multicolumnx -ErrorAction SilentlyContinue) { throw 'アプリが起動中です。終了してから復元してください' }
    Copy-Dir $bRoam $roam -Mirror; Copy-Dir $bLocal $local -Mirror
    'データ全体を復元しました'
  }
}
