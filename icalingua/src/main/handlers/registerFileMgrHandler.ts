import { Server, Socket } from 'socket.io'
import type oicqAdapter from '../adapters/oicqAdapter'

export default (io: Server, socket: Socket, gin: number, adapter: typeof oicqAdapter) => {
    const gfs = adapter.acquireGfs(gin)

    socket.on('ls', async (fid: string, start: number, cb) => {
        //列出目录中的文件
        let res = await gfs.ls(fid, start)
        while (start === 0 && res.length > 0 && res.length % 100 === 0) {
            res = res.concat(await gfs.ls(fid, res.length))
        }
        for (let i = 0; i < res.length; i++) {
            const member = await adapter._getGroupMemberInfo(gin, res[i].user_id, false)
            res[i]['user_name'] =
                (member ? member.card || member.nickname : res[i].user_id) + '(' + res[i].user_id + ')'
        }
        cb(res)
    })

    //参数：gin, fid
    socket.on('download', async (fid, cb) => {
        try {
            const res = await gfs.download(fid)
            cb(res)
        } catch (e) {
            console.error(e)
            cb({
                name: e.message + '(' + e.code + ')',
                url: 'error',
            })
        }
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
