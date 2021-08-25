import * as windowMgr from './windowManager';
import * as menuMgr from '../ipc/menuManager';
import { ipcMain } from 'electron';
import * as configMgr from './configManager';


var themeList = ['light', 'dark'];
var themeData: any = {};

export function getThemeData() { return themeData; }

export function getThemeList() { return themeList; }

export function refreshTheme() {
    windowMgr.sendToMainWindow('theme:refresh')
}

export function useTheme(theme: string) {
    windowMgr.sendToMainWindow('theme:use', theme);
}

ipcMain.on('theme:list-complete', (_, list) => {
    themeList = list;
    menuMgr.updateAppMenu();
    let theme = configMgr.getConfig().theme;
    if (theme != undefined) useTheme(theme);
});

ipcMain.on('theme:theme-data', (_, data) => {
    themeData = data;
});
