const { app, BrowserWindow } = require('electron');
const path = require('node:path');

app.setName('电子牛来');
app.setPath('userData', path.join(app.getPath('appData'), 'niulai-muyu'));
app.setAppUserModelId('art.raaay.niulai-muyu');
let win;
if (!app.requestSingleInstanceLock()) app.quit();
else {
  app.on('second-instance', () => {
    if (win) { if (win.isMinimized()) win.restore(); win.show(); win.focus(); }
  });
  app.whenReady().then(() => {
    win = new BrowserWindow({
      width: 450, height: 840, minWidth: 320, minHeight: 540,
      title: '电子牛来', backgroundColor: '#14201c',
      icon: path.join(__dirname, 'assets/head.png'), autoHideMenuBar: true,
      webPreferences: { nodeIntegration: false, contextIsolation: true, sandbox: true }
    });
    win.removeMenu();
    win.webContents.setWindowOpenHandler(() => ({action: 'deny'}));
    win.webContents.on('will-navigate', event => event.preventDefault());
    win.loadFile(path.join(__dirname, 'index.html'));
  });
  app.on('window-all-closed', () => app.quit());
}
