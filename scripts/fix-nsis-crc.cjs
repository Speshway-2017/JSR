#!/usr/bin/env node
/**
 * Disables NSIS CRC check in electron-builder templates.
 * Needed when building Windows installers on macOS — otherwise
 * uninstall fails with "Installer integrity check has failed".
 */
const fs = require('fs');
const path = require('path');

const target = path.join(
  __dirname,
  '..',
  'node_modules',
  'app-builder-lib',
  'templates',
  'nsis',
  'common.nsh'
);

if (!fs.existsSync(target)) {
  console.warn('[nsis-fix] common.nsh not found — skip');
  process.exit(0);
}

let text = fs.readFileSync(target, 'utf8');
if (text.includes('CRCCheck off')) {
  console.log('[nsis-fix] CRCCheck already disabled');
  process.exit(0);
}

text = `${text.trimEnd()}\n\n; JSR: allow uninstall when built on macOS\nCRCCheck off\n`;
fs.writeFileSync(target, text);
console.log('[nsis-fix] Added CRCCheck off to', target);
