/**
 * Regenerate server/accounts.json (hashed) and ACCOUNTS.local.md (plaintext).
 * Usernames: onekey001 … onekey005 · passwords: unique 7-digit numbers.
 * Run: npm run accounts:regen
 */
import crypto from "crypto";
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";

const root = path.join(path.dirname(fileURLToPath(import.meta.url)), "..", "..");
const COUNT = 5;

/** Reject runs, short sequences, and numbers made of only one or two digits. */
function looksPatterned(password) {
  if (/(\d)\1{2,}/.test(password)) return true;
  const counts = {};
  for (const digit of password) counts[digit] = (counts[digit] || 0) + 1;
  if (Math.max(...Object.values(counts)) >= 3) return true;
  if (new Set(password).size < 5) return true;
  const digits = [...password].map(Number);
  const steps = digits.slice(1).map((n, i) => n - digits[i]);
  if (steps.every((step) => step === steps[0])) return true;
  for (let i = 0; i < digits.length - 2; i++) {
    const a = digits[i + 1] - digits[i];
    const b = digits[i + 2] - digits[i + 1];
    if (a !== 0 && a === b && Math.abs(a) === 1) return true;
  }
  if (/^(\d{2})\1{2}\d$/.test(password) || /^(\d{3})\1\d$/.test(password)) return true;
  return false;
}

/** Deterministic 7-digit password per slot (stable across regen). */
function passwordForIndex(i) {
  let n = i;
  for (let attempt = 0; attempt < 40; attempt++) {
    const buf = crypto.createHash("sha256").update(`usee-onekey-pwd-v4-${n}`).digest();
    const value = buf.readUInt32BE(0) % 9000000 + 1000000;
    const password = String(value);
    if (!looksPatterned(password)) return password;
    n += 97;
  }
  return String(1000000 + ((i * 7919) % 9000000));
}

const seen = new Set();
const accounts = [];
const lines = [
  "# Usee 登录账号（请妥善保管，勿提交到公开仓库）",
  "",
  "账号：`onekey001` … `onekey005`",
  "密码：7 位数字（每账号不同，重新运行 regen 后密码不变）",
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
