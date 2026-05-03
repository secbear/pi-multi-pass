import assert from "node:assert/strict";
import { mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

const agentDir = mkdtempSync(join(tmpdir(), "multi-pass-login-"));
process.env.PI_CODING_AGENT_DIR = agentDir;
writeFileSync(
  join(agentDir, "multi-pass.json"),
  JSON.stringify({
    subscriptions: [{ provider: "anthropic", index: 2, label: "adviceai" }],
    pools: [],
    chains: [],
    presets: [],
  }),
);

const extension = await import("../extensions/multi-sub.ts");
const commands = new Map();
const providers = [];
const pi = {
  registerProvider(name, config) {
    providers.push({ name, oauthName: config.oauth?.name, models: config.models?.length ?? 0 });
  },
  registerCommand(name, command) {
    commands.set(name, command);
  },
  on() {},
  setLabel() {},
  setModel: async () => true,
};

extension.default(pi);
assert.deepEqual(providers.map((provider) => provider.name), ["anthropic-2"]);
assert.equal(commands.has("subs"), true);

const loginCalls = [];
let refreshCalls = 0;
const notifications = [];
const widgets = [];
const statuses = [];
let selectCalled = false;

const ctx = {
  cwd: process.cwd(),
  model: undefined,
  modelRegistry: {
    authStorage: {
      hasAuth: () => false,
      async login(providerName, callbacks) {
        loginCalls.push(providerName);
        callbacks.onAuth({ url: "https://auth.example/login", instructions: "finish auth" });
        callbacks.onProgress("waiting for auth");
        const manualCode = await callbacks.onManualCodeInput();
        assert.equal(manualCode, "redirect-url");
      },
      logout() {},
    },
    async refresh() {
      refreshCalls += 1;
    },
  },
  ui: {
    async select() {
      selectCalled = true;
      return undefined;
    },
    async confirm() {
      return false;
    },
    async input(message, placeholder) {
      notifications.push({ kind: "input", message, placeholder });
      return "redirect-url";
    },
    notify(message, type = "info") {
      notifications.push({ kind: "notify", message, type });
    },
    setStatus(key, text) {
      statuses.push({ key, text });
    },
    setWidget(key, content) {
      widgets.push({ key, content });
    },
  },
};

await commands.get("subs").handler("login anthropic-2", ctx);

assert.equal(selectCalled, false, "direct provider argument should not open selector");
assert.deepEqual(loginCalls, ["anthropic-2"]);
assert.equal(refreshCalls, 1);
assert.equal(widgets.some((entry) => Array.isArray(entry.content) && entry.content.includes("https://auth.example/login")), true);
assert.deepEqual(widgets.at(-1), { key: "multi-pass-login", content: undefined });
assert.equal(statuses.at(-1).key, "multi-pass-login");
assert.equal(statuses.at(-1).text, undefined);
assert.equal(
  notifications.some((entry) => entry.kind === "notify" && entry.message.includes("Successfully logged in")),
  true,
);
assert.equal(
  notifications.some((entry) => entry.kind === "notify" && entry.message.includes("Use /login")),
  false,
);
console.log("subs login checks passed");
