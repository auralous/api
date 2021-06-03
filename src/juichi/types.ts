import type { IncomingHttpHeaders } from "http";
import type { Readable } from "stream";
import type { URLSearchParams } from "url";

export interface ResponseHelpers {
  json<T>(): Promise<T>;
  text(): Promise<string>;
}

export interface ResponseData {
  status: number;
  headers: IncomingHttpHeaders;
  body: Readable;
  ok: boolean;
}
export type ResponsePromise = ResponseHelpers & Promise<Response>;
export type Response = ResponseHelpers & ResponseData;

export interface Options {
  headers?: IncomingHttpHeaders;
  body?: string | Buffer | URLSearchParams | Record<string, unknown>;
  method?: string;
  prefixURL?: string;
}

export interface Juichi {
  (url: string, options?: Options): ResponsePromise;
  get(url: string, options?: Options): ResponsePromise;
  post(url: string, options?: Options): ResponsePromise;
  put(url: string, options?: Options): ResponsePromise;
  delete(url: string, options?: Options): ResponsePromise;
  patch(url: string, options?: Options): ResponsePromise;
  create(defaults?: Options): Juichi;
}
