import logger from "./winstonLogger";

const errorHandler = (e: Error) => {
  logger.error({ errname: e.name, errMsg: e.message, e: e.toString() });
  throw e;
};

export default errorHandler;
