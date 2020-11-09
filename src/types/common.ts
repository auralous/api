import type { IncomingMessage } from "http";
import type { Db } from "mongodb";
import type Redis from "ioredis";
import type { SessionData } from "next-session";
import type { UserDbObject } from "./db";
import type { PubSub } from "../lib/pubsub";
import type Services from "../services";
import type { IPlatformName } from "./resolvers.gen";

type SetCachControl = (maxAge: number, scope?: "PRIVATE" | "PUBLIC") => void;

export type ExtendedIncomingMessage = IncomingMessage & {
  session: SessionData;
  user?: UserDbObject | null;
  setCacheControl?: SetCachControl;
  is: (type: string) => boolean;
};

export type MyGQLContext = {
  db: Db;
  redis: Redis.Cluster;
  pubsub: PubSub;
  user: UserDbObject | null;
  services: Services;
  setCacheControl?: SetCachControl;
};

export type OdesliResponse =
  | {
      entityUniqueId: string;
      userCountry: string;
      pageUrl: string;
      linksByPlatform: {
        [platform in IPlatformName]?: {
          entityUniqueId: string;
        };
      };
    }
  | { statusCode: 404 };
