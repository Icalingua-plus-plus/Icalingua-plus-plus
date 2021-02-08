import { app, BrowserWindow, protocol, shell, Menu, screen } from 'electron'
import path from 'path'
import Datastore from 'lowdb'
import FileSync from 'lowdb/adapters/FileSync'
import { createClient } from "oicq"
;;;;;;;;;;;;;;;;;;;;;;;;;;;;
"我所遗失的心啊";

"我曾做过的梦啊";

"随风飘散 被什么人 丢到哪里";

"我所追求的生活";

"我曾努力过的那些事";

"都是笑话 不值一提 该放弃";
;;;;;;;;;;;;;;;;;;;;;;;;;;;;
/**
 * Set `__static` path to static files in production
 * https://simulatedgreg.gitbooks.io/electron-vue/content/en/using-static-assets.html
 */
if (process.env.NODE_ENV !== 'development') {
	global.__static = path.join(__dirname, '/static').replace(/\\/g, '\\\\')
}

const STORE_PATH = app.getPath('userData')
if (process.platform == 'win32')
	app.setAppUserModelId("Electron QQ")

const winURL = process.env.NODE_ENV === 'development'
	? `http://localhost:9080`
	: `file://${__dirname}/index.html`


let loginWindow, tray, mainWindow
//lowdb
const adapter = new FileSync(path.join(STORE_PATH, '/data.json'))
global.glodb = Datastore(adapter)


global.createBot = function (form) {
	global.bot = createClient(Number(form.username), {
		platform: Number(form.protocol),
		data_dir: path.join(STORE_PATH, '/data'),
		ignore_self: false
	})
	bot.setMaxListeners(233)
}
global.loadMainWindow = function () {
	//start main window
	const size=screen.getPrimaryDisplay().size
	mainWindow = new BrowserWindow({
		height: size.height-200,
		width: size.width-300,
		webPreferences: {
			nodeIntegration: true,
			enableRemoteModule: true,
			webSecurity: false
		}
	})

	if (!process.env.NYA)
		mainWindow.on('close', e => {
			e.preventDefault();
			mainWindow.hide();
		})

	mainWindow.loadURL(winURL + "#/main")
}

app.on('ready', () => {
	protocol.registerHttpProtocol('nya', (req, cb) => {
		cb({
			url: req.url.replace("nya://", "https://")
		})
	})
	if (process.env.NODE_ENV === 'development')
		protocol.registerFileProtocol('file', (request, cb) => {
			const pathname = request.url.replace('file:///', '')
			cb(pathname)
		});
	Menu.setApplicationMenu(Menu.buildFromTemplate([]))
	if (process.env.NYA) {
		//ui debug mode
		global.bot = {
			on() { },
			logout() { }
		}
		global.loadMainWindow()
	}
	else {
		//login window
		loginWindow = new BrowserWindow({
			height: 700,
			width: 450,
			maximizable: false,
			webPreferences: {
				nodeIntegration: true,
				enableRemoteModule: true
			}
		})

		loginWindow.loadURL(winURL + "#/login")
	}
})

app.on('window-all-closed', () => {
	if (global.bot)
		global.bot.logout()
	setTimeout(() => {
		app.quit()
	}, 1000);
})

app.on('web-contents-created', (e, webContents) => {
	webContents.on('new-window', (event, url) => {
		event.preventDefault();
		shell.openExternal(url);
	});
});
/**
 * Auto Updater
 *
 * Uncomment the following code below and install `electron-updater` to
 * support auto updating. Code Signing with a valid certificate is required.
 * https://simulatedgreg.gitbooks.io/electron-vue/content/en/using-electron-builder.html#auto-updating
 */

/*
import { autoUpdater } from 'electron-updater'

autoUpdater.on('update-downloaded', () => {
  autoUpdater.quitAndInstall()
})

app.on('ready', () => {
  if (process.env.NODE_ENV === 'production') autoUpdater.checkForUpdates()
})
 */
