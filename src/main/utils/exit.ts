import {getMainWindow} from "./windowManager";
import {getConfig, saveConfigFile} from './configManager'

const exit = () => {
    const win = getMainWindow()
    const size = win.getSize()
    getConfig().winSize={
        width: size[0],
        height: size[1],
        max: win.isMaximized()
    }
    saveConfigFile()
    win.destroy();
}
export default exit
