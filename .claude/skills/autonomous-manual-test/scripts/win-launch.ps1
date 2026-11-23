<#
.SYNOPSIS  Windows ビルド版を WebView2 の CDP 有効で起動し、PID を標準出力に出す。
.EXAMPLE   .\win-launch.ps1 -Exe src-tauri\target\release\multicolumnx.exe
#>
param(
  [Parameter(Mandatory)][string]$Exe,
  [string]$PidFile = ''   # 指定すると PID をそのファイルにも書く
)
$ErrorActionPreference = 'Stop'
if (-not (Test-Path $Exe)) { throw "exe が見つかりません: $Exe" }
# port=0 で空きポートを自動採用する。ポートは各データディレクトリの EBWebView\DevToolsActivePort に書かれる
$env:WEBVIEW2_ADDITIONAL_BROWSER_ARGUMENTS = '--remote-debugging-port=0'
$p = Start-Process -FilePath (Resolve-Path $Exe) -PassThru
if ($PidFile) { Set-Content -Path $PidFile -Value $p.Id }
$p.Id
