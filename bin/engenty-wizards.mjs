#!/usr/bin/env node
// The `engenty-wizards` command. Kept to what every Node understands, so that an old one gets
// a sentence instead of a syntax error.
const [major, minor] = process.versions.node.split(".").map(Number);
if (major < 24 || (major === 24 && minor < 11)) {
  console.error(
    `engenty wizards needs Node.js 24.11 or newer; this is ${process.version}.\n` +
      "The installer brings its own and leaves yours alone:\n\n" +
      "  curl -fsSL https://engenty.ai/wizards.sh | bash\n",
  );
  process.exit(1);
}
await import("../apps/runtime/dist/cli/main.js");
