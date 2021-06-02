import { IncomingHttpHeaders } from "http";
import { Client, Dispatcher, request } from "undici";
import { URL } from "url";

interface Response<T> {
  status: number;
  data: T;
  headers: IncomingHttpHeaders;
}

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

function setToOptions(
  options: Partial<Dispatcher.RequestOptions>,
  _method: string,
  _data?: unknown
) {
  let data = _data || options.body || null;
  options.headers = options.headers || {};
  if (data && typeof data === "object") {
    data = JSON.stringify(data);
    if (!options.headers["content-type"])
      options.headers["content-type"] = "application/json";
  }
  options.body = data as Dispatcher.DispatchOptions["body"];
  options.method = _method;
  return options;
}

type RequestImplementation = <T>(
  path: string,
  options?: Partial<Dispatcher.RequestOptions>,
  _method?: string,
  _data?: unknown
) => Promise<Response<T>>;

function implement(_request: RequestImplementation) {
  return {
    get<T = unknown>(
      path: string,
      options?: Partial<Dispatcher.RequestOptions>
    ) {
      return _request<T>(path, options, "GET");
    },

    delete<T = unknown>(
      path: string,
      options?: Partial<Dispatcher.RequestOptions>
    ) {
      return _request<T>(path, options, "DELETE");
    },

    post<T = unknown>(
      path: string,
      data: unknown,
      options?: Partial<Dispatcher.RequestOptions>
    ) {
      return _request<T>(path, options, "POST", data);
    },

    put<T = unknown>(
      path: string,
      data: unknown,
      options?: Partial<Dispatcher.RequestOptions>
    ) {
      return _request<T>(path, options, "PUT", data);
    },

    patch<T = unknown>(
      path: string,
      data: unknown,
      options?: Partial<Dispatcher.RequestOptions>
    ) {
      return _request<T>(path, options, "PATCH", data);
    },
  };
}

export function createClient(url: string | URL, options?: Client.Options) {
  const client = new Client(url, options);
  return implement(function _request(path, opts = {}, _method = "GET", _data) {
    setToOptions(opts, _method, _data);
    return client
      .request(options as Dispatcher.RequestOptions)
      .then((response) => makeResponse(response));
  });
}

const juichi = implement(function _request(
  url: string,
  opts = {},
  _method = "GET",
  _data
) {
  setToOptions(opts, _method, _data);
  return request(url, opts as Dispatcher.RequestOptions).then((response) =>
    makeResponse(response)
  );
});

export default juichi;
