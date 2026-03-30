// afterPack.cjs — Fix missing nested dependencies in electron-builder output
// electron-builder's dependency walker doesn't handle pnpm hoisted nested
// node_modules (version conflicts), leaving transitive deps out of the asar.
// This hook runs after asar is created, so we extract it, fix missing deps,
// and repack.

const path = require('path')
const fs = require('fs')
const asar = require('@electron/asar')

exports.default = async function afterPack(context) {
    const resourcesDir = path.join(context.appOutDir, 'resources')
    const asarPath = path.join(resourcesDir, 'app.asar')
    const appDir = path.join(resourcesDir, 'app')
    const rootNM = findRootNodeModules(__dirname)

    if (!rootNM) {
        console.warn('[afterPack] Could not find root node_modules, skipping')
        return
    }

    // Determine where the app files are
    let workDir
    let needsRepack = false

    if (fs.existsSync(appDir)) {
        // Pre-asar: app directory exists (asar disabled or beforePack timing)
        workDir = appDir
    } else if (fs.existsSync(asarPath)) {
        // Post-asar: need to extract, fix, repack
        console.log('[afterPack] Extracting asar for dependency fix...')
        asar.extractAll(asarPath, appDir)
        workDir = appDir
        needsRepack = true
    } else {
        console.log('[afterPack] No app directory or asar found, skipping')
        return
    }

    const appNM = path.join(workDir, 'node_modules')
    if (!fs.existsSync(appNM)) {
        console.log('[afterPack] No node_modules in app, skipping')
        if (needsRepack) fs.rmSync(appDir, { recursive: true, force: true })
        return
    }

    console.log('[afterPack] Scanning for missing dependencies...')

    let totalCopied = 0
    for (let pass = 1; pass <= 20; pass++) {
        const copied = fixMissing(appNM, rootNM)
        if (copied === 0) break
        totalCopied += copied
        console.log(`[afterPack] Pass ${pass}: copied ${copied} missing packages`)
    }

    if (totalCopied > 0) {
        console.log(`[afterPack] Fixed ${totalCopied} missing dependencies`)
    } else {
        console.log('[afterPack] All dependencies OK')
    }

    if (needsRepack) {
        if (totalCopied > 0) {
            console.log('[afterPack] Repacking asar...')
            // Preserve the unpack glob from electron-builder config
            const unpackDir = asarPath + '.unpacked'
            const hasUnpacked = fs.existsSync(unpackDir)

            // Detect which files should be unpacked by checking what's in .unpacked
            let unpackGlob
            if (hasUnpacked) {
                // Collect relative paths of unpacked files to build a glob
                const unpackedFiles = collectFiles(unpackDir, unpackDir)
                if (unpackedFiles.length > 0) {
                    // Use the existing unpack pattern from package.json build config
                    unpackGlob = '*.{node,dll}'
                }
            }

            await asar.createPackageWithOptions(appDir, asarPath, {
                unpack: unpackGlob,
            })
            console.log('[afterPack] Asar repacked successfully')
        }
        // Clean up extracted directory
        fs.rmSync(appDir, { recursive: true, force: true })
    }
}

/**
 * Find the monorepo root node_modules
 */
function findRootNodeModules(startDir) {
    let dir = path.resolve(startDir)
    while (true) {
        if (fs.existsSync(path.join(dir, 'pnpm-workspace.yaml'))) {
            const nm = path.join(dir, 'node_modules')
            if (fs.existsSync(nm)) return nm
        }
        const parent = path.dirname(dir)
        if (parent === dir) break
        dir = parent
    }
    const fallback = path.resolve(startDir, '..', 'node_modules')
    return fs.existsSync(fallback) ? fallback : null
}

/**
 * Scan all packages in app node_modules, find missing deps, copy from source.
 */
function fixMissing(appNM, rootNM) {
    let copied = 0
    const allPkgs = collectPackages(appNM)

    for (const { name, dir } of allPkgs) {
        const pkgJsonPath = path.join(dir, 'package.json')
        if (!fs.existsSync(pkgJsonPath)) continue

        let pkgJson
        try {
            pkgJson = JSON.parse(fs.readFileSync(pkgJsonPath, 'utf8'))
        } catch {
            continue
        }

        for (const depName of Object.keys(pkgJson.dependencies || {})) {
            if (canResolve(depName, dir, appNM)) continue

            const source = findInSource(depName, name, rootNM)
            if (!source) {
                console.warn(`[afterPack]   ! ${depName} (needed by ${name}) — not found in source`)
                continue
            }

            // Preserve nesting from source if it was nested there
            const nestedInSource = path.join(rootNM, name, 'node_modules', depName)
            const wasNested = source === nestedInSource ||
                source.startsWith(nestedInSource + path.sep)

            const dest = wasNested
                ? path.join(appNM, name, 'node_modules', depName)
                : path.join(appNM, depName)

            if (fs.existsSync(dest)) continue

            copyPackage(source, dest)
            copied++
            console.log(`[afterPack]   + ${path.relative(appNM, dest)} (needed by ${name})`)
        }
    }

    return copied
}

function canResolve(depName, pkgDir, appNM) {
    if (existsPkg(path.join(pkgDir, 'node_modules', depName))) return true
    let dir = pkgDir
    while (true) {
        const parent = path.dirname(dir)
        if (parent === dir) break
        if (existsPkg(path.join(parent, 'node_modules', depName))) return true
        if (parent === path.dirname(appNM)) break
        dir = parent
    }
    return false
}

function findInSource(depName, neededBy, rootNM) {
    // 1. Nested in parent (version-conflicted)
    const nested = path.join(rootNM, neededBy, 'node_modules', depName)
    if (existsPkg(nested)) return nested

    // 2. Root level (hoisted)
    const root = path.join(rootNM, depName)
    if (existsPkg(root)) return root

    // 3. Search all nested locations
    return searchAllNested(rootNM, depName)
}

function searchAllNested(rootNM, depName) {
    for (const entry of safeReaddir(rootNM)) {
        if (entry.startsWith('.')) continue
        const candidates = entry.startsWith('@')
            ? safeReaddir(path.join(rootNM, entry)).map(s => `${entry}/${s}`)
            : [entry]
        for (const pkg of candidates) {
            const nested = path.join(rootNM, pkg, 'node_modules', depName)
            if (existsPkg(nested)) return nested
        }
    }
    return null
}

function collectPackages(nmDir) {
    const result = []
    function scan(dir) {
        if (!fs.existsSync(dir)) return
        for (const entry of safeReaddir(dir)) {
            if (entry.startsWith('.')) continue
            if (entry.startsWith('@')) {
                const scopeDir = path.join(dir, entry)
                for (const sub of safeReaddir(scopeDir)) {
                    const pkgDir = path.join(scopeDir, sub)
                    result.push({ name: `${entry}/${sub}`, dir: pkgDir })
                    scan(path.join(pkgDir, 'node_modules'))
                }
            } else {
                const pkgDir = path.join(dir, entry)
                result.push({ name: entry, dir: pkgDir })
                scan(path.join(pkgDir, 'node_modules'))
            }
        }
    }
    scan(nmDir)
    return result
}

function collectFiles(dir, baseDir) {
    const result = []
    for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
        const fullPath = path.join(dir, entry.name)
        if (entry.isDirectory()) {
            result.push(...collectFiles(fullPath, baseDir))
        } else {
            result.push(path.relative(baseDir, fullPath))
        }
    }
    return result
}

function existsPkg(dir) {
    return fs.existsSync(path.join(dir, 'package.json'))
}

function safeReaddir(dir) {
    try { return fs.readdirSync(dir) } catch { return [] }
}

function copyPackage(src, dest) {
    fs.mkdirSync(dest, { recursive: true })
    copyDir(src, dest)
}

function copyDir(src, dest) {
    for (const entry of fs.readdirSync(src, { withFileTypes: true })) {
        if (entry.name === 'node_modules') continue
        const srcPath = path.join(src, entry.name)
        const destPath = path.join(dest, entry.name)
        if (entry.isDirectory()) {
            fs.mkdirSync(destPath, { recursive: true })
            copyDir(srcPath, destPath)
        } else {
            fs.copyFileSync(srcPath, destPath)
        }
    }
}
