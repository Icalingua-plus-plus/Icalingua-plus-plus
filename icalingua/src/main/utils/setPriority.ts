import {getConfig, saveConfigFile} from './configManager'
import {updateAppMenu} from '../ipc/menuManager'
import {updateTrayIcon, updateTrayMenu} from './trayManager'
import ui from './ui'

export default (lev: 1 | 2 | 3 | 4 | 5) => {
    getConfig().priority = lev
    updateAppMenu()
    updateTrayMenu()
    updateTrayIcon()
    ui.updatePriority(lev)
    saveConfigFile()
}
