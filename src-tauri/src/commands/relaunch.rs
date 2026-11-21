//! アプリの再起動に使う純粋関数群。AppImage では旧マウントを指す環境変数・作業ディレクトリを
//! 新プロセスへ引き継がないよう整理した上で `$APPIMAGE` を起動し直す。それ以外は tauri の再起動に委ねる。
#![cfg_attr(not(test), allow(dead_code))]

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
pub(crate) struct AppImageLaunch {
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
/// 残りがあれば `Some(Some(新値))`。
fn strip_entries(value: &str, should_drop: impl Fn(&str) -> bool) -> Option<Option<String>> {
    let entries: Vec<&str> = value.split(':').collect();
    let kept: Vec<&str> = entries
        .iter()
        .copied()
        .filter(|e| !should_drop(e))
        .collect();
    if kept.len() == entries.len() {
        None
    } else if kept.is_empty() {
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
/// `APPIMAGE` が絶対パスのときだけ AppImage 起動し直しにする。
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
    if appimage.is_empty() || appdir.is_empty() || !Path::new(appimage).is_absolute() {
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
