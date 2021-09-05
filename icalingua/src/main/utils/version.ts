import fs from 'fs'
import getStaticPath from '../../utils/getStaticPath'
import path from 'path'
import {app} from 'electron'

const version: Version = JSON.parse(fs.readFileSync(path.join(getStaticPath(), 'version.json'), 'utf-8'))

if (!version.version)
    version.version = app.getVersion()

export default version
