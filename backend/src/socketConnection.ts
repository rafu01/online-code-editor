import { Server as SocketServer, Socket } from "socket.io";
import { Server as HttpServer } from "http";
import {getFileContents, copyToLocal, writeToFile} from "./s3Service";
import path from "path";
import * as dotenv from "dotenv";
// @ts-ignore
import {TerminalManager} from "./terminalManager";
import {initiate, runCommand} from "./terminalService";
dotenv.config();

const terminalManager = new TerminalManager();

export function initializeSocket(httpServer: HttpServer) {
  const io = new SocketServer(httpServer, {
    cors: {
      origin: '*',
      methods: ['GET', 'POST']
    }
  });
  io.on("connection", async (socket) => {
    const id = socket.handshake.query.id as string;
    socket.on('init', async (idObject)=> {
      const {id} = idObject;
      await copyToLocal(`code/${id}`, path.join(__dirname, `../../tmp/${id}`));
    })
    socket.on('fetchFileContent', async (filePath, callback) => {
      try {
        let fileContent = await getFileContents(filePath);
        callback(null, fileContent);
      }
      catch (err) {
        callback(err);
      }
    })
    socket.on('saveChange', async (updatedFile, filePath, callback) => {
      try {
        await writeToFile(filePath, updatedFile);
        callback(null, true);
      }
      catch (err) {
        callback(err);
      }
    })
    socket.on("requestTerminal", async (idObject, callback) => {
      const {id} = idObject;
      const {output, cwd} = await initiate(id);
      callback(null, {data: output, cwd});
      // terminalManager.createPty(socket.id, id, (data: any, cwd: string, terminalId: any) => {
      //   callback(null, {data: Buffer.from(data,"utf-8"), cwd});
      // });
    });

    socket.on('disconnect', () => {
      console.log('a user disconnected');
    });

    socket.on("executeCommand", async (command, callback) => {
      console.log('command: ', command);
      const output = await runCommand(command);
      callback(null, {output});
    });
  });
}
