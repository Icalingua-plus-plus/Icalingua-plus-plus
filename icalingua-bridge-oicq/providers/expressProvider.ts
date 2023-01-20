import express from 'express'
import sendImgTokenManager from '../utils/sendImgTokenManager'
import adapter from '../adapters/oicqAdapter'
import { json } from 'body-parser'

export const app = express()
const parser = json({
    limit: '10mb',
})

app.post('/api/:token/sendMessage', parser, (req, res) => {
    if (req.params.token && sendImgTokenManager.verify(req.params.token)) {
        adapter.sendMessage(req.body)
        res.sendStatus(202).end()
    } else res.sendStatus(403).end()
})

app.use('/file-manager', express.static('static/file-manager'))
app.use('/records', express.static('data/records'))
