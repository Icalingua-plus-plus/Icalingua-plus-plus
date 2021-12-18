import version from './version'

export default () => {
    if (process.env.NODE_ENV === 'development') return '调试模式'
    else if (!version.isProduction)
        return `测试版本
${version.ref}
${version.buildTime}`

    return ''
}
