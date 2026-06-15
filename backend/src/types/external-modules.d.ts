declare module 'adm-zip' {
  export interface IZipEntry {
    entryName: string;
    isDirectory: boolean;
    getData(): Buffer;
  }

  export default class AdmZip {
    constructor(input?: string | Buffer);
    getEntries(): IZipEntry[];
    addLocalFile(localPath: string, zipPath?: string, zipName?: string): void;
    toBuffer(): Buffer;
    extractAllTo(targetPath: string, overwrite?: boolean): void;
  }
}

declare module 'multer' {
  import type { RequestHandler } from 'express';

  interface MulterInstance {
    single(fieldName: string): RequestHandler;
    array(fieldName: string, maxCount?: number): RequestHandler;
    fields(fields: Array<{ name: string; maxCount?: number }>): RequestHandler;
    none(): RequestHandler;
    any(): RequestHandler;
  }

  interface MulterOptions {
    storage?: unknown;
    limits?: Record<string, unknown>;
  }

  function multer(options?: MulterOptions): MulterInstance;

  namespace multer {
    function memoryStorage(): unknown;
  }

  export = multer;
}

declare namespace Express {
  namespace Multer {
    interface File {
      fieldname: string;
      originalname: string;
      encoding: string;
      mimetype: string;
      size: number;
      destination?: string;
      filename?: string;
      path?: string;
      buffer: Buffer;
    }
  }

  interface Request {
    file?: Multer.File;
    files?: Multer.File[] | Record<string, Multer.File[]>;
  }
}
