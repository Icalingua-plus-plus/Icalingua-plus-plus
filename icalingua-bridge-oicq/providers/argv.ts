import minimist from 'minimist'

type Args = {
    config?: string
    data?: string
}

export default minimist(process.argv, {
    string: ['config', 'data'],
    alias: {
        c: 'config',
        d: 'data',
    },
}) as Args
