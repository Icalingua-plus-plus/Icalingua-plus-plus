import logger from './winstonLogger'

const errorHandler = (e: Error, noThrow = false) => {
    logger.error({errname: e.name, errMsg: e.message, e: e.toString()})
    if (!noThrow)
        throw e
}

export default errorHandler
