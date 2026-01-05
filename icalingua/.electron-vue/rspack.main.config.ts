import path from 'path'
import { Configuration } from '@rspack/core'
import { dependencies } from '../package.json'

const isProduction = process.env.NODE_ENV === 'production'

const mainConfig: Configuration = {
    entry: {
        main: path.join(__dirname, '../src/main/index.ts')
    },
    externals: [
        ...Object.keys(dependencies || {})
    ],
    module: {
        rules: [
            {
                test: /\.ts$/,
                exclude: /node_modules/,
                loader: 'builtin:swc-loader',
                options: {
                    jsc: {
                        parser: {
                            syntax: 'typescript'
                        },
                        target: 'es2022'
                    }
                },
                type: 'javascript/auto'
            },
            {
                test: /\.node$/,
                use: 'node-loader'
            }
        ]
    },
    output: {
        filename: '[name].js',
        library: {
            type: 'commonjs2'
        },
        path: path.join(__dirname, '../dist/electron')
    },
    plugins: [],
    resolve: {
        extensions: ['.js', '.ts', '.json', '.node']
    },
    target: 'electron-main',
    mode: isProduction ? 'production' : 'development',
    devtool: isProduction ? false : 'source-map',
    node: {
        __dirname: false,
        __filename: false
    }
}

export default mainConfig
