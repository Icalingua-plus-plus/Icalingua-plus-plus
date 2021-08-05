import { app } from "electron";
import winston from "winston";
import path from "path";
import DailyRotateFile from "winston-daily-rotate-file";

const errPath = app.getPath("crashDumps");
const logger = winston.createLogger({
  level: "info",
  format: winston.format.json(),
  defaultMeta: { service: "eqq-service" },
  transports: [
    // 错误消息记录到文件
    new DailyRotateFile({
      filename: path.join(errPath, "error-report-%DATE%.log"),
      datePattern: "YYYY-MM-DD-HH",
      zippedArchive: true,
      maxSize: "20m",
      maxFiles: "14d",
      level: "error",
    }),
    // 所有消息输出到控制台
    new winston.transports.Console(),
  ],
});

export default logger;
