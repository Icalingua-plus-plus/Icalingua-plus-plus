import logger from './winstonLogger'
import { RetError } from 'oicq'

const errorHandler = (e: Error | RetError, noThrow = false) => {
    if ('name' in e) {
        logger.error({ errname: e.name, errMsg: e.message, e: e.toString() })
    } else {
        logger.error({ errname: e.code, errMsg: e.message, e: e.toString() })
    }
    if (!noThrow) throw e
}

export default errorHandler
