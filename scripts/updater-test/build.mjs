import {
  ARTIFACTS_DIR,
  KEY_PATH,
  OVERLAY_CONFIG_PATH,
  PORT,
  RELEASE_JSON_PATH,
  REPO_ROOT,
} from "./constants.mjs";
import { compareVersions } from "./manifest.mjs";
import { buildTestOverlay, TEST_ORIGINS } from "./overlay.mjs";
import { createHash } from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import { spawnSync } from "node:child_process";
import { parseArgs } from "node:util";
import { pathToFileURL } from "node:url";

/**
 * 試験ビルド CLI（純粋関数は export してテストする）。
 */

const TARGETS = ["windows", "linux", "android"];

/**
 * @param {string[]} argv
 */
export function parseBuildArgs(argv) {
  const { values } = parseArgs({
    args: argv,
    options: {
      target: { type: "string" },
      role: { type: "string" },
      version: { type: "string" },
      notes: { type: "string" },
      emulator: { type: "boolean", default: false },
    },
  });
  if (!TARGETS.includes(String(values.target))) {
    throw new Error("--target must be one of: " + TARGETS.join(", "));
  }
  if (values.role !== "old" && values.role !== "new") {
    throw new Error("--role must be one of: old, new");
  }
  return {
    target: values.target,
    role: values.role,
    version: values.version,
    notes: values.notes,
    emulator: values.emulator ?? false,
  };
}

/**
 * ビルドに使うバージョンを決める。
 * @param {{ role: "old" | "new", version: string | undefined, baseVersion: string }} p
 */
export function resolveBuildVersion({ role, version, baseVersion }) {
  if (role === "new" && !version) {
    throw new Error("--version is required when --role is new");
  }
  if (role === "new" && version && compareVersions(version, baseVersion) <= 0) {
    throw new Error(
      `--version (${version}) must be greater than the current version (${baseVersion})`,
    );
  }
  return version ?? baseVersion;
}

/**
 * 実行するコマンド列を返す（shell 経由で実行する前提）。
 * @param {{ target: "windows" | "linux" | "android", overlayPath: string }} p
 * @returns {{ command: string, args: string[] }[]}
 */
export function buildCommands({ target, overlayPath }) {
  const inject = { command: "npm", args: ["run", "build:inject"] };
  if (target === "android") {
    return [
      inject,
      {
        command: "npx",
        args: [
          "tauri",
          "android",
          "build",
          "--debug",
          "--apk",
          "--features",
          "updater-test",
          "--config",
          overlayPath,
        ],
      },
    ];
  }
  const bundle = target === "linux" ? "appimage" : "nsis";
  return [
    inject,
    {
      command: "npx",
      args: ["tauri", "build", "--config", overlayPath, "--bundles", bundle],
    },
  ];
}

/**
 * 子プロセスに渡す環境変数を作る。
 * @param {{ target: string, emulator: boolean, keyContent: string, baseEnv: Record<string, string | undefined> }} p
 */
export function buildEnv({ target, emulator, keyContent, baseEnv }) {
  /** @type {Record<string, string | undefined>} */
  const env = {
    ...baseEnv,
    TAURI_SIGNING_PRIVATE_KEY: keyContent,
    TAURI_SIGNING_PRIVATE_KEY_PASSWORD: "",
  };
  if (target === "android") {
    env.VITE_UPDATER_RELEASE_API_BASE = `http://${emulator ? "10.0.2.2" : "localhost"}:${PORT}`;
  }
  return env;
}

/**
 * release.json に今回の成果物を反映する。
 * @param {Record<string, any> | null} existing
 * @param {{ version: string, notes: string, pubDate: string, platformKey: "windows" | "linux" | "apk", entry: object }} p
 */
export function mergeReleaseJson(
  existing,
  { version, notes, pubDate, platformKey, entry },
) {
  const kept = existing && existing.version === version ? existing : {};
  return { ...kept, version, notes, pubDate, [platformKey]: entry };
}

/**
 * バンドル出力ディレクトリのファイル名一覧から成果物と sig を探す。
 * @param {string[]} fileNames
 * @param {"windows" | "linux"} target
 * @param {string} version
 * @returns {{ file: string, sig: string } | null}
 */
export function findDesktopArtifact(fileNames, target, version) {
  const suffix =
    target === "linux"
      ? `_${version}_amd64.AppImage`
      : `_${version}_x64-setup.exe`;
  const file = fileNames.find((n) => n.endsWith(suffix));
  if (!file || !fileNames.includes(`${file}.sig`)) return null;
  return { file, sig: `${file}.sig` };
}

/**
 * 配信する APK の保存名（Rust 側が空白を拒否するため空白を含めない）。
 * @param {string} version
 */
export function apkFileName(version) {
  return `multicolumnx-${version}-universal-debug.apk`;
}

const TAURI_CONF_PATH = path.join(REPO_ROOT, "src-tauri", "tauri.conf.json");
const TAURI_PROPERTIES_PATH = path.join(
  REPO_ROOT,
  "src-tauri",
  "gen",
  "android",
  "app",
  "tauri.properties",
);
const BUNDLE_DIRS = {
  windows: path.join(
    REPO_ROOT,
    "src-tauri",
    "target",
    "release",
    "bundle",
    "nsis",
  ),
  linux: path.join(
    REPO_ROOT,
    "src-tauri",
    "target",
    "release",
    "bundle",
    "appimage",
  ),
};
const APK_BUILD_PATH = path.join(
  REPO_ROOT,
  "src-tauri",
  "gen",
  "android",
  "app",
  "build",
  "outputs",
  "apk",
  "universal",
  "debug",
  "app-universal-debug.apk",
);

/** @param {string} p */
function rel(p) {
  return path.relative(REPO_ROOT, p).split(path.sep).join("/");
}

/**
 * @param {string} message
 * @returns {never}
 */
function fail(message) {
  console.error(message);
  process.exit(1);
}

/**
 * コマンド列を順に実行する。失敗したら例外を投げる。
 * @param {{ command: string, args: string[] }[]} commands
 * @param {Record<string, string | undefined>} env
 */
function runCommands(commands, env) {
  for (const { command, args } of commands) {
    const line = [command, ...args].join(" ");
    console.log(`> ${line}`);
    const result = spawnSync(line, {
      stdio: "inherit",
      shell: true,
      env,
      cwd: REPO_ROOT,
    });
    if (result.status !== 0) {
      throw new Error(`Command failed (exit ${result.status}): ${line}`);
    }
  }
}

/**
 * 成果物を artifacts/ にコピーし release.json を更新する。
 * @param {{ target: "windows" | "linux" | "android", version: string, notes: string }} p
 */
function publishArtifacts({ target, version, notes }) {
  fs.mkdirSync(ARTIFACTS_DIR, { recursive: true });
  /** @type {"windows" | "linux" | "apk"} */
  let platformKey;
  /** @type {object} */
  let entry;
  if (target === "android") {
    if (!fs.existsSync(APK_BUILD_PATH)) {
      fail(`APK not found. Searched: ${APK_BUILD_PATH}`);
    }
    const file = apkFileName(version);
    fs.copyFileSync(APK_BUILD_PATH, path.join(ARTIFACTS_DIR, file));
    const sha256 = createHash("sha256")
      .update(fs.readFileSync(APK_BUILD_PATH))
      .digest("hex");
    platformKey = "apk";
    entry = { file, sha256 };
  } else {
    const dir = BUNDLE_DIRS[target];
    const names = fs.existsSync(dir) ? fs.readdirSync(dir) : [];
    const found = findDesktopArtifact(names, target, version);
    if (!found) {
      fail(
        `Artifact for version ${version} (with .sig) not found. Searched: ${dir}`,
      );
    }
    fs.copyFileSync(
      path.join(dir, found.file),
      path.join(ARTIFACTS_DIR, found.file),
    );
    fs.copyFileSync(
      path.join(dir, found.sig),
      path.join(ARTIFACTS_DIR, found.sig),
    );
    platformKey = target;
    entry = found;
  }
  /** @type {Record<string, any> | null} */
  let existing = null;
  if (fs.existsSync(RELEASE_JSON_PATH)) {
    existing = JSON.parse(fs.readFileSync(RELEASE_JSON_PATH, "utf8"));
  }
  const release = mergeReleaseJson(existing, {
    version,
    notes,
    pubDate: new Date().toISOString(),
    platformKey,
    entry,
  });
  fs.writeFileSync(RELEASE_JSON_PATH, JSON.stringify(release, null, 2) + "\n");
  console.log(
    `Updated ${rel(RELEASE_JSON_PATH)} (${platformKey}: version ${version})`,
  );
}

/** @param {"windows" | "linux" | "android"} target @param {string} version */
function printOldBuildGuide(target, version) {
  console.log(
    `Built the "old" app (version ${version}). Install it, then run the serve script and check for updates.`,
  );
  if (target === "android") {
    console.log(`  APK: ${APK_BUILD_PATH}`);
    console.log(
      "  Install: adb install -r <apk>  (real device: also run adb reverse tcp:8787 tcp:8787)",
    );
  } else {
    console.log(`  Output dir: ${BUNDLE_DIRS[target]}`);
    console.log(
      target === "windows"
        ? "  Install: run the *_x64-setup.exe"
        : "  Run: chmod +x the *.AppImage and launch it",
    );
  }
}

function main() {
  const args = parseBuildArgs(process.argv.slice(2));
  const target = /** @type {"windows" | "linux" | "android"} */ (args.target);
  const role = /** @type {"old" | "new"} */ (args.role);
  if (!fs.existsSync(KEY_PATH)) {
    fail("Test signing key not found. Run: npm run updater-test:setup");
  }
  const baseConf = JSON.parse(fs.readFileSync(TAURI_CONF_PATH, "utf8"));
  const version = resolveBuildVersion({
    role,
    version: args.version,
    baseVersion: baseConf.version,
  });
  const keyContent = fs.readFileSync(KEY_PATH, "utf8").trim();
  const pubkey = fs.readFileSync(`${KEY_PATH}.pub`, "utf8").trim();
  const overlay = buildTestOverlay({
    baseConf,
    pubkey,
    version,
    origins: TEST_ORIGINS,
  });
  fs.mkdirSync(path.dirname(OVERLAY_CONFIG_PATH), { recursive: true });
  fs.writeFileSync(
    OVERLAY_CONFIG_PATH,
    JSON.stringify(overlay, null, 2) + "\n",
  );
  console.log(`Wrote overlay config: ${rel(OVERLAY_CONFIG_PATH)}`);

  const commands = buildCommands({
    target,
    overlayPath: rel(OVERLAY_CONFIG_PATH),
  });
  const env = buildEnv({
    target,
    emulator: args.emulator,
    keyContent,
    baseEnv: process.env,
  });

  // Android: tauri-cli rewrites tauri.properties (versionCode); restore it afterwards.
  const propertiesBackup =
    target === "android" && fs.existsSync(TAURI_PROPERTIES_PATH)
      ? fs.readFileSync(TAURI_PROPERTIES_PATH)
      : null;
  try {
    runCommands(commands, env);
  } catch (error) {
    fail(error instanceof Error ? error.message : String(error));
  } finally {
    if (propertiesBackup !== null) {
      fs.writeFileSync(TAURI_PROPERTIES_PATH, propertiesBackup);
    }
  }

  if (role === "new") {
    publishArtifacts({
      target,
      version,
      notes: args.notes ?? `Local updater test build ${version}`,
    });
  } else {
    printOldBuildGuide(target, version);
  }
}

const isMain =
  process.argv[1] !== undefined &&
  import.meta.url === pathToFileURL(process.argv[1]).href;
if (isMain) {
  try {
    main();
  } catch (error) {
    fail(error instanceof Error ? error.message : String(error));
  }
}
