const { execFileSync } = require('child_process');
const fs = require('fs');
const path = require('path');

module.exports = async function afterPack(context) {
  if (context.electronPlatformName !== 'win32') return;

  const projectDir = context.packager.projectDir;
  const executableName = `${context.packager.appInfo.productFilename}.exe`;
  const executablePath = path.join(context.appOutDir, executableName);
  const iconPath = path.join(projectDir, 'build', 'icon.ico');
  const resourceEditorPath = path.join(projectDir, 'build', 'rcedit-x64.exe');

  for (const requiredPath of [executablePath, iconPath, resourceEditorPath]) {
    if (!fs.existsSync(requiredPath)) {
      throw new Error(`Windows icon resource is missing: ${requiredPath}`);
    }
  }

  const info = context.packager.appInfo;
  execFileSync(resourceEditorPath, [
    executablePath,
    '--set-icon', iconPath,
    '--set-version-string', 'ProductName', info.productName,
    '--set-version-string', 'FileDescription', info.description,
    '--set-version-string', 'CompanyName', info.companyName || 'Niulai',
    '--set-version-string', 'OriginalFilename', executableName,
    '--set-file-version', info.version,
    '--set-product-version', info.version
  ], { stdio: 'inherit' });
};
