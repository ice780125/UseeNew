/**
 * Regenerate server/accounts.json (hashed) and ACCOUNTS.local.md (plaintext).
 * Usernames: Onekey001 … Onekey030 · passwords: fixed 15-digit (stable across regen).
 * Run: npm run accounts:regen
 */
import crypto from "crypto";
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";

const root = path.join(path.dirname(fileURLToPath(import.meta.url)), "..", "..");
const COUNT = 30;

/** Same index always yields the same 15-digit password (900000000000001 …). */
function fixedPasswordForIndex(i) {
  return String(900_000_000_000_000 + i).padStart(15, "0");
}

const accounts = [];
const lines = [
  "# Usee 登录账号（请妥善保管，勿提交到公开仓库）",
  "",
  "账号：`Onekey001` … `Onekey030`；密码：固定 15 位数字（重新生成账号文件时密码不变）。",
  "每账号可免费生成 3 张图，用完后登录页显示：需要付费使用。",
  "",
  "| 账号 | 密码 |",
  "|------|------|",
];

for (let i = 1; i <= COUNT; i++) {
  const username = `Onekey${String(i).padStart(3, "0")}`;
  const password = fixedPasswordForIndex(i);
  const salt = crypto.randomBytes(16).toString("hex");
  const passwordHash = crypto.scryptSync(password, salt, 64).toString("hex");
  accounts.push({ username, salt, passwordHash });
  lines.push(`| ${username} | ${password} |`);
}

fs.writeFileSync(path.join(root, "server", "accounts.json"), JSON.stringify(accounts, null, 2));
fs.writeFileSync(path.join(root, "ACCOUNTS.local.md"), `${lines.join("\n")}\n`);
console.log(`Wrote ${COUNT} accounts → server/accounts.json & ACCOUNTS.local.md`);
