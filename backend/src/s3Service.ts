import fs from "fs";
import path from "path";
import * as dotenv from "dotenv";
import {createTreeFromPaths, TreeNode} from "./treeNodeService";

dotenv.config();

const AWS = require('aws-sdk');

const s3 = new AWS.S3({
    accessKeyId: process.env.AWS_ACCESS_KEY,
    secretAccessKey: process.env.AWS_SECRET_KEY,
    // endpoint: process.env.AWS_ENDPOINT,
    s3ForcePathStyle: true,
});

export async function fetchAllObjects(sourcePrefix: string) {
    const listedObjects = await fetchObjects(sourcePrefix);
    let responseList: string[] = [];
    for( const object of listedObjects.Contents) {
        responseList.push(object.Key);
    }
    return createTreeFromPaths(responseList);
}
async function fetchObjects(sourcePrefix: string) {
    const listParams = {
        Bucket: process.env.AWS_S3_BUCKET ?? "",
        Prefix: sourcePrefix,
    };

    return await s3.listObjectsV2(listParams).promise();
}

export async function copyS3Folder(sourcePrefix: string, destinationPrefix: string): Promise<TreeNode[]> {
    try {
        const listedObjects = await fetchObjects(sourcePrefix);

        if (!listedObjects.Contents || listedObjects.Contents.length === 0) {
            console.log("base is empty");
        }
        let responseList: string[] = [];
        for (const object of listedObjects.Contents) {
            if (!object.Key) continue;
            const destinationKey = object.Key.replace(sourcePrefix, destinationPrefix);
            const copyParams = {
                Bucket: process.env.AWS_S3_BUCKET ?? "",
                CopySource: `${process.env.AWS_S3_BUCKET}/${object.Key}`,
                Key: destinationKey
            };
            try {
                await s3.copyObject(copyParams).promise();
                console.log(`Copied ${object.Key} to ${destinationKey}`);
                responseList.push(destinationKey);
            } catch (error) {
                console.error(`Error copying ${object.Key} to ${destinationKey}:`, error);
            }
        }
        return createTreeFromPaths(responseList);
    } catch (error) {
        console.error('Error copying folder:', error);
        throw error;
    }
}

function writeFile(filePath: string, fileData: Buffer): Promise<void> {
    return new Promise(async (resolve, reject) => {
        await createFolder(path.dirname(filePath));

        fs.writeFile(filePath, fileData, (err) => {
            if (err) {
                reject(err)
            } else {
                resolve()
            }
        })
    });
}

function getPath(filePath: string, codeFolderLength: number) {
    return path.join(`/workspace', ${filePath.substring(codeFolderLength)}`);
}

export function writeToFile(filePath: string, fileData: string):Promise<void> {
    return new Promise(async (resolve, reject) => {
        let codeFolderLength = `${process.env.CODE_FOLDER}`.length;
        fs.writeFile(getPath(filePath, codeFolderLength), fileData, (err) => {
            if (err) {
                reject(err)
            } else {
                resolve()
            }
        })
        await uploadToS3(filePath, fileData);
    });
}

async function uploadToS3(filePath: string, fileData: string) {
    const putObjectParams = {
        Bucket: process.env.AWS_S3_BUCKET ?? "",
        Key: filePath,
        Body: fileData,
        ContentType: 'text/plain'
    }
    try {
       await s3.putObject(putObjectParams).promise();
    }
    catch (err) {
        console.log("error uploading file", err);
    }
}
function createFolder(dirName: string) {
    return new Promise<void>((resolve, reject) => {
        fs.mkdir(dirName, {recursive: true}, (err) => {
            if (err) {
                return reject(err)
            }
            resolve()
        });
    })
}

export const copyToLocal = async (key: string, path: string) => {
    try {
        let listedObjects = await s3.listObjectsV2({
            Bucket: process.env.AWS_S3_BUCKET,
            Prefix: key
        }).promise();
        for (const object of listedObjects.Contents) {
            const getObjectParams = {
                Bucket: process.env.AWS_S3_BUCKET ?? '',
                Key: object.Key
            }
            const data = await s3.getObject(getObjectParams).promise();
            if(data.Body) {
                const fileData = data.Body;
                const filePath = `${path}${object.Key.replace(key, "")}`;
                await writeFile(filePath, fileData);
                console.log(`Download ${object.Key} to ${filePath}`);
            }
        }
    } catch (error) {
        console.log("Error fetching folder from S3", error);
    }
}

export const getFileContents = async (filePath: string): Promise<string> => {
    return new Promise<string>((resolve, reject) => {
        console.log(filePath)
        let codeFolderLength = `${process.env.CODE_FOLDER}`.length;
        fs.readFile(getPath(filePath, codeFolderLength), 'utf-8',  (err, data) => {
            if (err) {
                console.log(err);
                reject(err);
            } else {
                resolve(data);
            }
        });
    })
}

export const checkIfIdExists = async (id: string): Promise<boolean> => {
    try {
        const headObjectParams = {
            Bucket: process.env.AWS_S3_BUCKET ?? "",
            Prefix: `${process.env.CODE_FOLDER}${id}`,
        };
        let listObjects = await s3.listObjectsV2(headObjectParams).promise();
        return listObjects.Contents.length > 0;
    }
    catch (err) {
        console.log(err);
        return false;
    }
}

