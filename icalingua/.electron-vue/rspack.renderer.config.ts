import path from 'path'
import { Configuration, CopyRspackPlugin, HtmlRspackPlugin, DefinePlugin } from '@rspack/core'
import { VueLoaderPlugin } from 'vue-loader'
import { dependencies } from '../package.json'

const isProduction = process.env.NODE_ENV === 'production'

/**
 * List of node_modules to include in rspack bundle
 * Required for specific packages like Vue UI libraries
 * that provide pure *.vue files that need compiling
 */
const whiteListedModules = ['vue']

const rendererConfig: Configuration = {
    devtool: isProduction ? false : 'cheap-module-source-map',
    entry: {
        renderer: path.join(__dirname, '../src/renderer/main.ts')
    },
    externals: [
        ...Object.keys(dependencies || {}).filter(d => !whiteListedModules.includes(d))
    ],
    module: {
        rules: [
            {
                test: /\.vue$/,
                loader: 'vue-loader',
                options: {
                    compilerOptions: {
                        preserveWhitespace: false,
                        whitespace: 'condense'
                    }
                }
            },
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
                test: /\.less$/,
                use: ['vue-style-loader', 'css-loader', 'less-loader'],
                type: 'javascript/auto'
            },
            {
                test: /\.scss$/,
                use: ['vue-style-loader', 'css-loader', 'sass-loader'],
                type: 'javascript/auto'
            },
            {
                test: /\.css$/,
                use: ['vue-style-loader', 'css-loader'],
                type: 'javascript/auto'
            },
            {
                test: /\.html$/,
                type: 'asset/source'
            },
            {
                test: /\.node$/,
                use: 'node-loader'
            },
            {
                test: /\.(png|jpe?g|gif|svg)(\?.*)?$/,
                type: 'asset',
                parser: {
                    dataUrlCondition: {
                        maxSize: 10000
                    }
                },
                generator: {
                    filename: 'imgs/[name]--[hash][ext]'
                }
            },
            {
                test: /\.(mp4|webm|ogg|mp3|wav|flac|aac)(\?.*)?$/,
                type: 'asset',
                parser: {
                    dataUrlCondition: {
                        maxSize: 10000
                    }
                },
                generator: {
                    filename: 'media/[name]--[hash][ext]'
                }
            },
            {
                test: /\.(woff2?|eot|ttf|otf)(\?.*)?$/,
                type: 'asset',
                parser: {
                 dataUrlCondition: {
                        maxSize: 10000
                    }
                },
                generator: {
                    filename: 'fonts/[name]--[hash][ext]'
                }
            }
        ]
    },
    node: {
        __dirname: false,
        __filename: false
    },
    plugins: [
        new VueLoaderPlugin() as any,
        new HtmlRspackPlugin({
            filename: 'index.html',
            template: path.resolve(__dirname, '../src/index.ejs'),
            minify: isProduction,
            templateParameters: {
                nodeModules: !isProduction
                    ? path.resolve(__dirname, '../node_modules')
                    : ''
            }
        }),
        ...(isProduction ? [
            new CopyRspackPlugin({
                patterns: [
                    {
                        from: path.join(__dirname, '../static'),
                        to: 'static'
                    }
                ]
            }),
            new DefinePlugin({
                'process.env.NODE_ENV': '"production"'
            })
        ] : [
            new DefinePlugin({
                'process.env.NODE_ENV': '"development"'
            })
        ])
    ],
    output: {
        filename: '[name].js',
        library: {
            type: 'commonjs2'
        },
        path: path.join(__dirname, '../dist/electron')
    },
    resolve: {
        alias: {
            '@': path.join(__dirname, '../src/renderer'),
            'vue$': 'vue/dist/vue.esm.js'
        },
        extensions: ['.ts', '.js', '.vue', '.json', '.css', '.node']
    },
    target: 'electron-renderer',
    mode: isProduction ? 'production' : 'development'
}

export default rendererConfig
