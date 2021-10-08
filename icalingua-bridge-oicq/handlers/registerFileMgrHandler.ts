import {Server, Socket} from 'socket.io'
import adapter from '../adapters/oicqAdapter'

export default (io: Server, socket: Socket) =>{
    socket.on('ls',async (gin:number,fid:string, start:number,cb)=>{
        //列出目录中的文件
        const gfs=adapter.acquireGfs(gin)
        const res=await gfs.ls(fid,start)
        cb(res)
    })

    //参数：gin,fid
    socket.on('download', adapter.getGroupFileMeta)

    socket.on('stat',async (gin:number,fid:string,cb)=>{
        //获取文件详细信息
        const gfs=adapter.acquireGfs(gin)
        const res=await gfs.stat(fid)
        cb(res)
    })

    socket.on('mkdir',async (gin:number,name:string,cb)=>{
        //创建文件夹
        const gfs=adapter.acquireGfs(gin)
        const res=await gfs.mkdir(name)
        cb(res)
    })

    socket.on('mv',async (gin:number,fid:string,dirId:string, cb)=>{
        //移动
        const gfs=adapter.acquireGfs(gin)
        const res=await gfs.mv(fid,dirId)
        cb(res)
    })

    socket.on('rm',async (gin:number,fid:string, cb)=>{
        //删除
        const gfs=adapter.acquireGfs(gin)
        const res=await gfs.rm(fid)
        cb(res)
    })

    socket.on('rename',async (gin:number,fid:string,name:string, cb)=>{
        //改名移动
        const gfs=adapter.acquireGfs(gin)
        const res=await gfs.rename(fid,name)
        cb(res)
    })

}
