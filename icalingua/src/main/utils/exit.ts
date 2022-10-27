import { getMainWindow } from './windowManager'
import { getConfig, saveConfigFile } from './configManager'
import { BrowserWindow } from 'electron'

const exit = () => {
    const win = getMainWindow()
    const size = win.getSize()
    const originSize = getConfig().winSize
    const allWindows = BrowserWindow.getAllWindows()
    getConfig().winSize = {
        width: win.isMaximized() ? originSize.width : size[0],
        height: win.isMaximized() ? originSize.height : size[1],
        max: win.isMaximized(),
    }
    saveConfigFile()
    win.destroy()
    allWindows.forEach((w) => {
        if (!w.isDestroyed()) {
            w.destroy()
        }
    })
}
export default exit
