import { app } from 'electron'
import axios from 'axios'
import path from 'path'
import fs from 'fs'
import md5 from 'md5'

const cache = new Map<string, string>()
let dir = fs.mkdtempSync(path.join(app.getPath('temp'), 'ica'))

export default async (url: string): Promise<string> => {
    if (!fs.existsSync(dir)) {
        dir = fs.mkdtempSync(path.join(app.getPath('temp'), 'ica'))
    }
    let file = cache.get(url)
    if (!file) {
        const res = await axios.get(url, {
            responseType: 'arraybuffer',
            proxy: false,
        })
        file = path.join(dir, md5(url))
        fs.writeFileSync(file, res.data)
        cache.set(url, file)
    }
    return file
}
