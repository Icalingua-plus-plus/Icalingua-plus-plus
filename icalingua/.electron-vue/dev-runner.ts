import path from 'path'
import { rspack, Compiler, RspackOptions } from '@rspack/core'
import { RspackDevServer } from '@rspack/dev-server'
import { say } from 'cfonts'
import chalk from 'chalk'
import electron from 'electron'
import { spawn, ChildProcess } from 'child_process'

import mainConfig from './rspack.main.config'
import rendererConfig from './rspack.renderer.config'

process.env.NODE_ENV = 'development'

let electronProcess: ChildProcess | null = null
let manualRestart = false

function logStats(proc: string, data: any) {
    let log = ''

    log += chalk.yellow.bold(`┏ ${proc} Process ${new Array((19 - proc.length) + 1).join('-')}`)
    log += '\n\n'

    if (typeof data === 'object') {
        data.toString({
            colors: true,
            chunks: false
        }).split(/\r?\n/).forEach((line: string) => {
            log += '  ' + line + '\n'
        })
    } else {
        log += `  ${data}\n`
    }

    log += '\n' + chalk.yellow.bold(`┗ ${new Array(28 + 1).join('-')}`) + '\n'

    console.log(log)
}

async function startRenderer(): Promise<void> {
    return new Promise((resolve, reject) => {
        const config: RspackOptions = {
            ...rendererConfig,
            mode: 'development'
        }

        const compiler = rspack(config)

        const server = new RspackDevServer(
            {
                port: 9080,
                hot: true,
                static: {
                    directory: path.join(__dirname, '../')
                },
                client: {
                    overlay: false
                },
                onListening: () => {
                    resolve()
                }
            },
            compiler
        )

        compiler.hooks.done.tap('done', stats => {
            logStats('Renderer', stats)
        })

        server.start().catch(reject)
    })
}

async function startMain(): Promise<void> {
    return new Promise((resolve, reject) => {
        const config: RspackOptions = {
            ...mainConfig,
            mode: 'development'
        }

        const compiler = rspack(config)

        compiler.hooks.watchRun.tap('watch-run', () => {
            logStats('Main', chalk.white.bold('compiling...'))
        })

        compiler.watch({}, (err, stats) => {
            if (err) {
                console.log(err)
                return
            }

            logStats('Main', stats)

            if (electronProcess) {
                manualRestart = true
                process.kill(electronProcess.pid!)
                electronProcess = null
                startElectron()

                setTimeout(() => {
                    manualRestart = false
                }, 5000)
            }

            resolve()
        })
    })
}

function startElectron() {
    let args = [
        '--inspect=5858',
        '--no-sandbox',
        path.join(__dirname, '../dist/electron/main.js')
    ]

    // detect yarn or npm and process commandline args accordingly
    const execPath = process.env.npm_execpath || ''
    if (execPath.endsWith('yarn.js')) {
        args = args.concat(process.argv.slice(3))
    } else if (execPath.endsWith('npm-cli.js')) {
        args = args.concat(process.argv.slice(2))
    } else {
        // pnpm or other
        args = args.concat(process.argv.slice(2))
    }

    electronProcess = spawn(electron as any, args)

    electronProcess.stdout?.on('data', data => {
        electronLog(data, 'blue')
    })
    electronProcess.stderr?.on('data', data => {
        electronLog(data, 'red')
    })

    electronProcess.on('close', () => {
        if (!manualRestart) process.exit()
    })
}

function electronLog(data: Buffer, color: 'blue' | 'red') {
    let log = ''
    const lines = data.toString().split(/\r?\n/)
    lines.forEach(line => {
        log += `  ${line}\n`
    })
    if (/[0-9A-z]+/.test(log)) {
        console.log(
            chalk[color].bold('┏ Electron -------------------') +
            '\n\n' +
            log +
            chalk[color].bold('┗ ----------------------------') +
            '\n'
        )
    }
}

function greeting() {
    const cols = process.stdout.columns
    let text = ''

    if (cols > 104) text = 'nya~'
    else if (cols > 76) text = 'electron-|vue'
    else text = ''

    if (text) {
        say(text, {
            colors: ['yellow'],
            font: 'simple3d',
            space: false
        })
    } else {
        console.log(chalk.yellow.bold('\n  electron-vue'))
    }
    console.log(chalk.blue('  getting ready...') + '\n')
}

async function init() {
    greeting()

    try {
        await Promise.all([startRenderer(), startMain()])
        startElectron()
    } catch (err) {
        console.error(err)
    }
}

init()
