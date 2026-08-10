import fs from 'fs'
import pathModule from 'path'
import getStaticPath from '../../utils/getStaticPath'
import runSilkChild from './silkChildProcess'

export default async (path: string) => {
    if (fs.existsSync(path + '.slk')) {
        return path + '.slk'
    }
    await encodeSilk(path)
    return path + '.slk'
}

const encodeSilk = (path: string): Promise<void> => {
    return runSilkChild(pathModule.join(getStaticPath(), 'silkEncodeChild.js'), path)
}
