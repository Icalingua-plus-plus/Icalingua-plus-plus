import { app } from "electron";
import fs from "fs";
import path from "path";

const errorHandler = (e: Error) => {
  console.error(e);
  const errPath = app.getPath("crashDumps");
  const now = new Date();
  fs.writeFileSync(
    path.join(errPath, `Err${now.toISOString().substring(0, 19)}.log`),
    JSON.stringify(e)
  );
};
export default errorHandler;
