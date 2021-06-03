import { Options, Response } from "./types.js";

export class JuichiError extends Error {
  name = "JuichiError";
  code = "JUI_ERR";
  constructor(message: string) {
    super(message);
  }
}

export class HTTPStatusError extends JuichiError {
  name = "HTTPStatusError";
  code = "JUI_ERR_HTTP_STATUS";
  constructor(public response: Response, public options: Options) {
    super("HTTP response contains a non successful status");
  }
}
