import { IncomingHttpHeaders } from "http";
import { Client, Dispatcher, request } from "undici";

interface Response<T> {
  status: number;
  data: T;
  headers: IncomingHttpHeaders;
}

type Config = Partial<Dispatcher.RequestOptions>;

const validateStatus = (status: number) => status < 300;
async function makeResponse<T>(response: Dispatcher.ResponseData) {
  const { body, headers: resHeaders, statusCode } = response;
  const res: Response<T> = {
    data: null as unknown as T,
    headers: resHeaders,
    status: statusCode,
  };
  body.setEncoding("utf8");
  for await (const b of body) {
    res.data = (res.data || "") + b;
  }
  if (res.data) {
    try {
      res.data = JSON.parse(res.data as unknown as string);
    } catch (e) {
      /** noop */
    }
  }
  return validateStatus(res.status) ? res : Promise.reject(res);
}

function makeRequest(
  path: string | undefined,
  options: Config = {},
  _method = "GET",
  _data?: unknown
) {
  let data = _data || options.body || null;
  const headers = options.headers || {};
  if (data && typeof data === "object") {
    data = JSON.stringify(data);
    if (!headers["content-type"]) headers["content-type"] = "application/json";
  }
  return {
    ...(path && { path }),
    method: _method,
    headers,
    body: data as null | string,
    ...options,
  };
}

export function wrapAxios(client: Client) {
  return {
    async request<T>(
      path: string,
      _method: string,
      options?: Config,
      _data?: unknown
    ) {
      const response = await client.request(
        // @ts-ignore: WTF TS?
        makeRequest(path, options, _method, _data)
      );
      return makeResponse<T>(response);
    },
    get<T = unknown>(path: string, config?: Config) {
      return this.request<T>(path, "GET", config);
    },
    delete<T = unknown>(path: string, config?: Config) {
      return this.request<T>(path, "DELETE", config);
    },
    post<T = unknown>(path: string, data: unknown, config?: Config) {
      return this.request<T>(path, "POST", config, data);
    },
    put<T = unknown>(path: string, data: unknown, config?: Config) {
      return this.request<T>(path, "PUT", config, data);
    },
    patch<T = unknown>(path: string, data: unknown, config?: Config) {
      return this.request<T>(path, "PUT", config, data);
    },
  };
}

export const axios = {
  async request<T>(
    path: string,
    _method: string,
    options?: Config,
    _data?: unknown
  ) {
    const response = await request(
      path,
      makeRequest(undefined, options, _method, _data)
    );
    return makeResponse<T>(response);
  },
  get<T = unknown>(path: string, config?: Config) {
    return this.request<T>(path, "GET", config);
  },
  delete<T = unknown>(path: string, config?: Config) {
    return this.request<T>(path, "DELETE", config);
  },
  post<T = unknown>(path: string, data: unknown, config?: Config) {
    return this.request<T>(path, "POST", config, data);
  },
  put<T = unknown>(path: string, data: unknown, config?: Config) {
    return this.request<T>(path, "PUT", config, data);
  },
  patch<T = unknown>(path: string, data: unknown, config?: Config) {
    return this.request<T>(path, "PUT", config, data);
  },
};

export function hackyStripOrigin(url: string) {
  const obj = new URL(url);
  return obj.href.replace(obj.origin, "");
}
