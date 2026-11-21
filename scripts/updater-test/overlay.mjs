import { LOCAL_HOSTS, PORT } from "./constants.mjs";

/** 試験ビルドで画面から到達を許可するオリジン。 */
export const TEST_ORIGINS = LOCAL_HOSTS.map((host) => `http://${host}`);

/** 試験ビルドが更新情報を取りに行くエンドポイント。 */
export const TEST_ENDPOINT = `http://localhost:${PORT}/latest.json`;

/**
 * CSP 文字列の connect-src にオリジンを追加する。他ディレクティブと順序は維持する。
 * connect-src が無い場合は default-src を引き継いだ connect-src を末尾に足す。
 * @param {string} csp
 * @param {readonly string[]} origins
 */
export function addConnectSrcOrigins(csp, origins) {
  const directives = csp
    .split(";")
    .map((d) => d.trim())
    .filter((d) => d !== "");
  const index = directives.findIndex(
    (d) => d.split(/\s+/)[0].toLowerCase() === "connect-src",
  );
  if (index >= 0) {
    directives[index] = [directives[index], ...origins].join(" ");
  } else {
    const defaultSrc = directives.find(
      (d) => d.split(/\s+/)[0].toLowerCase() === "default-src",
    );
    const base = defaultSrc ? defaultSrc.split(/\s+/).slice(1) : [];
    directives.push(["connect-src", ...base, ...origins].join(" "));
  }
  return directives.join("; ");
}

/**
 * tauri `--config` に渡す試験用の重ね設定（JSON Merge Patch）を作る。
 * @param {{ baseConf: any, pubkey: string, version: string, origins: readonly string[] }} p
 */
export function buildTestOverlay({ baseConf, pubkey, version, origins }) {
  const baseCsp = baseConf?.app?.security?.csp;
  if (typeof baseCsp !== "string") {
    throw new Error("app.security.csp is missing in the base config");
  }
  return {
    version,
    plugins: {
      updater: {
        pubkey: pubkey.trim(),
        endpoints: [TEST_ENDPOINT],
        dangerousInsecureTransportProtocol: true,
      },
    },
    app: { security: { csp: addConnectSrcOrigins(baseCsp, origins) } },
  };
}
