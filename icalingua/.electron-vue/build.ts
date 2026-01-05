import path from 'path'
import { rspack } from '@rspack/core'
import { say } from 'cfonts'
import chalk from 'chalk'
import del from 'del'

import mainConfig from './rspack.main.config'
import rendererConfig from './rspack.renderer.config'

process.env.NODE_ENV = 'production'

const doneLog = chalk.bgGreen.white(' DONE ') + ' '
const errorLog = chalk.bgRed.white(' ERROR ') + ' '
const okayLog = chalk.bgBlue.white(' OKAY ') + ' '
const isCI = process.env.CI || false

if (process.env.BUILD_TARGET === 'clean') {
    clean()
} else {
    build()
}

async function clean() {
    await del(['build/*', '!build/icons', '!build/icons/icon.*'])
    console.log(`\n${doneLog}\n`)
    process.exit()
}

async function build() {
    greeting()

    await del(['dist/electron/*', '!.gitkeep'])

    const tasks = ['main', 'renderer']
    let completedTasks = 0
    let results = ''

    console.log(chalk.yellow.bold('\n  Building...\n'))

    try {
        const [mainResult, rendererResult] = await Promise.all([
            pack(mainConfig),
            pack(rendererConfig)
        ])

        results += mainResult + '\n\n'
        console.log(`  ${doneLog}Main process built successfully`)

        results += rendererResult + '\n\n'
        console.log(`  ${doneLog}Renderer process built successfully`)

        console.log(`\n\n${results}`)
        console.log(`${okayLog}take it away ${chalk.yellow('`electron-builder`')}\n`)
        process.exit()
    } catch (err) {
        console.log(`\n  ${errorLog}Build failed`)
        console.error(`\n${err}\n`)
        process.exit(1)
    }
}

function pack(config: any): Promise<string> {
    return new Promise((resolve, reject) => {
        rspack(config, (err, stats) => {
            if (err) {
                reject(err.stack || err)
            } else if (stats?.hasErrors()) {
                let errStr = ''
                stats.toString({
                    chunks: false,
                    colors: true
                }).split(/\r?\n/).forEach(line => {
                    errStr += `    ${line}\n`
                })
                reject(errStr)
            } else {
                resolve(stats?.toString({
                    chunks: false,
                    colors: true
                }) || '')
            }
        })
    })
}

function greeting() {
    const cols = process.stdout.columns
    let text = ''

    if (cols > 85) text = 'lets-build'
    else if (cols > 60) text = 'lets-|build'
    else text = ''

    if (text && !isCI) {
        say(text, {
            colors: ['yellow'],
            font: 'simple3d',
            space: false
        })
    } else {
        console.log(chalk.yellow.bold('\n  lets-build'))
    }
    console.log()
}
