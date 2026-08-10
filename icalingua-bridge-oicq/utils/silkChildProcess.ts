import { fork, type Serializable } from 'child_process'

type SilkChildMessage = {
    type: 'success' | 'error'
    message?: string
}

const toError = (error: unknown) => (error instanceof Error ? error : new Error(String(error)))

export default (scriptPath: string, payload: Serializable): Promise<void> =>
    new Promise((resolve, reject) => {
        const child = fork(scriptPath)
        let settled = false

        const resolveOnce = () => {
            if (settled) return
            settled = true
            resolve()
        }
        const rejectOnce = (error: unknown) => {
            if (settled) return
            settled = true
            reject(toError(error))
        }

        child.on('message', (value: unknown) => {
            if (!value || typeof value !== 'object') {
                rejectOnce(new Error('语音子进程返回了无效结果'))
                return
            }

            const result = value as SilkChildMessage
            if (result.type === 'success') {
                resolveOnce()
            } else if (result.type === 'error') {
                rejectOnce(new Error(result.message || '语音转换失败'))
            } else {
                rejectOnce(new Error('语音子进程返回了未知结果'))
            }
        })
        child.on('error', rejectOnce)
        child.on('exit', (code, signal) => {
            if (settled) return
            if (code !== 0) {
                rejectOnce(new Error(`语音子进程退出，代码 ${code}${signal ? `，信号 ${signal}` : ''}`))
            } else {
                rejectOnce(new Error('语音子进程退出但没有返回结果'))
            }
        })

        try {
            child.send(payload, (error) => {
                if (error) rejectOnce(error)
            })
        } catch (error) {
            rejectOnce(error)
        }
    })
