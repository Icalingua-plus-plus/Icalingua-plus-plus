export default () =>
    process.env.NODE_ENV === 'development' ? `http://localhost:9080` : `file://${__dirname}/index.html`
