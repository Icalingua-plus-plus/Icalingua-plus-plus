import { getMainWindow } from './windowManager'
import { ensureWinSizeMinimum, getConfig, MAIN_WINDOW_MIN_SIZE, saveConfigFile } from './configManager'
import { BrowserWindow } from 'electron'

const exit = () => {
    const win = getMainWindow()
    const normalBounds = win.getNormalBounds()
    const originSize = getConfig().winSize
    const allWindows = BrowserWindow.getAllWindows()
    getConfig().winSize = {
        width: win.isMaximized() ? originSize.width : normalBounds.width,
        height: win.isMaximized() ? originSize.height : normalBounds.height,
        max: win.isMaximized(),
    }
    ensureWinSizeMinimum(getConfig().winSize, MAIN_WINDOW_MIN_SIZE)
    saveConfigFile()
    win.destroy()
    allWindows.forEach((w) => {
        if (!w.isDestroyed()) {
            w.destroy()
        }
    })
}
export default exit
