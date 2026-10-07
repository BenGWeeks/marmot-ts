import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { test } from "node:test";

const script = path.resolve("scripts/release-next.sh");

for (const scenario of [
  "success",
  "auth",
  "branch",
  "remote",
  "dirty",
  "duplicate",
  "build",
  "verify",
  "publish",
]) {
  test(`next release: ${scenario}`, () => {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), "release-next-test-"));
    try {
      const bin = path.join(root, "bin");
      fs.mkdirSync(bin);
      fs.mkdirSync(path.join(root, "scripts"));
      const manifest =
        '{"name":"@internet-privacy/marmot-ts","version":"0.6.0"}\n';
      fs.writeFileSync(path.join(root, "package.json"), manifest);
      fs.writeFileSync(path.join(root, "pnpm-lock.yaml"), "original lock\n");
      fs.writeFileSync(
        path.join(root, "scripts/verify-package-tarball.mjs"),
        `
import fs from 'node:fs';
const args = process.argv.slice(2);
const tarball = args[args.indexOf('--tarball') + 1];
if (!fs.existsSync(tarball) || !args.includes('--check-fork-unpublished')) process.exit(99);
fs.appendFileSync('calls', 'verified ' + tarball + '\\n');
if (process.env.SCENARIO === 'verify') process.exit(1);
`,
      );
      const mocks = {
        git: `case "$1" in
branch) if [ "$SCENARIO" = branch ]; then echo feature; else echo master; fi ;;
fetch) exit 0 ;;
rev-parse) if [ "$SCENARIO" = remote ] && [ "$2" != HEAD ]; then echo other; else echo head; fi ;;
status) if [ "$SCENARIO" = dirty ]; then echo ' M file'; fi ;;
*) exit 99 ;;
esac`,
        npm: `[ "$1" = whoami ] || exit 99
[ "$SCENARIO" != auth ]`,
        pnpm: `echo "$*" >> calls
case "$1" in
view) [ "$SCENARIO" = duplicate ] ;;
build) echo modified > pnpm-lock.yaml; [ "$SCENARIO" != build ] ;;
pack) cp package.json "$3/package.tgz" ;;
publish) [ "$3 $4 $5 $6 $7" = '--tag next --access public --no-git-checks' ] || exit 99
  cmp package.json "$2" || exit 99
  [ "$SCENARIO" != publish ] ;;
*) exit 99 ;;
esac`,
      };
      for (const [name, body] of Object.entries(mocks)) {
        fs.writeFileSync(
          path.join(bin, name),
          `#!/usr/bin/env bash\n${body}\n`,
          { mode: 0o755 },
        );
      }
      const result = spawnSync("bash", [script], {
        cwd: root,
        env: {
          ...process.env,
          PATH: `${bin}:${process.env.PATH}`,
          SCENARIO: scenario,
          SKIP_GIT_CHECK: "",
        },
        encoding: "utf8",
      });
      assert.equal(
        result.status === 0,
        scenario === "success",
        result.stdout + result.stderr,
      );
      assert.equal(
        fs.readFileSync(path.join(root, "package.json"), "utf8"),
        manifest,
      );
      assert.equal(
        fs.readFileSync(path.join(root, "pnpm-lock.yaml"), "utf8"),
        "original lock\n",
      );
      const calls = fs.existsSync(path.join(root, "calls"))
        ? fs.readFileSync(path.join(root, "calls"), "utf8")
        : "";
      if (scenario === "success") {
        assert.match(result.stdout, /marmot-ts@0\.6\.1-next\.\d{14}/);
        const verified = calls.match(/^verified (.+)$/m)[1];
        assert.ok(
          calls.includes(
            `publish ${verified} --tag next --access public --no-git-checks`,
          ),
        );
      } else if (scenario !== "publish") {
        assert.doesNotMatch(calls, /^publish /m);
      }
    } finally {
      fs.rmSync(root, { recursive: true, force: true });
    }
  });
}
