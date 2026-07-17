import crypto from 'crypto'
import fs from 'fs'
import path from 'path'
import os from 'os'

type UploadingFile = {
    fileName: string
    filePath: string
    size: number
    uploadedOffsets: Set<number>
    fd: number
    lastActivity: number
}

type RequestUploadResponse = {
    allSuccess: boolean
    uploaded: number[]
}

const fileMap = new Map<string, UploadingFile>()

// 临时文件目录，可通过 setTempDir 配置
let tempDir = path.join(os.tmpdir(), 'icalingua-uploads')

// 超时时间：30 分钟
const UPLOAD_TIMEOUT = 30 * 60 * 1000

// 清理定时器
let cleanupTimer: NodeJS.Timeout | null = null

/**
 * 设置临时文件目录
 */
export const setTempDir = (dir: string) => {
    tempDir = dir
    ensureTempDir()
}

/**
 * 获取临时文件目录
 */
export const getTempDir = () => tempDir

/**
 * 确保临时目录存在
 */
const ensureTempDir = () => {
    if (!fs.existsSync(tempDir)) {
        fs.mkdirSync(tempDir, { recursive: true })
    }
}

/**
 * 启动时清理残留的临时文件
 */
export const cleanupOnStartup = () => {
    ensureTempDir()
    try {
        const files = fs.readdirSync(tempDir)
        for (const file of files) {
            if (file.startsWith('upload-')) {
                const filePath = path.join(tempDir, file)
                try {
                    fs.unlinkSync(filePath)
                } catch (e) {
                    console.error('Failed to cleanup temp file:', filePath, e)
                }
            }
        }
    } catch (e) {
        console.error('Failed to cleanup temp directory:', e)
    }

    // 启动定期清理
    if (!cleanupTimer) {
        cleanupTimer = setInterval(cleanupStaleUploads, 5 * 60 * 1000) // 每 5 分钟检查一次
    }
}

/**
 * 清理超时的上传
 */
const cleanupStaleUploads = () => {
    const now = Date.now()
    for (const [hash, file] of fileMap.entries()) {
        if (now - file.lastActivity > UPLOAD_TIMEOUT) {
            console.log('Cleaning up stale upload:', hash)
            try {
                fs.closeSync(file.fd)
                fs.unlinkSync(file.filePath)
            } catch (e) {
                console.error('Failed to cleanup stale upload:', e)
            }
            fileMap.delete(hash)
        }
    }
}

/**
 * 请求上传文件
 */
export const requestUpload = (
    fileName: string,
    hash: string,
    fileSize: number,
    cb: (response: RequestUploadResponse) => void,
) => {
    ensureTempDir()

    if (fileMap.has(hash)) {
        const file = fileMap.get(hash)!
        file.fileName = fileName
        file.lastActivity = Date.now()

        // 检查是否所有分片都已上传
        const chunkSize = 512 * 1024
        const totalChunks = Math.ceil(file.size / chunkSize)
        const allUploaded = file.uploadedOffsets.size === totalChunks

        if (allUploaded) {
            // 验证文件完整性（流式计算 hash，避免一次性读入整个文件）
            const stream = fs.createReadStream(file.filePath)
            const hashCompute = crypto.createHash('sha256')
            stream.on('data', (chunk) => hashCompute.update(chunk))
            stream.on('end', () => {
                const fileHash = hashCompute.digest('hex')
                if (fileHash === hash) {
                    cb({ allSuccess: true, uploaded: Array.from(file.uploadedOffsets) })
                } else {
                    cb({ allSuccess: false, uploaded: Array.from(file.uploadedOffsets) })
                }
            })
            stream.on('error', (e) => {
                console.error('Failed to verify file:', e)
                cb({ allSuccess: false, uploaded: Array.from(file.uploadedOffsets) })
            })
            return
        }

        cb({ allSuccess: false, uploaded: Array.from(file.uploadedOffsets) })
        return
    }

    // 创建新的临时文件
    const filePath = path.join(tempDir, `upload-${hash}`)
    try {
        // 创建指定大小的稀疏文件
        const fd = fs.openSync(filePath, 'w+')
        fs.ftruncateSync(fd, fileSize)

        fileMap.set(hash, {
            fileName,
            filePath,
            size: fileSize,
            uploadedOffsets: new Set(),
            fd,
            lastActivity: Date.now(),
        })

        cb({ allSuccess: false, uploaded: [] })
    } catch (e) {
        console.error('Failed to create temp file:', e)
        cb({ allSuccess: false, uploaded: [] })
    }
}

/**
 * 上传文件分片
 */
export const uploadFile = (
    fileHash: string,
    offset: number,
    chunk: Buffer,
    chunkHash: string,
    cb: (success: boolean) => void,
) => {
    const file = fileMap.get(fileHash)
    if (!file) {
        cb(false)
        return
    }

    // 验证分片 hash
    const actualHash = crypto.createHash('sha256').update(chunk).digest('hex')
    if (actualHash !== chunkHash) {
        cb(false)
        return
    }

    try {
        // 直接写入文件对应位置
        fs.writeSync(file.fd, chunk, 0, chunk.length, offset)
        file.uploadedOffsets.add(offset)
        file.lastActivity = Date.now()
        cb(true)
    } catch (e) {
        console.error('Failed to write chunk:', e)
        cb(false)
    }
}

/**
 * 获取已上传文件的路径（供 onebot/milky 使用）
 */
export const getUploadedFilePath = (hash: string): string | undefined => {
    const file = fileMap.get(hash)
    if (!file) return undefined
    return file.filePath
}

/**
 * 获取已上传文件的 file:// URI（供 milky 使用）
 */
export const getUploadedFileUri = (hash: string): string | undefined => {
    const filePath = getUploadedFilePath(hash)
    if (!filePath) return undefined
    return `file://${filePath}`
}

/**
 * 获取已上传文件的文件名
 */
export const getUploadedFileName = (hash: string): string | undefined => {
    const file = fileMap.get(hash)
    return file?.fileName
}

/**
 * 删除已上传的文件
 */
export const deleteUploadedFile = (hash: string) => {
    const file = fileMap.get(hash)
    if (!file) return

    try {
        fs.closeSync(file.fd)
    } catch (e) {
        // fd 可能已经关闭
    }

    try {
        fs.unlinkSync(file.filePath)
    } catch (e) {
        console.error('Failed to delete uploaded file:', e)
    }

    fileMap.delete(hash)
}
