import express from 'express'
import tokenManager from '../utils/tokenManager'
import adapter from '../adapters/oicqAdapter'
import {json} from 'body-parser'

export const app = express()
const parser = json({
    limit: '5mb'
})

app.post('/api/:token/sendMessage', parser, (req, res) => {
    if (req.params.token && tokenManager.verify(req.params.token)) {
        adapter.sendMessage(req.body)
        res.sendStatus(202).end()
    } else
        res.sendStatus(403).end()
})
