declare module "http" {
  interface IncomingMessage {
    is: (type: string) => boolean;
    query: Record<string, string>;
    cookies: Record<string, string>;
    url: string;
    method: string;
    path: string;
    body: any;
  }
}
