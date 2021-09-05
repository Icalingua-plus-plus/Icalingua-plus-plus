import fs from 'fs'
import YAML from 'yaml'
import argv from './argv'

type Config = {
    account: {
        /**
         * QQ号
         */
        qq: number
        /**
         * 密码
         */
        passwd: string
        protocol: 1 | 2 | 3 | 4 | 5
    }
    /**
     * MongoDB 连接字符串
     */
    db: string
    pubKey: string
    custom: boolean
    port: number
    host: string
}

const CONFIG_PATH = argv.config || 'config.yaml'

export let config: Config
if (fs.existsSync(CONFIG_PATH)) {
    config = YAML.parse(fs.readFileSync(CONFIG_PATH, 'utf8'))
}
else {
    console.error('配置文件不存在')
    process.exit(2)
}


