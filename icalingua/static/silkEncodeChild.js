const silk = require('silk-ilpp')
const ffmpeg = require('fluent-ffmpeg')
const fs = require('fs')

process.on('message', async (path) => {
    await convertToPcm(path)
    if (fs.existsSync(path + '.pcm')) {
        const result = await silk.encode(fs.readFileSync(path + '.pcm'), 24000)
        fs.writeFileSync(path + '.slk', Buffer.from(result.data))
        fs.unlinkSync(path + '.pcm')
        process.send('silk convert success!')
        process.exit(0)
    } else {
        throw new Error('convert to pcm failed!')
    }
})

console.log('[silkEncode][Child] Child process start! Start to convert audio to silk!');

const convertToPcm = (path) => {
    return new Promise((resolve, reject) => {
        ffmpeg(path, { timeout: 60 })
            .outputOption(['-f', 's16le', '-ar', '24000', '-ac', '1', '-fs', '52428800'])
            .on('error', (err) => {
                console.error(err)
                reject(err)
            })
            .on('end', async () => {
                resolve('ffmpeg convert success!')
            }).save(path + '.pcm')
    })
}
