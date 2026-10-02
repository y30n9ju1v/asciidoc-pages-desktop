import { existsSync } from 'node:fs';
import { spawnSync } from 'node:child_process';
import { resolve } from 'node:path';

const requiredTargets = ['aarch64-apple-ios', 'aarch64-apple-ios-sim'];
const generatedProject = resolve('src-tauri/gen/apple');

function fail(message) {
  throw new Error(message);
}

function commandOutput(command, args) {
  const result = spawnSync(command, args, { encoding: 'utf8' });
  if (result.error) fail(`Could not run ${command}: ${result.error.message}`);
  if (result.status !== 0) fail(`${result.stdout ?? ''}${result.stderr ?? ''}`.trim() || `${command} failed.`);
  return `${result.stdout ?? ''}${result.stderr ?? ''}`;
}

function assertMacHost() {
  if (process.platform !== 'darwin') fail('iOS builds must run on macOS.');
}

function assertXcode() {
  commandOutput('xcodebuild', ['-version']);
  commandOutput('xcrun', ['simctl', 'list', 'devices']);
}

function assertCocoaPods() {
  commandOutput('pod', ['--version']);
}

function assertRustTargets() {
  const installed = commandOutput('rustup', ['target', 'list', '--installed']);
  const missing = requiredTargets.filter((target) => !installed.split(/\r?\n/).includes(target));
  if (missing.length > 0) {
    fail(`Missing iOS Rust target(s): ${missing.join(', ')}. Run: rustup target add ${missing.join(' ')}`);
  }
}

function assertGeneratedProject() {
  if (!existsSync(generatedProject)) {
    fail('The iOS Xcode project has not been generated. Run: npm run ios:init');
  }
}

assertMacHost();
assertXcode();
assertCocoaPods();
assertRustTargets();
assertGeneratedProject();
console.log('iOS build environment and generated Tauri project are ready.');
