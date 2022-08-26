export default interface RootName {
    code: number
    subcode: number
    message: string
    default: number
    data: Data
}

interface Data {
    gpnames: Gpnames[]
    list: List[]
    mayknow: Mayknow
    speciallist: number[]
}

interface Mayknow {
    allnum: number
    list: object
    page: number
}

interface List {
    groupid: number
    isvip: number
    nick: string
    remark: string
    searchField: string
    uin: number
    viplevel: number
}

interface Gpnames {
    gpid: number
    gpname: string
}
