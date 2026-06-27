const { app, BrowserWindow, Menu } = require('electron');
const path = require('path');

function createWindow () {
  const mainWindow = new BrowserWindow({
    width: 600,
    height: 900,
    webPreferences: {
      nodeIntegration: true,
      contextIsolation: false
    },
    title: 'Concept2 Logbook 모바일 통합 분석 시스템'
  });

  Menu.setApplicationMenu(null); // Hide default menu

  mainWindow.loadFile('index.html');
}

app.whenReady().then(() => {
  createWindow();

  app.on('activate', function () {
    if (BrowserWindow.getAllWindows().length === 0) createWindow();
  });
});

app.on('window-all-closed', function () {
  if (process.platform !== 'darwin') app.quit();
});
