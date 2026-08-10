const { spawn } = require('child_process')

const FFMPEG_TIMEOUT_MS = 60 * 1000

const getErrorMessage = (error) => {
    if (error instanceof Error) return error.message
    return String(error)
}

const withStderr = (message, stderr) => {
    const details = stderr.trim()
    return details ? `${message}\n${details}` : message
}

module.exports = (args, timeoutMs = FFMPEG_TIMEOUT_MS) =>
    new Promise((resolve, reject) => {
        let stderr = ''
        let settled = false
        let timedOut = false
        let timeout

        const finish = (error) => {
            if (settled) return
            settled = true
            clearTimeout(timeout)
            if (error) reject(error)
            else resolve()
        }

        let ffmpegProcess
        try {
            ffmpegProcess = spawn(process.env.FFMPEG_PATH || 'ffmpeg', args, {
                stdio: ['ignore', 'ignore', 'pipe'],
                windowsHide: true,
            })
        } catch (error) {
            finish(new Error(`无法启动 ffmpeg: ${getErrorMessage(error)}`))
            return
        }

        if (ffmpegProcess.stderr) {
            ffmpegProcess.stderr.setEncoding('utf8')
            ffmpegProcess.stderr.on('data', (chunk) => {
                stderr += chunk
            })
        }

        ffmpegProcess.once('error', (error) => {
            finish(new Error(withStderr(`无法启动 ffmpeg: ${getErrorMessage(error)}`, stderr)))
        })

        ffmpegProcess.once('close', (code, signal) => {
            if (timedOut) {
                finish(new Error(withStderr(`ffmpeg 转换超时（超过 ${timeoutMs / 1000} 秒）`, stderr)))
            } else if (code === 0) {
                finish()
            } else {
                const suffix = signal ? `，信号 ${signal}` : ''
                finish(new Error(withStderr(`ffmpeg 退出，代码 ${code}${suffix}`, stderr)))
            }
        })

        timeout = setTimeout(() => {
            timedOut = true
            ffmpegProcess.kill()
        }, timeoutMs)
    })
