<#
.SYNOPSIS  PrintWindow でアプリ主窓を PNG に保存する（隠れていても、他の窓が被っていても撮れる）。
           子 WebView（カラム）は撮れないことがある。その場合は CDP の page.screenshot を使う。
.EXAMPLE   .\win-shot.ps1 -ProcId 1234 -Out $env:TEMP\shots\main.png
#>
param(
  [Parameter(Mandatory)][int]$ProcId,
  [Parameter(Mandatory)][string]$Out,
  [string]$Title = 'MultiColumnX'
)
Add-Type -AssemblyName System.Drawing
Add-Type @"
using System;using System.Runtime.InteropServices;using System.Text;
public class McxP{
 [StructLayout(LayoutKind.Sequential)] public struct RECT{public int L,T,R,B;}
 [DllImport("user32.dll")] public static extern bool GetWindowRect(IntPtr h,out RECT r);
 [DllImport("user32.dll")] public static extern bool PrintWindow(IntPtr h,IntPtr dc,uint f);
 [DllImport("user32.dll",CharSet=CharSet.Unicode)] public static extern int GetWindowText(IntPtr h,StringBuilder s,int n);
 [DllImport("user32.dll")] public static extern bool IsWindowVisible(IntPtr h);
 [DllImport("user32.dll")] public static extern uint GetWindowThreadProcessId(IntPtr h,out uint pid);
 public delegate bool EP(IntPtr h,IntPtr l);
 [DllImport("user32.dll")] public static extern bool EnumWindows(EP cb,IntPtr l);
 public static IntPtr Find(uint pid,string title){IntPtr r=IntPtr.Zero;EnumWindows((h,l)=>{uint p;GetWindowThreadProcessId(h,out p);if(p==pid&&IsWindowVisible(h)){var sb=new StringBuilder(200);GetWindowText(h,sb,200);if(sb.ToString()==title)r=h;}return true;},IntPtr.Zero);return r;}
}
"@
$h = [McxP]::Find($ProcId, $Title)
if ($h -eq [IntPtr]::Zero) { throw "ウィンドウ '$Title' が見つかりません (pid=$ProcId)" }
$r = New-Object McxP+RECT; [McxP]::GetWindowRect($h, [ref]$r) | Out-Null
$w = $r.R - $r.L; $ht = $r.B - $r.T
New-Item -ItemType Directory -Force -Path (Split-Path -Parent $Out) | Out-Null
$bmp = New-Object Drawing.Bitmap $w, $ht
$g = [Drawing.Graphics]::FromImage($bmp); $dc = $g.GetHdc()
# フラグ 2 = PW_RENDERFULLCONTENT（WebView2 の描画内容も含める）
[McxP]::PrintWindow($h, $dc, 2) | Out-Null
$g.ReleaseHdc($dc); $bmp.Save($Out); $g.Dispose(); $bmp.Dispose()
"$w x $ht -> $Out"
