import getFriends from './getFriends'
import errorHandler from './errorHandler'
import {getFriendsFallback, getGroups} from '../ipc/botAndStorage'
import writeCsvData from './writeCsvData'
import {getMainWindow} from './windowManager'
import {app, dialog} from 'electron'
import path from 'path'
import formatDate from '../../utils/formatDate'
import ui from './ui'

export default async (type: 'friend' | 'group') => {
    const savePath = dialog.showSaveDialogSync(getMainWindow(), {
        title: '请选择保存位置',
        defaultPath: path.join(app.getPath('desktop'),
            formatDate('yyyy-MM-dd') + '.csv'),
        filters: [{
            name: 'Comma-separated values (CSV)',
            extensions: ['csv'],
        }],
    })
    if (!savePath) return
    const exportFunc = type === 'friend' ? exportFriendsAsCsv : exportGroupsAsCsv
    if (await exportFunc(savePath))
        ui.messageSuccess('导出成功')
    else ui.messageError('导出失败')
}

//region 好友
const friendsHeader: Array<{ id: string, title: string }> = [
    {id: 'group', title: '分组'},
    {id: 'uin', title: '帐号'},
    {id: 'nick', title: '昵称'},
    {id: 'remark', title: '备注'},
]
type FriendExport = {
    group: string,
    uin: number,
    nick: string,
    remark: string
}

const exportFriendsAsCsv = async (savePath: string) => {
    const friendsExport: FriendExport[] = []
    try {
        //可获取含分组的好友
        const friendsRaw = await getFriends()
        for (const g of friendsRaw) {
            for (const f of g.friends) {
                friendsExport.push({
                    group: g.name,
                    uin: f.uin,
                    nick: f.nick,
                    remark: f.remark,
                })
            }
        }
    } catch (e) {
        //获取含分组好友失败
        errorHandler(e, true)
        const friendsRaw = await getFriendsFallback()
        for (const f of friendsRaw) {
            friendsExport.push({
                group: '获取失败',
                uin: f.uin,
                nick: f.nick,
                remark: f.remark,
            })
        }
    }
    //写出 csv
    try {
        return await writeCsvData(friendsHeader, friendsExport, savePath)
    } catch (e) {
        errorHandler(e, true)
        return false
    }
}
//endregion

//region 群
const groupsHeader: Array<{ id: string, title: string }> = [
    {id: 'gin', title: '群号'},
    {id: 'name', title: '名称'},
]
type groupExport = {
    gin: number,
    name: string,
}

const exportGroupsAsCsv = async (savePath: string) => {
    const groupsExport: groupExport[] = []
    const groupsRaw = await getGroups()
    for (const g of groupsRaw) {
        groupsExport.push({
            gin: g.group_id,
            name: g.group_name,
        })
    }
    //写出 csv
    return await writeCsvData(groupsHeader, groupsExport, savePath)
}
//endregion
