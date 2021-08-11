import path from 'path'

export default () => process.env.NODE_ENV !== 'development' ?
    path.join(__dirname, '/static').replace(/\\/g, '\\\\') :
    path.join(__dirname, '../../static')

