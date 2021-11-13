import {Server, Socket} from 'socket.io'
import adapter from '../adapters/oicqAdapter'

export default (io: Server, socket: Socket, gin: number) => {
    const gfs = adapter.acquireGfs(gin)

    socket.on('ls', async (fid: string, start: number, cb) => {
        //列出目录中的文件
        const res = await gfs.ls(fid, start)
        cb(res)
    })

    //参数：gin, fid
    socket.on('download', async (fid, cb) => {
        const res = await gfs.download(fid)
        cb(res)
    })

    socket.on('stat', async (fid: string, cb) => {
        //获取文件详细信息
        const res = await gfs.stat(fid)
        cb(res)
    })

    socket.on('mkdir', async (name: string, cb) => {
        //创建文件夹
        const res = await gfs.mkdir(name)
        cb(res)
    })

    socket.on('mv', async (fid: string, dirId: string, cb) => {
        //移动
        const res = await gfs.mv(fid, dirId)
        cb(res)
    })

    socket.on('rm', async (fid: string, cb) => {
        //删除
        const res = await gfs.rm(fid)
        cb(res)
    })

    socket.on('rename', async (fid: string, name: string, cb) => {
        //改名移动
        const res = await gfs.rename(fid, name)
        cb(res)
    })

}
