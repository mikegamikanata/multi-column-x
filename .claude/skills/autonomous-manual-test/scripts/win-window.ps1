<#
.SYNOPSIS  ウィンドウの列挙・サイズ指定・最小化・正常終了。
.DESCRIPTION
  close は主窓（タイトル MultiColumnX）にだけ WM_CLOSE を送る。tao のタイトル空 16x16 ヘルパー窓に送ってはいけない。
  Cmd: info | all | set | close | min | restore | max
.EXAMPLE   .\win-window.ps1 all -ProcId 1234
.EXAMPLE   .\win-window.ps1 set -ProcId 1234 -X 100 -Y 100 -W 1200 -H 800
#>
param(
  [Parameter(Position = 0)][string]$Cmd = 'info',
  [Parameter(Mandatory)][int]$ProcId,
  [int]$X = 0, [int]$Y = 0, [int]$W = 0, [int]$H = 0,
  [string]$Title = 'MultiColumnX'   # 主窓のタイトル
)
Add-Type @"
using System;using System.Runtime.InteropServices;using System.Text;using System.Collections.Generic;
public class McxW{
 [StructLayout(LayoutKind.Sequential)] public struct RECT{public int L,T,R,B;}
 [DllImport("user32.dll")] public static extern bool GetWindowRect(IntPtr h,out RECT r);
 [DllImport("user32.dll")] public static extern bool GetClientRect(IntPtr h,out RECT r);
 [DllImport("user32.dll")] public static extern bool ShowWindow(IntPtr h,int c);
 [DllImport("user32.dll")] public static extern bool IsIconic(IntPtr h);
 [DllImport("user32.dll")] public static extern bool IsZoomed(IntPtr h);
 [DllImport("user32.dll")] public static extern bool SetWindowPos(IntPtr h,IntPtr a,int x,int y,int cx,int cy,uint f);
 [DllImport("user32.dll")] public static extern bool PostMessage(IntPtr h,uint m,IntPtr w,IntPtr l);
 [DllImport("user32.dll",CharSet=CharSet.Unicode)] public static extern int GetWindowText(IntPtr h,StringBuilder s,int n);
 [DllImport("user32.dll")] public static extern bool IsWindowVisible(IntPtr h);
 [DllImport("user32.dll")] public static extern uint GetWindowThreadProcessId(IntPtr h,out uint pid);
 public delegate bool EP(IntPtr h,IntPtr l);
 [DllImport("user32.dll")] public static extern bool EnumWindows(EP cb,IntPtr l);
 public static List<IntPtr> Of(uint pid){var r=new List<IntPtr>();EnumWindows((h,l)=>{uint p;GetWindowThreadProcessId(h,out p);if(p==pid&&IsWindowVisible(h))r.Add(h);return true;},IntPtr.Zero);return r;}
}
"@
function Get-Title($h) { $sb = New-Object Text.StringBuilder 200; [McxW]::GetWindowText($h, $sb, 200) | Out-Null; $sb.ToString() }
function Get-Info($h) {
  $r = New-Object McxW+RECT; [McxW]::GetWindowRect($h, [ref]$r) | Out-Null
  $c = New-Object McxW+RECT; [McxW]::GetClientRect($h, [ref]$c) | Out-Null
  "outer x=$($r.L) y=$($r.T) w=$($r.R-$r.L) h=$($r.B-$r.T) client w=$($c.R) h=$($c.B) iconic=$([McxW]::IsIconic($h)) zoomed=$([McxW]::IsZoomed($h))"
}
$main = @([McxW]::Of($ProcId) | Where-Object { (Get-Title $_) -eq $Title })
switch ($Cmd) {
  'info'    { foreach ($h in $main) { "title=$(Get-Title $h) $(Get-Info $h)" } }
  'all'     { foreach ($h in [McxW]::Of($ProcId)) { "$h '$(Get-Title $h)' $(Get-Info $h)" } }
  'set'     { foreach ($h in $main) { [McxW]::SetWindowPos($h, [IntPtr]::Zero, $X, $Y, $W, $H, 0x14) | Out-Null } }
  'close'   { foreach ($h in $main) { [McxW]::PostMessage($h, 0x10, [IntPtr]::Zero, [IntPtr]::Zero) | Out-Null }; "WM_CLOSE -> $($main.Count) window(s)" }
  'min'     { foreach ($h in $main) { [McxW]::ShowWindow($h, 6) | Out-Null } }
  'restore' { foreach ($h in $main) { [McxW]::ShowWindow($h, 9) | Out-Null } }
  'max'     { foreach ($h in $main) { [McxW]::ShowWindow($h, 3) | Out-Null } }
  default   { throw "不明な Cmd: $Cmd" }
}
