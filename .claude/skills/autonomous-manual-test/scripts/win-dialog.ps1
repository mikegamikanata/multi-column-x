<#
.SYNOPSIS  OS ネイティブのファイル保存ダイアログ（#32770）を操作する。
.DESCRIPTION
  Act:
    info    ダイアログ内の Edit コントロールを列挙（ダイアログの有無確認にも使う。無ければ NODIALOG）
    dump    UI Automation でダイアログ内の全要素を列挙（既定のファイル名は id=1001 の Name に出る）
    save    -Path のフルパスをファイル名欄(id 1001)へ設定して保存（WM_COMMAND IDOK）
    cancel  キャンセル（WM_COMMAND IDCANCEL）
  ダイアログはアプリのプロセスに属するため -ProcId はアプリの PID。
.EXAMPLE   .\win-dialog.ps1 save -ProcId 1234 -Path C:\tmp\out\video.mp4
#>
param(
  [Parameter(Position = 0)][string]$Act = 'info',
  [Parameter(Mandatory)][int]$ProcId,
  [string]$Path = ''
)
Add-Type -AssemblyName UIAutomationClient, UIAutomationTypes
Add-Type @"
using System;using System.Runtime.InteropServices;using System.Text;using System.Collections.Generic;
public class McxD{
 [DllImport("user32.dll")] public static extern bool PostMessage(IntPtr h,uint m,IntPtr w,IntPtr l);
 [DllImport("user32.dll",CharSet=CharSet.Unicode)] public static extern IntPtr SendMessage(IntPtr h,uint m,IntPtr w,string l);
 [DllImport("user32.dll")] public static extern int GetClassName(IntPtr h,StringBuilder s,int n);
 [DllImport("user32.dll")] public static extern uint GetWindowThreadProcessId(IntPtr h,out uint pid);
 [DllImport("user32.dll")] public static extern bool IsWindowVisible(IntPtr h);
 [DllImport("user32.dll")] public static extern int GetDlgCtrlID(IntPtr h);
 [DllImport("user32.dll",CharSet=CharSet.Unicode)] public static extern int GetWindowText(IntPtr h,StringBuilder s,int n);
 public delegate bool EP(IntPtr h,IntPtr l);
 [DllImport("user32.dll")] public static extern bool EnumWindows(EP cb,IntPtr l);
 [DllImport("user32.dll")] public static extern bool EnumChildWindows(IntPtr p,EP cb,IntPtr l);
 public static IntPtr Dlg(uint pid){IntPtr r=IntPtr.Zero;EnumWindows((h,l)=>{uint p;GetWindowThreadProcessId(h,out p);if(p==pid&&IsWindowVisible(h)){var sb=new StringBuilder(64);GetClassName(h,sb,64);if(sb.ToString()=="#32770")r=h;}return true;},IntPtr.Zero);return r;}
 public static List<IntPtr> Edits(IntPtr d){var r=new List<IntPtr>();EnumChildWindows(d,(h,l)=>{var sb=new StringBuilder(64);GetClassName(h,sb,64);if(sb.ToString()=="Edit")r.Add(h);return true;},IntPtr.Zero);return r;}
}
"@
$d = [McxD]::Dlg($ProcId)
if ($d -eq [IntPtr]::Zero) { 'NODIALOG'; exit 0 }
switch ($Act) {
  'info' {
    foreach ($e in [McxD]::Edits($d)) {
      $sb = New-Object Text.StringBuilder 300; [McxD]::GetWindowText($e, $sb, 300) | Out-Null
      "edit id=$([McxD]::GetDlgCtrlID($e)) text=$sb"
    }
  }
  'dump' {
    $AE = [Windows.Automation.AutomationElement]
    $cond = New-Object Windows.Automation.AndCondition(
      (New-Object Windows.Automation.PropertyCondition($AE::ProcessIdProperty, $ProcId)),
      (New-Object Windows.Automation.PropertyCondition($AE::ClassNameProperty, '#32770')))
    $w = $AE::RootElement.FindFirst([Windows.Automation.TreeScope]::Children, $cond)
    if (-not $w) { 'NODIALOG'; exit 0 }
    "DIALOG name=$($w.Current.Name)"
    foreach ($e in $w.FindAll([Windows.Automation.TreeScope]::Descendants, [Windows.Automation.Condition]::TrueCondition)) {
      "  $($e.Current.ControlType.ProgrammaticName) id=$($e.Current.AutomationId) name=$($e.Current.Name)"
    }
  }
  'save' {
    if (-not $Path) { throw '-Path が必要です' }
    $t = $null
    foreach ($e in [McxD]::Edits($d)) { if ([McxD]::GetDlgCtrlID($e) -eq 1001) { $t = $e } }
    if (-not $t) { throw 'ファイル名欄(id 1001)が見つかりません。dump で構造を確認してください' }
    [McxD]::SendMessage($t, 0xC, [IntPtr]::Zero, $Path) | Out-Null   # WM_SETTEXT
    Start-Sleep -Milliseconds 500
    [McxD]::PostMessage($d, 0x111, [IntPtr]1, [IntPtr]::Zero) | Out-Null   # WM_COMMAND IDOK
    "save posted $Path"
  }
  'cancel' { [McxD]::PostMessage($d, 0x111, [IntPtr]2, [IntPtr]::Zero) | Out-Null; 'cancel posted' }
  default { throw "不明な Act: $Act" }
}
