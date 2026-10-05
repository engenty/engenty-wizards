/**
 * Android refuses plain http in a release build. Runtimes are reached over https; only a runtime
 * on this computer (the emulator's 10.0.2.2, or localhost through `adb reverse`) may answer over
 * http, for trying the app against a local install. iOS has the same through
 * `NSAllowsLocalNetworking` in app.json.
 */
const { AndroidConfig, withAndroidManifest, withDangerousMod } = require("expo/config-plugins");
const { mkdirSync, writeFileSync } = require("node:fs");
const { join } = require("node:path");

const XML = `<?xml version="1.0" encoding="utf-8"?>
<network-security-config>
  <base-config cleartextTrafficPermitted="false" />
  <domain-config cleartextTrafficPermitted="true">
    <domain includeSubdomains="false">localhost</domain>
    <domain includeSubdomains="false">127.0.0.1</domain>
    <domain includeSubdomains="false">10.0.2.2</domain>
  </domain-config>
</network-security-config>
`;

module.exports = function withLocalHttp(config) {
  config = withDangerousMod(config, [
    "android",
    (cfg) => {
      const dir = join(cfg.modRequest.platformProjectRoot, "app/src/main/res/xml");
      mkdirSync(dir, { recursive: true });
      writeFileSync(join(dir, "network_security_config.xml"), XML);
      return cfg;
    },
  ]);
  return withAndroidManifest(config, (cfg) => {
    const app = AndroidConfig.Manifest.getMainApplicationOrThrow(cfg.modResults);
    app.$["android:networkSecurityConfig"] = "@xml/network_security_config";
    return cfg;
  });
};
