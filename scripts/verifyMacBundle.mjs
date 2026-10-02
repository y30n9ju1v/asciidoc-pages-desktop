import { existsSync } from 'node:fs';
import { spawnSync } from 'node:child_process';
import { join, resolve } from 'node:path';

const defaultAppPath = 'src-tauri/target/release/bundle/macos/AsciiDoc Studio.app';
const appPath = resolve(process.argv[2] ?? defaultAppPath);
const infoPlistPath = join(appPath, 'Contents', 'Info.plist');
const requiredEntitlements = [
  'com.apple.security.app-sandbox',
  'com.apple.security.files.user-selected.read-write',
  'com.apple.security.network.client',
];
const forbiddenEnabledEntitlements = [
  'com.apple.security.files.downloads.read-write',
  'com.apple.security.files.documents.read-write',
  'com.apple.security.files.desktop.read-write',
  'com.apple.security.files.movies.read-write',
  'com.apple.security.files.music.read-write',
  'com.apple.security.files.pictures.read-write',
  'com.apple.security.network.server',
  'com.apple.security.automation.apple-events',
  'com.apple.security.cs.disable-library-validation',
  'com.apple.security.cs.allow-unsigned-executable-memory',
  'com.apple.security.get-task-allow',
];

function fail(message) {
  throw new Error(message);
}

function commandOutput(command, args) {
  const result = spawnSync(command, args, { encoding: 'utf8' });
  const output = `${result.stdout ?? ''}${result.stderr ?? ''}`;

  if (result.error) {
    fail(`Could not run ${command}: ${result.error.message}`);
  }

  if (result.status !== 0) {
    fail(output.trim() || `Failed to run ${command}.`);
  }

  return output;
}

function assertMacHost() {
  if (process.platform !== 'darwin') fail('macOS bundle verification must run on macOS.');
}

function assertBundleExists() {
  if (!existsSync(infoPlistPath)) fail(`No macOS app bundle found at ${appPath}. Run a release Tauri build first.`);
}

function assertAppleSignature() {
  try {
    commandOutput('codesign', ['--verify', '--strict', '--verbose=2', appPath]);
  } catch (error) {
    fail(`The app must be signed with an Apple distribution certificate before release.\n${error.message}`);
  }

  const signature = commandOutput('codesign', ['-dv', '--verbose=4', appPath]);
  if (signature.includes('Signature=adhoc') || signature.includes('TeamIdentifier=not set')) {
    fail('The app must use an Apple distribution signature with a TeamIdentifier, not an ad hoc signature.');
  }
}

function assertEntitlements() {
  const entitlements = commandOutput('codesign', ['-d', '--entitlements', ':-', appPath]);
  for (const entitlement of requiredEntitlements) {
    if (!isEnabled(entitlements, entitlement)) {
      fail(`Missing required entitlement: ${entitlement}`);
    }
  }

  for (const entitlement of forbiddenEnabledEntitlements) {
    if (isEnabled(entitlements, entitlement)) {
      fail(`Release bundle enables an unnecessary or unsafe entitlement: ${entitlement}`);
    }
  }
}

function isEnabled(entitlements, identifier) {
  return new RegExp(`<key>${identifier}</key>\\s*<true/>`).test(entitlements);
}

function assertBundleMetadata() {
  const infoPlist = JSON.parse(commandOutput('plutil', ['-convert', 'json', '-o', '-', infoPlistPath]));
  const minimumVersion = infoPlist.LSMinimumSystemVersion;
  if (minimumVersion !== '11.0') fail(`Expected macOS minimum version 11.0, found ${minimumVersion || 'none'}.`);

  const associations = JSON.stringify(infoPlist.CFBundleDocumentTypes ?? []);
  if (!associations.includes('adoc') || !associations.includes('asciidoc')) {
    fail('The AsciiDoc Finder document association is missing.');
  }
}

assertMacHost();
assertBundleExists();
assertAppleSignature();
assertEntitlements();
assertBundleMetadata();
console.log(`Verified signed macOS bundle: ${appPath}`);
