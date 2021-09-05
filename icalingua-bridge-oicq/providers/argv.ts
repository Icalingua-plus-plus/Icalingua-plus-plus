import minimist from 'minimist'

type Args = {
    config?: string
}

export default minimist(process.argv, {
    string: ['config'],
    alias: {
        c: 'config',
    },
}) as Args
