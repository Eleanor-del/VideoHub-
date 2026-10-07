; ---------------------------------------------------------------------------
; VideoHub 视频聚合台 —— Inno Setup 安装脚本
; 编译：ISCC.exe installer.iss /DMyAppVersion=x.y.z /O"<输出目录>"
; 源文件：..\..\dist\VideoHub\*（由 tools\build-portable.js 生成的便携版）
; ---------------------------------------------------------------------------

#ifndef MyAppVersion
  #define MyAppVersion "1.0.0"
#endif

; 外层双大括号用于在 Inno 编译器里转义成单个 "{"
#define MyAppId       "{{A7D3F2B1-4C6E-4A55-9E31-8B0C7D2F6154}}"
#define MyAppName     "VideoHub"
#define MyAppTitle    "VideoHub 视频聚合台"
#define MyAppExeName  "VideoHub.exe"
#define MyAppPublisher "VideoHub"
#define MyAppCopyright  "Copyright (c) 2026 VideoHub"

[Setup]
; -------- 应用基本信息 --------
AppId={#MyAppId}
AppName={#MyAppTitle}
AppVersion={#MyAppVersion}
AppVerName={#MyAppTitle} {#MyAppVersion}
AppPublisher={#MyAppPublisher}
AppCopyright={#MyAppCopyright}
DefaultDirName={localappdata}\Programs\{#MyAppName}
DefaultGroupName={#MyAppTitle}
DisableDirPage=auto
DisableProgramGroupPage=auto
AppendDefaultDirName=yes
AllowNoIcons=yes

; -------- 卸载程序 --------
UninstallDisplayName={#MyAppTitle} {#MyAppVersion}
UninstallDisplayIcon={app}\{#MyAppExeName},0
Uninstallable=yes
CreateUninstallRegKey=yes

; -------- 安装程序外观 --------
WizardStyle=modern
WizardResizable=yes
SetupIconFile=..\..\assets\icon.ico
VersionInfoVersion={#MyAppVersion}
VersionInfoProductName={#MyAppTitle}
VersionInfoCompany={#MyAppPublisher}
VersionInfoDescription={#MyAppTitle} 安装程序

; -------- 权限与平台 --------
; 安装到当前用户的 LocalAppData，无需管理员权限，不弹 UAC
PrivilegesRequired=lowest
ArchitecturesAllowed=x64compatible
ArchitecturesInstallIn64BitMode=x64compatible

; -------- 压缩（源码总量约 270MB，Electron 运行时为主） --------
Compression=lzma2/normal
SolidCompression=yes
LZMAUseSeparateProcess=yes
LZMANumBlockThreads=4

; -------- 运行中的应用 --------
; 覆盖安装时若主程序正在运行，提示用户关闭而不是静默失败
CloseApplications=yes
RestartApplications=no

[Languages]
Name: "chinesesimplified"; MessagesFile: "ChineseSimplified.isl"

[Tasks]
Name: "desktopicon"; Description: "创建桌面快捷方式"; GroupDescription: "附加图标："; Flags: checkedonce

[Files]
Source: "..\..\dist\VideoHub\*"; DestDir: "{app}"; Flags: ignoreversion recursesubdirs createallsubdirs

; 升级安装时先清掉旧的 app 源码目录，避免遗留旧版本文件
[InstallDelete]
Type: filesandordirs; Name: "{app}\resources\app"

[Icons]
Name: "{group}\{#MyAppTitle}"; Filename: "{app}\{#MyAppExeName}"; WorkingDir: "{app}"; Comment: "聚合抖音、哔哩哔哩、快手"
Name: "{group}\卸载 {#MyAppTitle}"; Filename: "{uninstallexe}"
Name: "{autodesktop}\{#MyAppTitle}"; Filename: "{app}\{#MyAppExeName}"; WorkingDir: "{app}"; Comment: "聚合抖音、哔哩哔哩、快手"; Tasks: desktopicon

[Run]
Filename: "{app}\{#MyAppExeName}"; Description: "立即启动 {#MyAppTitle}"; Flags: nowait postinstall skipifsilent runasoriginaluser

[Code]
// 卸载完成后询问是否一并清除用户数据（登录状态 / 收藏 / 历史）
procedure PurgeUserDir(const DirName: String; var Removed: Integer);
begin
  if DirExists(DirName) then
  begin
    if DelTree(DirName, True, True, True) then
      Removed := Removed + 1;
  end;
end;

procedure CurUninstallStepChanged(CurUninstallStep: TUninstallStep);
var
  Answer: Integer;
  Removed: Integer;
  LegacyDir: String;
  DataDir: String;
begin
  if CurUninstallStep = usPostUninstall then
  begin
    // 静默卸载（/VERYSILENT）一律保留用户数据，避免误删登录状态与收藏
    if UninstallSilent then exit;

    DataDir := ExpandConstant('{userappdata}\{#MyAppName}');
    LegacyDir := ExpandConstant('{userappdata}\videohub');
    Removed := 0;

    if DirExists(DataDir) or DirExists(LegacyDir) then
    begin
      Answer := MsgBox(
        '是否同时删除 VideoHub 的登录状态、收藏夹与浏览记录？' + #13#10 + #13#10 +
        '数据位置：' + DataDir + #13#10 + #13#10 +
        '选择「是」：彻底清除全部用户数据；' + #13#10 +
        '选择「否」：保留数据，重新安装后可继续使用。',
        mbConfirmation, MB_YESNO or MB_DEFBUTTON2);

      if Answer = IDYES then
      begin
        PurgeUserDir(DataDir, Removed);
        PurgeUserDir(LegacyDir, Removed);
      end;
    end;
  end;

  // 收尾：删掉可能残留的空安装目录（RemoveDir 只删空目录，有内容会自动失败）
  if CurUninstallStep = usDone then
    RemoveDir(ExpandConstant('{app}'));
end;
