import { build } from 'esbuild'
import { readFileSync, writeFileSync, cpSync } from 'fs'

const pkg = JSON.parse(readFileSync('./package.json', 'utf-8'))
const external = Object.keys(pkg.dependencies || {}).filter((dep) => !dep.startsWith('@saltify/'))

await build({
    entryPoints: {
        index: 'index.ts',
        dbWorker: '../packages/storageProviders/DBWorkerEntry.ts',
    },
    bundle: true,
    platform: 'node',
    target: 'node20',
    outdir: 'build',
    external,
    sourcemap: true,
})

// 复制 static 目录
cpSync('./static', './build/static', { recursive: true })

// 生成精简的 package.json 用于安装 dependencies
const buildPkg = {
    name: pkg.name,
    version: pkg.version,
    dependencies: pkg.dependencies,
}
writeFileSync('./build/package.json', JSON.stringify(buildPkg, null, 2))

console.log('Build complete!')
