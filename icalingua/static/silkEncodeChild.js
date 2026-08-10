const silk = require('silk-ilpp')
const fs = require('fs')
const runFfmpeg = require('./ffmpegRunner')

let finished = false

const getErrorMessage = (error) => (error instanceof Error ? error.message : String(error))

const finish = (type, message) => {
    if (finished) return
    finished = true

    const done = () => {
        process.exitCode = type === 'success' ? 0 : 1
        if (process.connected) process.disconnect()
    }

    if (!process.send || !process.connected) {
        done()
        return
    }

    try {
        process.send({ type, message }, (error) => {
            if (error) console.error(error)
            done()
        })
    } catch (error) {
        console.error(error)
        done()
    }
}

process.once('message', async (path) => {
    try {
        await convertToPcm(path)
        if (!fs.existsSync(path + '.pcm')) throw new Error('ffmpeg 未生成 PCM 文件')
        const result = await silk.encode(fs.readFileSync(path + '.pcm'), 24000)
        fs.writeFileSync(path + '.slk', Buffer.from(result.data))
        fs.unlinkSync(path + '.pcm')
        finish('success', 'silk convert success!')
    } catch (error) {
        console.error(error)
        finish('error', getErrorMessage(error))
    }
})

console.log('[silkEncode][Child] Child process start! Start to convert audio to silk!')

const convertToPcm = async (path) => {
    await runFfmpeg([
        '-y',
        '-hide_banner',
        '-i',
        path,
        '-f',
        's16le',
        '-ar',
        '24000',
        '-ac',
        '1',
        '-fs',
        '52428800',
        path + '.pcm',
    ])
}
