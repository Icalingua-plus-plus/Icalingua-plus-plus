import minimist from 'minimist'

type Args = {
    config?: string
    version?: boolean
}

export default minimist(process.argv, {
    string: ['config'],
    boolean: ['version'],
    alias: {
        c: 'config',
        V: 'version',
    },
}) as Args
