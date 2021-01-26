import { app, BrowserWindow, Menu, Tray, protocol } from 'electron'
import path from 'path'

/**
 * Set `__static` path to static files in production
 * https://simulatedgreg.gitbooks.io/electron-vue/content/en/using-static-assets.html
 */
if (process.env.NODE_ENV !== 'development') {
	global.__static = path.join(__dirname, '/static').replace(/\\/g, '\\\\')
}

const STORE_PATH = app.getPath('userData')
if (process.platform == 'win32')
	app.setAppUserModelId("com.clansty.electronqq")

let mainWindow
let tray

const { createClient } = require("oicq");
const uin = 2981882373; // your account
global.bot = createClient(uin, {
	platform: 2,
	data_dir: path.join(STORE_PATH, '/data')
});
global.bot.login("e4c9f95776753cbaffa7ba53a1d0d317");

const winURL = process.env.NODE_ENV === 'development'
	? `http://localhost:9080`
	: `file://${__dirname}/index.html`

function createWindow() {
	/**
	 * Initial window options
	 */
	mainWindow = new BrowserWindow({
		height: 900,
		useContentSize: true,
		width: 1400,
		webPreferences: {
			nodeIntegration: true,
			enableRemoteModule: true
		}
	})

	mainWindow.loadURL(winURL)

	mainWindow.on('close', function (e) {
		e.preventDefault();
		mainWindow.hide();
	})

	mainWindow.on('closed', () => {
		mainWindow = null
	})
}

app.on('ready', () => {
	protocol.registerHttpProtocol('nya', (req, cb) => {
		cb({
			url: req.url.replace("nya://", "https://")
		})
	})
	createWindow()
	tray = new Tray('build/icons/256x256.png')
	const contextMenu = Menu.buildFromTemplate([
		{ label: 'Open', type: 'normal', click: () => { mainWindow.show() } },
		{ label: 'Exit', type: 'normal', click: () => { mainWindow.destroy() } }
	])
	tray.setToolTip('Electron QQ')
	tray.setContextMenu(contextMenu)
	tray.on("click", () => {
		if (mainWindow.isFocused())
			mainWindow.hide()
		else
			mainWindow.show()
	})
})

app.on('window-all-closed', () => {
	global.bot.logout()	
	setTimeout(() => {
		app.quit()
	}, 1000); 
})

app.on('activate', () => {
	if (mainWindow === null) {
		createWindow()
	}
})

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
