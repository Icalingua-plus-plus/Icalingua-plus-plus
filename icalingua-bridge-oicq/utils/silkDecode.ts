import axios from 'axios'
import ffmpeg from 'fluent-ffmpeg'
import {PassThrough} from 'stream'
import silk from 'silk-sdk'
import {streamToBuffer} from './steamToBuffer'

export default async (url: string) => {
    const res = await axios.get<Buffer>(url, {
        responseType: 'arraybuffer',
    })
    const bufPcm = silk.decode(res.data)
    const bufMp3 = await conventPcmToMp3(bufPcm)
    return 'data:audio/mp3;base64,' + bufMp3.toString('base64')
}

const conventPcmToMp3 = (pcm: Buffer): Promise<Buffer> => {
    return new Promise(resolve => {
        const inStream = new PassThrough()
        const outStream = new PassThrough()
        inStream.end(pcm)
        ffmpeg(inStream).inputOption([
            '-f', 's16le',
            '-ar', '24000',
            '-ac', '1',
        ])
            .outputFormat('mp3')
            .on('end', async () => {
                const buf = await streamToBuffer(outStream)
                resolve(buf)
            }).pipe(outStream, {end: true})
    })
}
