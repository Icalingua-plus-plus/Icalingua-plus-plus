import { Server, Socket } from 'socket.io'
import type oicqAdapter from '../adapters/oicqAdapter'

export default (io: Server, socket: Socket, gin: number, adapter: typeof oicqAdapter) => {
    const gfs = adapter.acquireGfs(gin)

    socket.on('ls', async (fid: string, start: number, cb) => {
        //列出目录中的文件
        try {
            let res = await gfs.ls(fid, start)
            const MAX_ITERATIONS = 50 // 防止无限循环
            let iterations = 0
            while (start === 0 && res.length > 0 && res.length % 100 === 0 && iterations < MAX_ITERATIONS) {
                res = res.concat(await gfs.ls(fid, res.length))
                iterations++
            }
            for (let i = 0; i < res.length; i++) {
                try {
                    const member = await adapter._getGroupMemberInfo(gin, res[i].user_id, false)
                    res[i]['user_name'] =
                        (member ? member.card || member.nickname : res[i].user_id) + '(' + res[i].user_id + ')'
                } catch (e) {
                    res[i]['user_name'] = res[i].user_id + '(' + res[i].user_id + ')'
                }
            }
            cb(res)
        } catch (e) {
            console.error('ls error:', e)
            cb([])
        }
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
        try {
            const res = await gfs.stat(fid)
            cb(res)
        } catch (e) {
            console.error('stat error:', e)
            cb({ error: e.message })
        }
    })

    socket.on('mkdir', async (name: string, cb) => {
        //创建文件夹
        try {
            const res = await gfs.mkdir(name)
            cb(res)
        } catch (e) {
            console.error('mkdir error:', e)
            cb({ error: e.message })
        }
    })

    socket.on('mv', async (fid: string, dirId: string, cb) => {
        //移动
        try {
            const res = await gfs.mv(fid, dirId)
            cb(res)
        } catch (e) {
            console.error('mv error:', e)
            cb({ error: e.message })
        }
    })

    socket.on('rm', async (fid: string, cb) => {
        //删除
        try {
            const res = await gfs.rm(fid)
            cb(res)
        } catch (e) {
            console.error('rm error:', e)
            cb({ error: e.message })
        }
    })

    socket.on('rename', async (fid: string, name: string, cb) => {
        //改名移动
        try {
            const res = await gfs.rename(fid, name)
            cb(res)
        } catch (e) {
            console.error('rename error:', e)
            cb({ error: e.message })
        }
    })
}
