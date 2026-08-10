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

process.once('message', async (pathConfig) => {
    let silkDecodeFailed = false
    try {
        try {
            let silkBuf = fs.readFileSync(pathConfig.rawFilePath)
            const head = String(silkBuf.slice(0, 7))
            if (!head.includes("SILK")) throw new Error('Not a silk file')
            if (silkBuf[0] !== 0x23) silkBuf = silkBuf.slice(1)
            const bufPcm = Buffer.from((await silk.decode(silkBuf, 24000)).data)
            fs.renameSync(pathConfig.rawFilePath, pathConfig.rawFilePath + '.slk')
            pathConfig.rawFilePath += '.pcm'
            fs.writeFileSync(pathConfig.rawFilePath, bufPcm)
        } catch (err) {
            // 可能是 amr 語音，嘗試直接轉換
            console.error(err)
            silkDecodeFailed = true
            fs.renameSync(pathConfig.rawFilePath, pathConfig.rawFilePath + '.amr')
            pathConfig.rawFilePath += '.amr'
        }
        await convertToOgg(pathConfig, !silkDecodeFailed)
        if (!silkDecodeFailed) fs.unlinkSync(pathConfig.rawFilePath)
        finish('success', 'ffmpeg convert success!')
    } catch (err) {
        console.error(err)
        finish('error', getErrorMessage(err))
    }
})

console.log('[silkDecode][Child] Child process start! Start to convert record to ogg!')

const convertToOgg = async (pathConfig, isPcm = true) => {
    const args = ['-y', '-hide_banner']
    if (isPcm) args.push('-f', 's16le', '-ar', '24000', '-ac', '1')
    args.push('-i', pathConfig.rawFilePath, '-f', 'ogg', pathConfig.filePath)
    await runFfmpeg(args)
}
