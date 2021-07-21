import {nativeImage} from "electron";
import axios from "axios";

const cache = new Map<string, Buffer>()

export default async (url: string): Promise<nativeImage> => {
    let buf = cache.get(url)
    if (!buf) {
        const res = await axios.get(url, {
            responseType: "arraybuffer"
        })
        buf = Buffer.from(res.data, 'binary')
        cache.set(url, buf)
    }
    return nativeImage.createFromBuffer(buf)
}
