const {spawn} = require('child_process')

require('./bridge/index')
const electronProcess = spawn('./electron/electron', ['--no-sandbox', './app', '-c', 'icalinguarc'])
electronProcess.stdout.on('data', e => console.log(e.toString()))
electronProcess.stderr.on('data', e => console.error(e.toString()))
electronProcess.on('close', () => {
    console.log('closed')
    process.exit()
})
