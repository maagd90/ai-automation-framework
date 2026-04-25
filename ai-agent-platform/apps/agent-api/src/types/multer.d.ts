// Minimal type declarations for multer v2 (no @types/multer available)
declare module 'multer' {
  import { RequestHandler } from 'express';

  interface File {
    fieldname: string;
    originalname: string;
    encoding: string;
    mimetype: string;
    size: number;
    destination: string;
    filename: string;
    path: string;
    buffer: Buffer;
  }

  interface Options {
    dest?: string;
    storage?: StorageEngine;
    limits?: {
      fieldNameSize?: number;
      fieldSize?: number;
      fields?: number;
      fileSize?: number;
      files?: number;
      parts?: number;
      headerPairs?: number;
    };
    preservePath?: boolean;
    fileFilter?: (
      req: Express.Request,
      file: File,
      callback: (error: Error | null, acceptFile: boolean) => void,
    ) => void;
  }

  interface StorageEngine {}

  interface DiskStorageOptions {
    destination?:
      | string
      | ((
          req: Express.Request,
          file: File,
          callback: (error: Error | null, destination: string) => void,
        ) => void);
    filename?: (
      req: Express.Request,
      file: File,
      callback: (error: Error | null, filename: string) => void,
    ) => void;
  }

  interface Multer {
    single(fieldname: string): RequestHandler;
    array(fieldname: string, maxCount?: number): RequestHandler;
    fields(fields: Array<{ name: string; maxCount?: number }>): RequestHandler;
    none(): RequestHandler;
    diskStorage(options: DiskStorageOptions): StorageEngine;
  }

  function multer(options?: Options): Multer;
  namespace multer {
    function diskStorage(options: DiskStorageOptions): StorageEngine;
  }

  export = multer;
}

// Augment Express Request with multer file
declare namespace Express {
  interface Request {
    file?: import('multer').File;
    files?:
      | import('multer').File[]
      | Record<string, import('multer').File[]>;
  }
}
