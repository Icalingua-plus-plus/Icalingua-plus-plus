import {app} from 'electron'
import axios from 'axios'
import path from 'path'
import fs from 'fs'
import md5 from 'md5'

const cache = new Map<string, string>()
const dir = fs.mkdtempSync(path.join(app.getPath('temp'), 'ica'))

export default async (url: string): Promise<string> => {
    let file = cache.get(url)
    if (!file) {
        const res = await axios.get(url, {
            responseType: 'arraybuffer',
        })
        file = path.join(dir, md5(url))
        fs.writeFileSync(file, res.data)
        cache.set(url, file)
    }
    return file
}
