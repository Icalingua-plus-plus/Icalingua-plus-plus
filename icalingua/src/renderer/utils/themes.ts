import { defaultThemeStyles, cssThemeVars } from '../components/vac-mod/themes';
import { ipcRenderer } from 'electron';
import fs from 'fs';
import path from 'path';


var currentTheme = 'light';

const styles = {
    container: {
        boxShadow: 'none',
    },
};



const availableThemes: { [key: string]: any } = {};
const themeSysDefault = defaultThemeStyles.light;

export function registerTheme(theme: string, style: any) {
    for (let key in themeSysDefault) {
        if (!(key in style)) {
            style[key] = themeSysDefault[key];
        }
    }
    availableThemes[theme] = style;
}

availableThemes.light = defaultThemeStyles.light;
registerTheme('dark', defaultThemeStyles.dark);


export function useTheme(theme: string) {
    currentTheme = theme;
    updateThemes();
}

export function updateThemes() {
    const style = recalcTheme();
    document.querySelectorAll('.icalingua-theme-holder').forEach(dom => {
        if (dom instanceof HTMLElement) {
            for (let key in style) {
                (dom as any).attributeStyleMap.set(key, style[key]);
            }
        }
    });
}

export function $$DON_CALL$$fetchThemes(STORE_PATH: string) {
    let themesFolder = path.join(STORE_PATH, 'themes');
    let files = fs.readdirSync(themesFolder);
    for (let file of files) {
        try {
            file = path.join(themesFolder, file);

            if (!file.endsWith('.json')) continue;
            let stat = fs.lstatSync(file);
            if (!stat.isFile()) continue;
            let themeName = path.basename(file);
            themeName = themeName.substring(0, themeName.length - 5);

            let json = fs.readFileSync(file).toString('utf-8');
            let content: any
            try { content = JSON.parse(json); } catch (e) {
                throw Error("Exception in parsing json: " + e + "\n\n" + json)
            }
            registerTheme(themeName, content);

        } catch (e) {
            console.log(e);
        }
    }
    ipcRenderer.send('theme:list-complete', Object.keys(availableThemes));
}

export function recalcTheme() {
    const defaultStyles = availableThemes[currentTheme] || themeSysDefault;
    const customStyles: any = {};

    Object.keys(defaultStyles).map((key) => {
        customStyles[key] = {
            ...defaultStyles[key],
            ...(styles[key] || {}),
        }
    })

    return cssThemeVars(customStyles);
}



ipcRenderer.on('theme:refresh', (_, msg) => {
    useTheme('light');
    updateThemes();
});

ipcRenderer.on('theme:use', (_, msg) => {
    useTheme(msg);
});

