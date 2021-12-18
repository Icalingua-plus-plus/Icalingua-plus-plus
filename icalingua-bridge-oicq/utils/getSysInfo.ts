import { version, name } from '../package.json'
import os from 'os'
import { getClientsCount } from '../providers/socketIoProvider'

export default () => {
    const used = process.memoryUsage()
    const load = os.loadavg()
    return `${name} ${version}
Running on ${os.type()} ${os.hostname()} ${os.release()}
Resident Set Size ${Math.round((used.rss / 1024 / 1024) * 100) / 100}MB
Heap used ${Math.round((used.heapUsed / 1024 / 1024) * 100) / 100}MB
Load ${load.join(' ')}
Server Node ${process.versions.node}
${getClientsCount()} clients connected`
}
