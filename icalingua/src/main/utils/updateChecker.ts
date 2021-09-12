import version from './version'
import axios from 'axios'
import errorHandler from './errorHandler'
import {getConfig} from './configManager'

type CheckUpdateResult = {
    latestVersion: string
    hasUpdate: boolean
}

// 在 sendOnlineData 的时候如果没有缓存的更新数据，那应该先发送更新以外的数据，
// 然后后台检查更新完在运行一次 sendOnlineData
let cache: CheckUpdateResult

export const checkUpdate = async () => {
    if (process.env.NODE_ENV === 'development' || getConfig().updateCheck !== true)
        cache = {
            hasUpdate: false,
            latestVersion: '',
        }
    else if (version.isProduction) {
        try {
            const res = await axios.get('https://api.github.com/repos/clansty/icalingua/releases/latest')
            const latestVersion = res.data.tag_name
            cache = {
                hasUpdate: latestVersion !== 'v' + version.version,
                latestVersion,
            }
        } catch (ex) {
            console.log('检查更新失败')
            errorHandler(ex)
        }
    }
    else {
        try {
            const res = await axios.get('https://api.github.com/repos/clansty/icalingua/git/ref/heads/dev')
            const latestVersion = res.data.object.sha.substr(0, 7)
            cache = {
                hasUpdate: latestVersion !== version.commitId,
                latestVersion,
            }
        } catch (ex) {
            console.log('检查更新失败')
            errorHandler(ex)
        }
    }
}

export const getCachedUpdate = () => cache
