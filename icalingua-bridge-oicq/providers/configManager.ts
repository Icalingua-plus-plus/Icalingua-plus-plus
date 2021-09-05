import fs from 'fs'
import YAML from 'yaml'

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

export let config: Config
if (fs.existsSync('config.yaml')) {
    config = YAML.parse(fs.readFileSync('config.yaml', 'utf8'))
} else {
    console.error('配置文件不存在')
    process.exit(2)
}


