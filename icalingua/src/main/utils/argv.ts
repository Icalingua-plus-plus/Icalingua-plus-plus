import minimist from 'minimist'

type Args = {
    config?: string
    version?: boolean
    hide?: boolean
}

export default minimist(process.argv, {
    string: ['config'],
    boolean: ['version', 'hide'],
    alias: {
        c: 'config',
        V: 'version',
        h: 'hide',
    },
}) as Args
