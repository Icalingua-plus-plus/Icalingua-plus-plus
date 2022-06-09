const silk = require('silk-sdk')
const ffmpeg = require('fluent-ffmpeg')
const PassThrough = require('stream').PassThrough

process.on('message', async (silkBufStr) => {
    const silkBuf = Buffer.from(silkBufStr, 'binary');
    const bufPcm = silk.decode(silkBuf)
    const bufOgg = await conventPcmToOgg(bufPcm)
    process.send(bufOgg.toString('binary'))
    process.exit(0)
})

console.log('Child process start! Start to convert silk to ogg!');

const conventPcmToOgg = (pcm) => {
    return new Promise((resolve, reject) => {
        const inStream = new PassThrough()
        const outStream = new PassThrough()
        inStream.end(pcm)
        ffmpeg(inStream, { timeout: 10 })
            .inputOption(['-f', 's16le', '-ar', '24000', '-ac', '1'])
            .outputFormat('ogg')
            .on('error', (err) => {
                // Stream 超时，写出 pcm 文件以转换
                const filename = require('path').join(require('os').tmpdir(), Date.now() + '.pcm')
                require('fs').writeFileSync(filename, pcm)
                console.error(err)
                ffmpeg(filename, { timeout: 15 })
                .inputOption(['-f', 's16le', '-ar', '24000', '-ac', '1'])
                .outputFormat('ogg')
                .on('error', (err) => {
                    console.error(err)
                    reject(err)
                })
                .on('end', async () => {
                    try {
                        const buf = require('fs').readFileSync(filename + '.ogg')
                        resolve(buf)
                        require('fs').unlinkSync(filename)
                        require('fs').unlinkSync(filename + '.ogg')
                    } catch (err) {
                        reject(err)
                    }
                }).save(filename + '.ogg')
            })
            .on('end', async () => {
                const buf = await streamToBuffer(outStream)
                resolve(buf)
            })
            .pipe(outStream, { end: true })
    })
}

function streamToBuffer(stream) {
    return new Promise((resolve, reject) => {
        let buffers = []
        stream.on('error', reject)
        stream.on('data', (data) => buffers.push(data))
        stream.on('end', () => resolve(Buffer.concat(buffers)))
    })
}