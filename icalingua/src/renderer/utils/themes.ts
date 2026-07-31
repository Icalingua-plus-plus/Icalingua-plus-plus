import { defaultThemeStyles, cssThemeVars } from '../components/vac-mod/themes'
import { ipcRenderer } from 'electron'
import fs from 'fs'
import path from 'path'

var currentTheme = 'light'

const styles = {
    container: {
        boxShadow: 'none',
    },
}

const availableThemes: { [key: string]: any } = {}
const themeSysDefault = defaultThemeStyles.light
const THEME_STYLE_ID = 'icalingua-theme-styles'

export function registerTheme(theme: string, style: any) {
    function patchObject(target, source) {
        for (let key in source) {
            if (!(key in target)) {
                target[key] = source[key]
            } else {
                let os = source[key]
                if (typeof os == 'object') {
                    patchObject(target[key], os)
                }
            }
        }
    }

    patchObject(style, style.baseTheme ? defaultThemeStyles[style.baseTheme] : themeSysDefault)
    availableThemes[theme] = style
}

availableThemes.light = defaultThemeStyles.light
registerTheme('dark', defaultThemeStyles.dark)

export function useTheme(theme: string) {
    currentTheme = theme
    updateThemes()
}

function setupThemeStyles(style: any) {
    let themeStyle = document.getElementById(THEME_STYLE_ID) as HTMLStyleElement
    if (!themeStyle) {
        themeStyle = document.createElement('style')
        themeStyle.id = THEME_STYLE_ID
        document.head.appendChild(themeStyle)
    }

    themeStyle.textContent = `:root {
${Object.entries(style)
    .map(([key, value]) => `    ${key}: ${value};`)
    .join('\n')}
}`
    ipcRenderer.send('theme:set-complete')
}

export function updateThemes() {
    let style = recalcTheme()
    ipcRenderer.send('theme:theme-data', style)
    setupThemeStyles(style)
}

export function $$DON_CALL$$fetchThemes(STORE_PATH: string) {
    let themesFolder = path.join(STORE_PATH, 'themes')
    if (!fs.existsSync(themesFolder)) fs.mkdirSync(themesFolder)
    let files = fs.readdirSync(themesFolder)
    for (let file of files) {
        try {
            file = path.join(themesFolder, file)

            if (!file.endsWith('.json')) continue
            let stat = fs.statSync(file)
            if (!stat.isFile()) continue
            let themeName = path.basename(file)
            themeName = themeName.substring(0, themeName.length - 5)

            let json = fs.readFileSync(file).toString('utf-8')
            let content: any
            try {
                content = JSON.parse(json)
            } catch (e) {
                throw Error('Exception in parsing json: ' + e + '\n\n' + json)
            }
            registerTheme(themeName, content)
        } catch (e) {
            console.log(e)
        }
    }
    ipcRenderer.send('theme:list-complete', Object.keys(availableThemes))
}

export function recalcTheme() {
    const defaultStyles = availableThemes[currentTheme] || themeSysDefault
    const customStyles: any = {}

    Object.keys(defaultStyles).map((key) => {
        customStyles[key] = {
            ...defaultStyles[key],
            ...(styles[key] || {}),
        }
    })

    return cssThemeVars(customStyles)
}

ipcRenderer.on('theme:sync-theme-data', (_, msg) => {
    console.log('sync theme data', msg)
    setupThemeStyles(msg)
})

ipcRenderer.on('theme:refresh', (_, msg) => {
    console.log('refresh theme', msg)
    updateThemes()
})

ipcRenderer.on('theme:use', (_, msg) => {
    console.log('use theme', msg)
    useTheme(msg)
})
