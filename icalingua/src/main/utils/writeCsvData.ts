import fs from 'fs'

import {createObjectCsvWriter as createCsvWriter} from 'csv-writer'
import { ObjectMap } from 'csv-writer/src/lib/lang/object'

export default async function (header: Array<{ id: string, title: string }>, data: ObjectMap<any>[], savePath: string): Promise<boolean> {
    if (!savePath)
        return false

    const csvWriter = createCsvWriter({
        path: savePath,
        header,
        append: false,
    })
    await csvWriter.writeRecords(data)

    return true
}
