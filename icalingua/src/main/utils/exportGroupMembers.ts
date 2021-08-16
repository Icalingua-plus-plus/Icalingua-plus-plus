import {getGroupMembers} from '../ipc/botAndStorage'
import {app, dialog} from 'electron'
import {getMainWindow} from './windowManager'
import path from 'path'
import formatDate from '../../utils/formatDate'
import writeCsvData from './writeCsvData'
import ui from './ui'
import errorHandler from './errorHandler'

const membersHeader: Array<{ id: string, title: string }> = [
    {id: 'uin', title: '帐号'},
    {id: 'card', title: '群昵称'},
    {id: 'nick', title: '昵称'},
    {id: 'title', title: '头衔'},
    {id: 'role', title: '身份'},
    {id: 'joinDate', title: '加群时间'},
    {id: 'lastSpeakDate', title: '最后发言时间'},
]
type MemberExport = {
    uin: number,
    card: string,
    nick: string,
    title: string,
    role: '群员' | '群主' | '管理员',
    joinDate: string,
    lastSpeakDate: string
}

export default async (group: number) => {
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

    const membersExport: MemberExport[] = []
    const members = await getGroupMembers(group)
    for (const m of members) {
        let role: '群员' | '群主' | '管理员'
        switch (m.role) {
            case 'admin':
                role = '管理员'
                break
            case 'owner':
                role = '群主'
                break
            case 'member':
                role = '群员'
                break
        }
        membersExport.push({
            uin: m.user_id,
            nick: m.nickname,
            card: m.card,
            role,
            title: m.title,
            joinDate: formatDate('yyyy-MM-dd', new Date(m.join_time * 1000)),
            lastSpeakDate: formatDate('yyyy-MM-dd', new Date(m.last_sent_time * 1000)),
        })
    }
    try {
        if (await writeCsvData(membersHeader, membersExport, savePath))
            return ui.messageSuccess('导出成功')
        ui.messageError('导出失败')
    } catch (e) {
        errorHandler(e, true)
        ui.messageError(`导出失败: ${e}`)
    }
}
