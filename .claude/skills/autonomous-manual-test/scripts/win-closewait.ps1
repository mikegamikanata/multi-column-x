<#
.SYNOPSIS  主窓に WM_CLOSE を送り、アプリのプロセスが消えるまで待つ（強制終了はしない）。
.DESCRIPTION
  経過時間と、残存プロセスの有無を出力する。残っていれば終了コード 1。
  ポップアップ / コンポーズ等の常駐ウィンドウが残って終了しない不具合の検出に使う。
.EXAMPLE   .\win-closewait.ps1 -ProcId 1234 -TimeoutSec 30
#>
param(
  [Parameter(Mandatory)][int]$ProcId,
  [int]$TimeoutSec = 30,
  [string]$ProcessName = 'multicolumnx'
)
$t0 = Get-Date
& powershell -NoProfile -File (Join-Path $PSScriptRoot 'win-window.ps1') close -ProcId $ProcId
$gone = $false
for ($i = 0; $i -lt ($TimeoutSec * 2); $i++) {
  Start-Sleep -Milliseconds 500
  if (-not (Get-Process $ProcessName -ErrorAction SilentlyContinue)) { $gone = $true; break }
}
"gone=$gone elapsed=$([math]::Round(((Get-Date) - $t0).TotalSeconds, 1))s"
Get-Process $ProcessName -ErrorAction SilentlyContinue | ForEach-Object { "REMAIN pid=$($_.Id)" }
if (-not $gone) { exit 1 }
