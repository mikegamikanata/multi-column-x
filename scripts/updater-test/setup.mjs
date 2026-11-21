import { spawnSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import { KEY_PATH, KEYS_DIR } from "./constants.mjs";

function main() {
  if (fs.existsSync(KEY_PATH)) {
    console.log(`Test signing key already exists: ${KEY_PATH}`);
    console.log("Nothing to do.");
    return;
  }
  fs.mkdirSync(KEYS_DIR, { recursive: true });
  console.log(`Generating a throwaway signing key: ${KEY_PATH}`);
  const keyArg = path.relative(process.cwd(), KEY_PATH);
  const result = spawnSync(
    `npx tauri signer generate --ci -p "" -w "${keyArg}"`,
    { stdio: "inherit", shell: true },
  );
  if (result.status !== 0 || !fs.existsSync(KEY_PATH)) {
    console.error("Failed to generate the test signing key.");
    process.exit(result.status || 1);
  }
  console.log("Done. The key lives under tmp/ and is not tracked by git.");
}

main();
