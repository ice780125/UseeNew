/**
 * Regenerate server/accounts.json (hashed) and ACCOUNTS.local.md (plaintext).
 * Usernames: onekey001 … onekey030 · passwords: unique 15-digit numeric strings.
 * Run: npm run accounts:regen
 */
import crypto from "crypto";
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";

const root = path.join(path.dirname(fileURLToPath(import.meta.url)), "..", "..");
const COUNT = 30;

/** Deterministic 15-digit password per slot (stable across regen, looks random). */
function passwordForIndex(i) {
  const buf = crypto.createHash("sha256").update(`usee-onekey-pwd-v3-${i}`).digest();
  const digits = [];
  for (let k = 0; k < 15; k++) {
    digits.push(buf[k % buf.length] % 10);
  }
  if (digits[0] === 0) digits[0] = 1 + (i % 9);
  return digits.join("");
}

const seen = new Set();
const accounts = [];
const lines = [
  "# Usee 登录账号（请妥善保管，勿提交到公开仓库）",
  "",
  "账号：`onekey001` … `onekey030`",
  "密码：15 位数字（每账号不同，重新运行 regen 后密码不变）",
  "会员：首次登录起 30 天；每账号 3 次免费生成。",
  "",
  "| 账号 | 密码 |",
  "|------|------|",
];

for (let i = 1; i <= COUNT; i++) {
  const username = `onekey${String(i).padStart(3, "0")}`;
  let password = passwordForIndex(i);
  while (seen.has(password)) {
    password = passwordForIndex(i + seen.size * 997);
  }
  seen.add(password);
  const salt = crypto.randomBytes(16).toString("hex");
  const passwordHash = crypto.scryptSync(password, salt, 64).toString("hex");
  accounts.push({ username, salt, passwordHash });
  lines.push(`| ${username} | ${password} |`);
}

fs.writeFileSync(path.join(root, "server", "accounts.json"), JSON.stringify(accounts, null, 2));
fs.writeFileSync(path.join(root, "ACCOUNTS.local.md"), `${lines.join("\n")}\n`);
console.log(`Wrote ${COUNT} accounts → server/accounts.json & ACCOUNTS.local.md`);
