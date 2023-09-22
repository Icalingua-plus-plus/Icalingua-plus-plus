import crypto from 'crypto'

type uploadFile = {
    fileName: string
    buffer: Buffer
}
const fileMap = new Map<string, uploadFile>()
const timerMap = new Map<string, NodeJS.Timeout>()

export const requestUpload = (fileName: string, hash: string, fileSize: number, cb: (uploaded: boolean) => void) => {
    if (fileMap.has(hash)) {
        const fileHash = crypto.createHash('sha256').update(fileMap.get(hash).buffer).digest('hex')
        if (fileHash === hash) {
            cb(true)
            return
        } else {
            cb(false)
            return
        }
    }
    fileMap.set(hash, {
        fileName,
        buffer: Buffer.alloc(fileSize),
    })
    cb(false)
}

export const uploadFile = (hash: string, offset: number, data: Buffer, cb: (hash: string) => void) => {
    const buffer = fileMap.get(hash).buffer
    if (buffer) {
        data.copy(buffer, offset)
    }
    cb(hash)
}

export const getUploadedFile = (hash: string): uploadFile | undefined => {
    return fileMap.get(hash)
}

export const deleteUploadedFile = (hash: string) => {
    if (timerMap.has(hash)) {
        clearTimeout(timerMap.get(hash))
    }
    const timer = setTimeout(() => {
        fileMap.delete(hash)
    }, 1000 * 60 * 60)
    timerMap.set(hash, timer)
}
