import { Buffer } from "node:buffer";
import { promises as fs } from "node:fs";

export const uInt8ArrayToString = (from: Uint8Array) => {
    return String.fromCharCode.apply(null, from as unknown as number[]);
};

export const base64ToFile = async (base64String: string, filePath: string) => {
    const bufferFromBase64 = Buffer.from(base64String, 'base64');
    try {
        await fs.writeFile(filePath, bufferFromBase64, null);
    } catch (e) {
        console.log(e);
    }
    console.log(`The file was saved in ${filePath}!`);
};
