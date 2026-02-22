#!/usr/bin/env node

/**
 * Some Expo Android packages ship a duplicate `android/bin` source tree.
 * Expo autolinking scans the module sourceDir recursively and can pick up
 * duplicate Package classes from `src` and `bin`, which leads to double
 * lifecycle listener registration (e.g., DevLauncher initialization crash).
 */

const fs = require("fs");
const path = require("path");

const projectRoot = path.resolve(__dirname, "..");
const targets = [
  "node_modules/expo/android/bin",
  "node_modules/expo-dev-launcher/android/bin",
  "node_modules/expo-dev-menu/android/bin",
  "node_modules/expo-modules-core/android/bin",
  "node_modules/expo-constants/android/bin",
];

let removed = 0;

for (const rel of targets) {
  const abs = path.join(projectRoot, rel);
  if (fs.existsSync(abs)) {
    fs.rmSync(abs, { recursive: true, force: true });
    removed += 1;
    process.stdout.write(`[clean-expo-android-bin] removed ${rel}\n`);
  }
}

if (removed === 0) {
  process.stdout.write("[clean-expo-android-bin] no duplicate android/bin dirs found\n");
}
