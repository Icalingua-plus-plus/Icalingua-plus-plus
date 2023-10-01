import crypto from 'crypto'

type uploadFile = {
    fileName: string
    buffer: Buffer
    uploaded: number[]
}
type requestUploadResponse = {
    allSuccess: boolean
    uploaded: number[]
}
const fileMap = new Map<string, uploadFile>()
const timerMap = new Map<string, NodeJS.Timeout>()

export const requestUpload = (
    fileName: string,
    hash: string,
    fileSize: number,
    cb: (response: requestUploadResponse) => void,
) => {
    if (fileMap.has(hash)) {
        fileMap.get(hash).fileName = fileName
        const fileHash = crypto.createHash('sha256').update(fileMap.get(hash).buffer).digest('hex')
        if (fileHash === hash) {
            cb({
                allSuccess: true,
                uploaded: fileMap.get(hash).uploaded,
            })
            return
        } else {
            cb({
                allSuccess: false,
                uploaded: fileMap.get(hash).uploaded,
            })
            return
        }
    }
    fileMap.set(hash, {
        fileName,
        buffer: Buffer.alloc(fileSize),
        uploaded: [],
    })
    cb({
        allSuccess: false,
        uploaded: [],
    })
}

export const uploadFile = (
    fileHash: string,
    offset: number,
    chunk: Buffer,
    chunkHash: string,
    cb: (success: boolean) => void,
) => {
    const buffer = fileMap.get(fileHash).buffer
    const damaged = crypto.createHash('sha256').update(buffer).digest('hex') !== chunkHash
    if (buffer && !damaged) {
        chunk.copy(buffer, offset)
        fileMap.get(fileHash).uploaded.push(offset)
    }
    cb(!damaged)
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
