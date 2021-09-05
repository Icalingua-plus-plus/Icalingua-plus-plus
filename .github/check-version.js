const packageJson = require('../icalingua/package.json')
const fs = require('fs')

const commitId = process.env.SHA.substr(0, 7)
const ref = process.env.REF
const isProduction = ref.startsWith('refs/tags/v')
const buildTime = new Date().toString()
const version = packageJson.version + (isProduction ? '' : `-${commitId}`)

console.log(`commitId: ${commitId}
ref: ${ref}
isProduction: ${isProduction}
buildTime: ${buildTime}
version: ${version}`)

console.log(`::set-output name=version::${version.replace('-', '_')}`)

fs.writeFileSync('icalingua/static/version.json',
    JSON.stringify({commitId, ref, isProduction, buildTime, version}), 'utf-8')
