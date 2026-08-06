const fs = require("fs");
const path = require("path");

const env = { NODE_ENV: "production", PORT: "3010" };
const envPath = path.join(__dirname, ".env");
if (fs.existsSync(envPath)) {
  for (const line of fs.readFileSync(envPath, "utf8").split("\n")) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#")) continue;
    const i = trimmed.indexOf("=");
    if (i === -1) continue;
    env[trimmed.slice(0, i)] = trimmed.slice(i + 1);
  }
}

module.exports = {
  apps: [
    {
      name: "formbatch",
      cwd: __dirname,
      script: "pnpm",
      args: "start",
      env,
      max_memory_restart: "512M",
      time: true,
      // Prefer a clean handoff after build; avoid long hang on stuck workers.
      kill_timeout: 8000,
      listen_timeout: 15000,
      exp_backoff_restart_delay: 500,
    },
  ],
};
