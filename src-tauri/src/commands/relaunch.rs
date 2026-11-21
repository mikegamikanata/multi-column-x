//! アプリの再起動に使う純粋関数群。AppImage では旧マウントを指す環境変数・作業ディレクトリを
//! 新プロセスへ引き継がないよう整理した上で `$APPIMAGE` を起動し直す。それ以外は tauri の再起動に委ねる。
// 環境整理・起動計画の関数は Linux の殻（AppImage 起動し直し）からしか呼ばれない。
// 純粋関数は全デスクトップ OS でコンパイル・テストするため、Linux 以外では未使用警告を抑える。
#![cfg_attr(not(target_os = "linux"), allow(dead_code))]

use std::collections::BTreeMap;
use std::ffi::OsString;
use std::path::{Path, PathBuf};

use crate::commands::app_error::AppError;
use crate::commands::media_codec::detect_appimage_dir;

/// 新プロセスへ渡さないキー。`MULTI_COLUMN_X_LD_PATH_PRIMED` は `linux_codec_env::REEXEC_GUARD_ENV` と同じ値
/// （継承されると新プロセスが OpenH264 配置先を LD_LIBRARY_PATH に足す再 exec を省略してしまう）。
const DROPPED_KEYS: &[&str] = &[
    "APPDIR",
    "APPIMAGE",
    "ARGV0",
    "OWD",
    "MULTI_COLUMN_X_LD_PATH_PRIMED",
];

#[derive(Debug, PartialEq)]
pub(crate) enum RelaunchPlan {
    /// 従来の tauri の再起動（`AppHandle::request_restart`）。
    TauriRestart,
    /// AppImage 本体を整理した環境で起動し直す。
    AppImage(AppImageLaunch),
}

#[derive(Debug, PartialEq)]
pub struct AppImageLaunch {
    /// `$APPIMAGE`
    pub program: PathBuf,
    /// 現プロセスの `argv[1..]`
    pub args: Vec<OsString>,
    pub cwd: PathBuf,
    /// 子プロセスの環境の全て（`env_clear` + `envs` で渡す）
    pub env: BTreeMap<String, String>,
}

/// 要素 `entry` が `dir` そのもの、または `dir` 配下か（コンポーネント境界で判定。末尾 `/` は無視）。
fn is_under(entry: &str, dir: &str) -> bool {
    let dir = dir.trim_end_matches('/');
    if dir.is_empty() {
        return false;
    }
    let entry = entry.trim_end_matches('/');
    entry == dir
        || entry
            .strip_prefix(dir)
            .is_some_and(|rest| rest.starts_with('/'))
}

/// コロン区切りの値から `should_drop` に該当する要素を除く。
/// 除かれた要素が無ければ `None`（元の値を維持）、全て除かれたら `Some(None)`、
/// 残りがあれば `Some(Some(新値))`。値を書き換える場合に限り、空要素（カレントディレクトリを
/// 意味するため検索パスに残すと危険）も取り除く。
fn strip_entries(value: &str, should_drop: impl Fn(&str) -> bool) -> Option<Option<String>> {
    let entries: Vec<&str> = value.split(':').collect();
    let kept: Vec<&str> = entries
        .iter()
        .copied()
        .filter(|e| !should_drop(e))
        .collect();
    if kept.len() == entries.len() {
        return None;
    }
    let kept: Vec<&str> = kept.into_iter().filter(|e| !e.is_empty()).collect();
    if kept.is_empty() {
        Some(None)
    } else {
        Some(Some(kept.join(":")))
    }
}

/// 新プロセスへ渡す環境を作る（純粋関数）。
pub(crate) fn build_relaunch_env(
    env: &BTreeMap<String, String>,
    appdir: &str,
    openh264_dir: &str,
) -> BTreeMap<String, String> {
    let openh264_dir = openh264_dir.trim_end_matches('/');
    let mut out = BTreeMap::new();
    for (key, value) in env {
        if DROPPED_KEYS.contains(&key.as_str()) {
            continue;
        }
        let is_ld = key == "LD_LIBRARY_PATH";
        let stripped = strip_entries(value, |entry| {
            is_under(entry, appdir)
                || (is_ld
                    && !openh264_dir.is_empty()
                    && entry.trim_end_matches('/') == openh264_dir)
        });
        match stripped {
            None => {
                out.insert(key.clone(), value.clone());
            }
            Some(None) => {}
            Some(Some(new_value)) => {
                out.insert(key.clone(), new_value);
            }
        }
    }
    out
}

/// 再起動後の作業ディレクトリを選ぶ。`OWD` → `HOME` → `/` の順に、
/// 空でなく・`appdir` 配下でなく・`is_dir` が真の最初のもの。
pub(crate) fn choose_cwd(
    owd: Option<&str>,
    home: Option<&str>,
    appdir: &str,
    is_dir: impl Fn(&Path) -> bool,
) -> PathBuf {
    [owd, home]
        .into_iter()
        .flatten()
        .filter(|c| !c.is_empty() && !is_under(c, appdir))
        .map(PathBuf::from)
        .find(|p| is_dir(p))
        .unwrap_or_else(|| PathBuf::from("/"))
}

/// 起動方法を決める（純粋関数）。`APPIMAGE` と `APPDIR` が両方あり非空で、
/// `APPIMAGE` が絶対パス（`/` 始まり）のときだけ AppImage 起動し直しにする。
/// AppImage は Linux 専用なので、`Path::is_absolute`（Windows ではドライブ prefix が要る）は使わず文字列で判定し、
/// 全 OS で同じ結果になるようにしている。
pub(crate) fn plan_relaunch(
    env: &BTreeMap<String, String>,
    args: Vec<OsString>,
    openh264_dir: &Path,
    is_dir: impl Fn(&Path) -> bool,
) -> RelaunchPlan {
    let Some(appdir) = detect_appimage_dir(
        env.get("APPIMAGE").map(OsString::from),
        env.get("APPDIR").map(OsString::from),
    ) else {
        return RelaunchPlan::TauriRestart;
    };
    let appimage = env.get("APPIMAGE").map(String::as_str).unwrap_or("");
    let appdir = appdir.to_string_lossy().into_owned();
    if appimage.is_empty() || appdir.is_empty() || !appimage.starts_with('/') {
        return RelaunchPlan::TauriRestart;
    }
    let mut new_env = build_relaunch_env(env, &appdir, &openh264_dir.to_string_lossy());
    let cwd = choose_cwd(
        env.get("OWD").map(String::as_str),
        env.get("HOME").map(String::as_str),
        &appdir,
        is_dir,
    );
    new_env.insert("PWD".to_string(), cwd.to_string_lossy().into_owned());
    RelaunchPlan::AppImage(AppImageLaunch {
        program: PathBuf::from(appimage),
        args,
        cwd,
        env: new_env,
    })
}

/// 呼び出し元がメインウィンドウであることを検証する。
pub(crate) fn validate_window_label(label: &str) -> Result<(), AppError> {
    if crate::commands::is_main_label(label) {
        Ok(())
    } else {
        Err(AppError::internal(
            "relaunch_app is only allowed from the main window",
        ))
    }
}

/// `relaunch_app` が作った再起動計画。`RunEvent::Exit` で取り出して spawn する。
#[derive(Default)]
pub struct PendingRelaunch(pub std::sync::Mutex<Option<PreparedRelaunch>>);

pub struct PreparedRelaunch {
    pub launch: AppImageLaunch,
    /// UTF-8 でない環境変数（無加工のまま子に渡す）
    pub passthrough: Vec<(OsString, OsString)>,
}

/// 計画を取り出す（1 回限り。取り出した後は `None` になる）。
fn take_pending(pending: &PendingRelaunch) -> Option<PreparedRelaunch> {
    match pending.0.lock() {
        Ok(mut guard) => guard.take(),
        Err(poisoned) => poisoned.into_inner().take(),
    }
}

/// `RunEvent::Exit` のときだけ再起動計画を実行する。
pub fn should_spawn_on(event: &tauri::RunEvent) -> bool {
    matches!(event, tauri::RunEvent::Exit)
}

/// `fd` と「CLOEXEC が立っているか」の組から、子に継承させたくない fd（3 以上かつ非 CLOEXEC）を昇順で返す。
#[cfg(target_os = "linux")]
fn select_leaked_fds(entries: &[(i32, bool)]) -> Vec<i32> {
    let mut fds: Vec<i32> = entries
        .iter()
        .filter(|(fd, cloexec)| *fd >= 3 && !*cloexec)
        .map(|(fd, _)| *fd)
        .collect();
    fds.sort_unstable();
    fds
}

/// 自プロセスが開いている fd のうち、exec で子に引き継がれてしまうもの（3 以上かつ非 CLOEXEC）を列挙する。
/// 読み取れない場合は空（閉じない）にして再起動自体は続行する。
#[cfg(target_os = "linux")]
fn list_leaked_fds() -> Vec<i32> {
    let dir = match std::fs::read_dir("/proc/self/fd") {
        Ok(dir) => dir,
        Err(e) => {
            log::warn!("failed to list /proc/self/fd, skipping fd cleanup: {e}");
            return Vec::new();
        }
    };
    let entries: Vec<(i32, bool)> = dir
        .filter_map(|entry| entry.ok())
        .filter_map(|entry| entry.file_name().to_str()?.parse::<i32>().ok())
        .filter_map(|fd| {
            // SAFETY: F_GETFD は fd のフラグを読むだけで副作用が無い。無効な fd は -1 が返る。
            let flags = unsafe { libc::fcntl(fd, libc::F_GETFD) };
            (flags >= 0).then_some((fd, flags & libc::FD_CLOEXEC != 0))
        })
        .collect();
    select_leaked_fds(&entries)
}

/// 整理済みの環境・作業ディレクトリで `$APPIMAGE` を起動する。標準入力は閉じ、
/// 標準入出力以外の fd は引き継がない。`close_range` で全閉じにしないのは、`Command` が exec 失敗の
/// 報告に使う CLOEXEC のパイプ（fd 3 以上）まで閉じて、失敗が成功に見えてしまうため。
#[cfg(target_os = "linux")]
fn spawn_detached(
    launch: &AppImageLaunch,
    passthrough: &[(OsString, OsString)],
) -> std::io::Result<std::process::Child> {
    use std::os::unix::process::CommandExt;

    let leaked = list_leaked_fds();
    let mut cmd = std::process::Command::new(&launch.program);
    cmd.args(&launch.args)
        .env_clear()
        .envs(&launch.env)
        .envs(passthrough.iter().map(|(k, v)| (k, v)))
        .current_dir(&launch.cwd)
        .stdin(std::process::Stdio::null());
    // SAFETY: `pre_exec` は fork 後・exec 前の子で実行される。親は GTK / WebKit / tokio のスレッドを持つ
    // マルチスレッドなので、ここで呼べるのは async-signal-safe な関数だけ。`libc::close` は
    // async-signal-safe（`libc::setsid` も同様）で、クロージャは `Vec<i32>` を move で所有してスライスを走査するのみ
    // （ヒープ割り当て・ロック取得・ログ出力をしない）。
    unsafe {
        cmd.pre_exec(move || {
            // 親の端末・プロセスグループから切り離す（旧アプリの終了に巻き込まれない）。
            if libc::setsid() == -1 {
                return Err(std::io::Error::last_os_error());
            }
            for &fd in &leaked {
                libc::close(fd);
            }
            Ok(())
        });
    }
    cmd.spawn()
}

/// 現プロセスの環境から再起動計画を作る。AppImage 実行中でなければ `None`。
#[cfg(target_os = "linux")]
fn appimage_launch_from_process() -> Option<PreparedRelaunch> {
    let mut env = BTreeMap::new();
    let mut passthrough = Vec::new();
    for (key, value) in std::env::vars_os() {
        match (key.to_str(), value.to_str()) {
            (Some(k), Some(v)) => {
                env.insert(k.to_string(), v.to_string());
            }
            // UTF-8 でない環境変数は旧マウントを指さないので、無加工のまま子に渡す。
            _ => passthrough.push((key, value)),
        }
    }
    let args: Vec<OsString> = std::env::args_os().skip(1).collect();
    let openh264_dir = crate::linux_codec_env::openh264_lib_dir();
    match plan_relaunch(&env, args, &openh264_dir, |p| p.is_dir()) {
        RelaunchPlan::AppImage(launch) => Some(PreparedRelaunch {
            launch,
            passthrough,
        }),
        RelaunchPlan::TauriRestart => None,
    }
}

/// `RunEvent::Exit` から呼ぶ。計画が無ければ何もしない。失敗はログのみ（既に終了処理中で UI に返せない）。
#[cfg(target_os = "linux")]
pub fn spawn_pending_relaunch(app: &tauri::AppHandle) {
    use tauri::Manager;
    let Some(prepared) = take_pending(&app.state::<PendingRelaunch>()) else {
        return;
    };
    match spawn_detached(&prepared.launch, &prepared.passthrough) {
        Ok(child) => log::info!("relaunched AppImage (pid {})", child.id()),
        Err(e) => log::error!("failed to relaunch AppImage: {e}"),
    }
}

#[cfg(not(target_os = "linux"))]
pub fn spawn_pending_relaunch(_app: &tauri::AppHandle) {}

/// アプリを再起動する（メインウィンドウ専用）。AppImage では環境・fd・作業ディレクトリを整理して
/// `$APPIMAGE` を起動し直し、それ以外は tauri の再起動に委ねる。
#[tauri::command]
pub async fn relaunch_app(
    caller: tauri::Webview,
    app: tauri::AppHandle,
    pending: tauri::State<'_, PendingRelaunch>,
) -> Result<(), AppError> {
    validate_window_label(caller.label())?;
    #[cfg(target_os = "linux")]
    if let Some(prepared) = appimage_launch_from_process() {
        // 実在確認は計画作成時に行う（Exit 時の spawn 失敗は UI に返せないため）。無ければ終了しない。
        if !prepared.launch.program.is_file() {
            return Err(AppError::internal(format!(
                "APPIMAGE does not exist: {}",
                prepared.launch.program.display()
            )));
        }
        *pending.0.lock().map_err(AppError::internal)? = Some(prepared);
        // spawn は RunEvent::Exit（lib.rs の run コールバック → spawn_pending_relaunch）で行う。
        app.exit(0);
        return Ok(());
    }
    #[cfg(not(target_os = "linux"))]
    let _ = &pending;
    app.request_restart();
    Ok(())
}

#[cfg(test)]
mod tests {
    use super::*;

    const APPDIR: &str = "/tmp/.mount_abc";
    const OH: &str = "/home/u/.local/share/com.natsuyasai.multicolumnx/gstreamer-openh264";

    fn env_of(pairs: &[(&str, &str)]) -> BTreeMap<String, String> {
        pairs
            .iter()
            .map(|(k, v)| (k.to_string(), v.to_string()))
            .collect()
    }

    fn appimage_env(extra: &[(&str, &str)]) -> BTreeMap<String, String> {
        let mut pairs = vec![("APPIMAGE", "/opt/app.AppImage"), ("APPDIR", APPDIR)];
        pairs.extend_from_slice(extra);
        env_of(&pairs)
    }

    fn plan(env: &BTreeMap<String, String>, args: Vec<OsString>) -> RelaunchPlan {
        plan_relaunch(env, args, Path::new(OH), |_| true)
    }

    fn launch_of(plan: RelaunchPlan) -> AppImageLaunch {
        match plan {
            RelaunchPlan::AppImage(l) => l,
            RelaunchPlan::TauriRestart => panic!("AppImage を期待したが TauriRestart だった"),
        }
    }

    #[test]
    fn パス一覧の環境変数から旧マウント配下の要素が取り除かれる() {
        let env = env_of(&[(
            "PATH",
            "/tmp/.mount_abc/usr/bin:/usr/bin:/tmp/.mount_abc/usr/sbin:/opt/bin",
        )]);
        let out = build_relaunch_env(&env, APPDIR, OH);
        assert_eq!(
            out.get("PATH").map(String::as_str),
            Some("/usr/bin:/opt/bin")
        );
    }

    #[test]
    fn 旧マウントと名前だけ似たパスは取り除かない() {
        let env = env_of(&[(
            "PATH",
            "/tmp/.mount_abcd/usr:/tmp/.mount_ab:/tmp/.mount_abc/usr",
        )]);
        let out = build_relaunch_env(&env, APPDIR, OH);
        assert_eq!(
            out.get("PATH").map(String::as_str),
            Some("/tmp/.mount_abcd/usr:/tmp/.mount_ab")
        );
    }

    #[test]
    fn xdg_data_dirsなど複数の変数から取り除かれる() {
        let env = env_of(&[
            ("XDG_DATA_DIRS", "/tmp/.mount_abc/usr/share:/usr/share"),
            ("PYTHONPATH", "/tmp/.mount_abc/usr/lib/python:/srv/py"),
        ]);
        let out = build_relaunch_env(&env, APPDIR, OH);
        assert_eq!(out["XDG_DATA_DIRS"], "/usr/share");
        assert_eq!(out["PYTHONPATH"], "/srv/py");
    }

    #[test]
    fn 起動時にアプリが追加したopenh264の配置先がライブラリ検索パスから取り除かれる() {
        let env = env_of(&[(
            "LD_LIBRARY_PATH",
            &format!("{OH}:/usr/lib:/tmp/.mount_abc/usr/lib"),
        )]);
        let out = build_relaunch_env(&env, APPDIR, OH);
        assert_eq!(out["LD_LIBRARY_PATH"], "/usr/lib");
    }

    #[test]
    fn ld_library_path以外の変数にあるopenh264の配置先は取り除かない() {
        let env = env_of(&[("OTHER_PATH", &format!("{OH}:/usr/lib"))]);
        let out = build_relaunch_env(&env, APPDIR, OH);
        assert_eq!(out["OTHER_PATH"], format!("{OH}:/usr/lib"));
    }

    #[test]
    fn 要素がすべて取り除かれた環境変数は削除される() {
        let env = env_of(&[(
            "GST_PLUGIN_SYSTEM_PATH",
            "/tmp/.mount_abc/usr/lib/gst:/tmp/.mount_abc/usr/lib/gst2",
        )]);
        let out = build_relaunch_env(&env, APPDIR, OH);
        assert!(!out.contains_key("GST_PLUGIN_SYSTEM_PATH"));
    }

    #[test]
    fn 旧マウント配下を指す単一パスの変数は削除される() {
        let env = env_of(&[(
            "GDK_PIXBUF_MODULE_FILE",
            "/tmp/.mount_abc/usr/lib/loaders.cache",
        )]);
        let out = build_relaunch_env(&env, APPDIR, OH);
        assert!(!out.contains_key("GDK_PIXBUF_MODULE_FILE"));
    }

    #[test]
    fn 何も取り除かれなかった変数は値がそのまま残る() {
        let env = env_of(&[
            ("EMPTY", ""),
            ("GAPS", "a::b:"),
            ("LS_COLORS", "rs=0:di=01;34"),
        ]);
        let out = build_relaunch_env(&env, APPDIR, OH);
        assert_eq!(out, env);
    }

    #[test]
    fn 旧マウントの要素を取り除いた変数からは空の要素も取り除かれる() {
        let env = env_of(&[
            ("LD_LIBRARY_PATH", "/tmp/.mount_abc/usr/lib::/usr/lib:"),
            ("PATH", ":/tmp/.mount_abc/usr/bin:/usr/bin::/opt/bin"),
        ]);
        let out = build_relaunch_env(&env, APPDIR, OH);
        assert_eq!(out["LD_LIBRARY_PATH"], "/usr/lib");
        assert_eq!(out["PATH"], "/usr/bin:/opt/bin");
    }

    #[test]
    fn appimageの実行情報と起動時の初期化済み印は引き継がれない() {
        let env = env_of(&[
            ("APPDIR", APPDIR),
            ("APPIMAGE", "/opt/app.AppImage"),
            ("ARGV0", "app"),
            ("OWD", "/home/u"),
            ("MULTI_COLUMN_X_LD_PATH_PRIMED", "1"),
            ("DISPLAY", ":0"),
        ]);
        let out = build_relaunch_env(&env, APPDIR, OH);
        for key in [
            "APPDIR",
            "APPIMAGE",
            "ARGV0",
            "OWD",
            "MULTI_COLUMN_X_LD_PATH_PRIMED",
        ] {
            assert!(!out.contains_key(key), "{key} が残っている");
        }
    }

    #[cfg(all(desktop, target_os = "linux"))]
    #[test]
    fn 初期化済み印のキーがlinux_codec_envの定数と一致する() {
        assert!(DROPPED_KEYS.contains(&crate::linux_codec_env::REEXEC_GUARD_ENV));
    }

    #[test]
    fn 旧マウントと無関係な環境変数はそのまま引き継がれる() {
        let env = env_of(&[
            ("DISPLAY", ":0"),
            ("LANG", "ja_JP.UTF-8"),
            ("HOME", "/home/u"),
            ("XDG_SESSION_TYPE", "wayland"),
        ]);
        let out = build_relaunch_env(&env, APPDIR, OH);
        assert_eq!(out, env);
    }

    #[test]
    fn 再起動後の作業ディレクトリは起動した場所になる() {
        let env = appimage_env(&[("OWD", "/work/proj"), ("HOME", "/home/u")]);
        let launch = launch_of(plan(&env, vec![]));
        assert_eq!(launch.cwd, PathBuf::from("/work/proj"));
    }

    #[test]
    fn 再起動後の作業ディレクトリは起動場所の記録が無ければホームディレクトリになる() {
        let env = appimage_env(&[("HOME", "/home/u")]);
        let launch = launch_of(plan(&env, vec![]));
        assert_eq!(launch.cwd, PathBuf::from("/home/u"));
    }

    #[test]
    fn 起動した場所が存在しなければホームディレクトリになる() {
        let cwd = choose_cwd(Some("/gone"), Some("/home/u"), APPDIR, |p| {
            p == Path::new("/home/u")
        });
        assert_eq!(cwd, PathBuf::from("/home/u"));
    }

    #[test]
    fn 起動場所もホームも無ければルートになる() {
        assert_eq!(choose_cwd(None, None, APPDIR, |_| true), PathBuf::from("/"));
        assert_eq!(
            choose_cwd(Some("/gone"), Some("/gone2"), APPDIR, |_| false),
            PathBuf::from("/")
        );
    }

    #[test]
    fn 旧マウント配下の起動場所は使わない() {
        let cwd = choose_cwd(Some("/tmp/.mount_abc/usr"), Some("/home/u"), APPDIR, |_| {
            true
        });
        assert_eq!(cwd, PathBuf::from("/home/u"));
    }

    #[test]
    fn plan_relaunchはpwdを作業ディレクトリに更新する() {
        let env = appimage_env(&[
            ("OWD", "/work/proj"),
            ("PWD", "/tmp/.mount_abc/usr/bin"),
            ("HOME", "/home/u"),
        ]);
        let launch = launch_of(plan(&env, vec![]));
        assert_eq!(launch.env["PWD"], "/work/proj");
        assert!(!launch.env.contains_key("OWD"));
    }

    #[test]
    fn appimage以外で実行しているときは従来の再起動方法が選ばれる() {
        let cases = [
            env_of(&[("HOME", "/home/u")]),
            env_of(&[("APPDIR", APPDIR)]),
            env_of(&[("APPIMAGE", "/opt/app.AppImage")]),
            env_of(&[("APPIMAGE", ""), ("APPDIR", APPDIR)]),
            env_of(&[("APPIMAGE", "/opt/app.AppImage"), ("APPDIR", "")]),
            env_of(&[("APPIMAGE", "app.AppImage"), ("APPDIR", APPDIR)]),
        ];
        for env in cases {
            assert_eq!(plan(&env, vec![]), RelaunchPlan::TauriRestart, "{env:?}");
        }
    }

    #[test]
    fn appimageで実行しているときはappimage自体を同じ引数で起動し直す方法が選ばれる() {
        let env = appimage_env(&[("HOME", "/home/u")]);
        let args: Vec<OsString> = vec!["--flag".into(), "with space".into(), "last".into()];
        let launch = launch_of(plan(&env, args.clone()));
        assert_eq!(launch.program, PathBuf::from("/opt/app.AppImage"));
        assert_eq!(launch.args, args);
    }

    #[test]
    fn メインウィンドウ以外からの再起動要求は拒否される() {
        for label in [
            "column-abc",
            "popup-abc",
            "compose-abc",
            "add-account-abc",
            "extension-abc",
        ] {
            assert!(validate_window_label(label).is_err(), "{label}");
        }
    }

    #[test]
    fn メインウィンドウからの再起動要求は許可される() {
        assert!(validate_window_label("main").is_ok());
    }
}

#[cfg(test)]
mod shell_tests {
    use super::*;

    #[cfg(target_os = "linux")]
    #[test]
    fn 継承させたくないfdは3以上かつcloexecなしのものだけが昇順で選ばれる() {
        let entries = [(0, false), (2, false), (3, true), (5, false), (4, false)];
        assert_eq!(select_leaked_fds(&entries), vec![4, 5]);
    }

    fn sample_prepared() -> PreparedRelaunch {
        PreparedRelaunch {
            launch: AppImageLaunch {
                program: PathBuf::from("/opt/app.AppImage"),
                args: vec![],
                cwd: PathBuf::from("/"),
                env: BTreeMap::new(),
            },
            passthrough: vec![],
        }
    }

    #[test]
    fn 再起動計画は取り出すと1回限りで空になる() {
        let pending = PendingRelaunch::default();
        *pending.0.lock().unwrap() = Some(sample_prepared());
        assert!(take_pending(&pending).is_some());
        assert!(take_pending(&pending).is_none());
    }

    #[test]
    fn 終了イベント以外では再起動計画を実行しない() {
        assert!(should_spawn_on(&tauri::RunEvent::Exit));
        assert!(!should_spawn_on(&tauri::RunEvent::Ready));
        assert!(!should_spawn_on(&tauri::RunEvent::MainEventsCleared));
    }

    #[cfg(target_os = "linux")]
    fn sh_launch(script: &str, env: &[(&str, &str)], cwd: &Path) -> AppImageLaunch {
        AppImageLaunch {
            program: PathBuf::from("/bin/sh"),
            args: vec!["-c".into(), script.into()],
            cwd: cwd.to_path_buf(),
            env: env
                .iter()
                .map(|(k, v)| (k.to_string(), v.to_string()))
                .collect(),
        }
    }

    /// 子の終了コードが 0 であること（シェルの検査が真）を確認する。
    #[cfg(target_os = "linux")]
    fn child_passes(launch: &AppImageLaunch) -> bool {
        let mut child = spawn_detached(launch, &[]).expect("spawn に成功する");
        child.wait().expect("wait に成功する").success()
    }

    #[cfg(target_os = "linux")]
    #[test]
    fn 存在しないプログラムはspawnエラーになる() {
        let launch = AppImageLaunch {
            program: PathBuf::from("/nonexistent/app.AppImage"),
            args: vec![],
            cwd: PathBuf::from("/"),
            env: BTreeMap::new(),
        };
        assert!(spawn_detached(&launch, &[]).is_err());
    }

    #[cfg(target_os = "linux")]
    #[test]
    fn 環境は整理済みのものだけが渡る() {
        let launch = sh_launch(
            r#"[ "$FOO" = bar ] && [ -z "$HOME" ]"#,
            &[("FOO", "bar")],
            Path::new("/"),
        );
        assert!(child_passes(&launch));
    }

    #[cfg(target_os = "linux")]
    #[test]
    fn 子は指定した作業ディレクトリで起動する() {
        let dir = tempfile::tempdir().unwrap();
        let canon = dir.path().canonicalize().unwrap();
        let script = format!(r#"[ "$(pwd -P)" = "{}" ]"#, canon.display());
        assert!(child_passes(&sh_launch(&script, &[], &canon)));
    }

    #[cfg(target_os = "linux")]
    #[test]
    fn 非cloexecのfdは子プロセスに継承されない() {
        let mut fds = [0i32; 2];
        // SAFETY: fds は 2 要素の有効な配列。pipe は CLOEXEC なしの fd 対を作る。
        assert_eq!(unsafe { libc::pipe(fds.as_mut_ptr()) }, 0);
        let leaked = fds[0];
        let script = format!("[ ! -e /proc/self/fd/{leaked} ]");
        let passed = child_passes(&sh_launch(&script, &[], Path::new("/")));
        // SAFETY: 上で作った fd をここで 1 度だけ閉じる。
        unsafe {
            libc::close(fds[0]);
            libc::close(fds[1]);
        }
        assert!(passed);
    }

    #[cfg(target_os = "linux")]
    #[test]
    fn cloexec付きのfdは触らず標準入出力は子に残る() {
        let launch = sh_launch(
            "[ -e /proc/self/fd/1 ] && [ -e /proc/self/fd/2 ]",
            &[],
            Path::new("/"),
        );
        assert!(child_passes(&launch));
    }

    #[cfg(target_os = "linux")]
    #[test]
    fn 子は新しいセッションのリーダーとして切り離される() {
        // /proc/<pid>/stat の 6 番目のフィールドがセッション ID。外部コマンドに頼らずシェル組み込みだけで読む。
        let launch = sh_launch(
            r#"read -r line < /proc/$$/stat; set -- $line; [ "$6" = "$$" ]"#,
            &[],
            Path::new("/"),
        );
        assert!(child_passes(&launch));
    }
}

#[cfg(test)]
mod properties {
    use super::*;
    use proptest::prelude::*;

    const APPDIR: &str = "/tmp/.mount_abc";
    const OH: &str = "/home/u/.local/share/com.natsuyasai.multicolumnx/gstreamer-openh264";

    /// 実装の `is_under` とは独立に書いた判定（コンポーネント境界・末尾 `/` 無視）。
    fn under_appdir(entry: &str) -> bool {
        let e = entry.trim_end_matches('/');
        e == APPDIR || e.starts_with(&format!("{APPDIR}/"))
    }

    fn is_openh264(entry: &str) -> bool {
        entry.trim_end_matches('/') == OH
    }

    /// 要素 1 つ分。APPDIR 配下・名前の似た兄弟・無関係・空・OpenH264 配置先（末尾 `/` 有無）を混ぜる。
    fn element() -> impl Strategy<Value = String> {
        prop_oneof![
            "/tmp/\\.mount_abc(/[a-z]{1,4}){0,3}/?",
            "/tmp/\\.mount_abc[a-z0-9._-]{1,3}(/[a-z]{1,4}){0,2}",
            Just("/tmp/.mount_ab".to_string()),
            "/(usr|opt|home)(/[a-z]{1,4}){0,3}/?",
            Just(String::new()),
            Just(OH.to_string()),
            Just(format!("{OH}/")),
        ]
    }

    fn value() -> impl Strategy<Value = String> {
        prop::collection::vec(element(), 0..8).prop_map(|v| v.join(":"))
    }

    fn key() -> impl Strategy<Value = String> {
        prop_oneof![
            "[A-Z_]{3,10}",
            Just("LD_LIBRARY_PATH".to_string()),
            prop::sample::select(vec![
                "APPDIR",
                "APPIMAGE",
                "ARGV0",
                "OWD",
                "MULTI_COLUMN_X_LD_PATH_PRIMED",
            ])
            .prop_map(String::from),
        ]
    }

    fn env_strategy() -> impl Strategy<Value = BTreeMap<String, String>> {
        prop::collection::btree_map(key(), value(), 0..8)
    }

    /// その変数が書き換え対象か（APPDIR 配下、または LD_LIBRARY_PATH の OpenH264 配置先を含む）。
    fn is_touched(key: &str, value: &str) -> bool {
        value
            .split(':')
            .any(|e| under_appdir(e) || (key == "LD_LIBRARY_PATH" && is_openh264(e)))
    }

    /// 書き換え対象の変数で残るべき要素（除去対象と空要素を除いた元の順序の列）。
    fn expected_kept(key: &str, value: &str) -> Vec<String> {
        value
            .split(':')
            .filter(|e| {
                !e.is_empty() && !under_appdir(e) && !(key == "LD_LIBRARY_PATH" && is_openh264(e))
            })
            .map(String::from)
            .collect()
    }

    proptest! {
        #[test]
        fn 除去後のどの変数のどの要素も旧appdir配下ではない(env in env_strategy()) {
            let out = build_relaunch_env(&env, APPDIR, OH);
            for (k, v) in &out {
                for e in v.split(':') {
                    prop_assert!(!under_appdir(e), "{k}={v}");
                }
            }
        }

        #[test]
        fn 禁止キーは出力に現れない(env in env_strategy()) {
            let out = build_relaunch_env(&env, APPDIR, OH);
            for k in ["APPDIR", "APPIMAGE", "ARGV0", "OWD", "MULTI_COLUMN_X_LD_PATH_PRIMED"] {
                prop_assert!(!out.contains_key(k), "{k}");
            }
        }

        #[test]
        fn 旧appdir配下を含まない変数は値がバイト単位で変わらない(env in env_strategy()) {
            let out = build_relaunch_env(&env, APPDIR, OH);
            for (k, v) in &env {
                if DROPPED_KEYS.contains(&k.as_str()) || is_touched(k, v) {
                    continue;
                }
                prop_assert_eq!(out.get(k), Some(v), "{}", k);
            }
        }

        #[test]
        fn 書き換えた変数は残る要素が元の順序を保ち空要素を含まない(env in env_strategy()) {
            let out = build_relaunch_env(&env, APPDIR, OH);
            for (k, v) in &env {
                if DROPPED_KEYS.contains(&k.as_str()) || !is_touched(k, v) {
                    continue;
                }
                let kept = expected_kept(k, v);
                match out.get(k) {
                    None => prop_assert!(kept.is_empty(), "{k}={v}"),
                    Some(new) => {
                        prop_assert!(!new.is_empty(), "{k}");
                        let got: Vec<String> = new.split(':').map(String::from).collect();
                        prop_assert!(got.iter().all(|e| !e.is_empty()), "{k}={new}");
                        prop_assert_eq!(got, kept, "{}", k);
                    }
                }
            }
        }

        #[test]
        fn openh264の配置先はld_library_pathからだけ取り除かれる(env in env_strategy()) {
            let out = build_relaunch_env(&env, APPDIR, OH);
            if let Some(v) = out.get("LD_LIBRARY_PATH") {
                prop_assert!(!v.split(':').any(is_openh264), "{v}");
            }
            for (k, v) in &env {
                if k == "LD_LIBRARY_PATH" || DROPPED_KEYS.contains(&k.as_str()) {
                    continue;
                }
                let before = v.split(':').filter(|e| is_openh264(e)).count();
                let after = out
                    .get(k)
                    .map_or(0, |n| n.split(':').filter(|e| is_openh264(e)).count());
                // APPDIR 配下の要素だけが除かれるので、OpenH264 配置先は 1 つも減らない。
                prop_assert_eq!(before, after, "{}", k);
            }
        }

        #[test]
        fn 整理済みの環境をもう一度整理しても変わらない(env in env_strategy()) {
            let once = build_relaunch_env(&env, APPDIR, OH);
            let twice = build_relaunch_env(&once, APPDIR, OH);
            prop_assert_eq!(once, twice);
        }

        #[test]
        fn 作業ディレクトリは候補のいずれかかルートで旧appdir配下ではない(
            owd in prop::option::of(element()),
            home in prop::option::of(element()),
            dirs in prop::collection::vec(any::<bool>(), 2),
        ) {
            let is_dir = |p: &Path| {
                let s = p.to_string_lossy();
                (owd.as_deref() == Some(&*s) && dirs[0]) || (home.as_deref() == Some(&*s) && dirs[1])
            };
            let cwd = choose_cwd(owd.as_deref(), home.as_deref(), APPDIR, is_dir);
            let s = cwd.to_string_lossy().into_owned();
            prop_assert!(!under_appdir(&s), "{s}");
            if s != "/" {
                prop_assert!(owd.as_deref() == Some(&*s) || home.as_deref() == Some(&*s));
                prop_assert!(is_dir(&cwd));
            }
            // OWD が使える（空でなく配下でなく実在）なら OWD が優先される。
            if let Some(o) = owd.as_deref() {
                if !o.is_empty() && !under_appdir(o) && dirs[0] {
                    prop_assert_eq!(s, o);
                }
            }
        }

        #[test]
        fn plan_relaunchは任意の引数列を保持し環境を整理する(
            mut env in env_strategy(),
            args in prop::collection::vec("[ -~]{0,8}", 0..6),
        ) {
            env.insert("APPIMAGE".to_string(), "/opt/app.AppImage".to_string());
            env.insert("APPDIR".to_string(), APPDIR.to_string());
            let args: Vec<OsString> = args.into_iter().map(OsString::from).collect();
            let plan = plan_relaunch(&env, args.clone(), Path::new(OH), |_| true);
            let RelaunchPlan::AppImage(launch) = plan else {
                return Err(TestCaseError::fail("AppImage を期待"));
            };
            prop_assert_eq!(launch.args, args);
            prop_assert_eq!(launch.program, PathBuf::from("/opt/app.AppImage"));
            prop_assert!(!under_appdir(&launch.cwd.to_string_lossy()));
            prop_assert_eq!(
                launch.env.get("PWD").map(String::as_str),
                Some(&*launch.cwd.to_string_lossy())
            );
            for (k, v) in &launch.env {
                prop_assert!(!DROPPED_KEYS.contains(&k.as_str()), "{k}");
                if k != "PWD" {
                    prop_assert!(v.split(':').all(|e| !under_appdir(e)), "{k}={v}");
                }
            }
        }
    }
}
