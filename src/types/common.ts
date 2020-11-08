import type { IncomingMessage } from "http";
import type { SessionData } from "next-session";
import type { Db } from "mongodb";
import Redis from "ioredis";
import { UserDbObject } from "./db";
import { PubSub } from "../lib/pubsub";
import Services from "../services";

export type PlatformName = "youtube" | "spotify";

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

export type OAuthProviderName = "youtube" | "twitter" | "facebook" | "spotify";

export type OdesliResponse =
  | {
      entityUniqueId: string;
      userCountry: string;
      pageUrl: string;
      linksByPlatform: {
        [platform in PlatformName]?: {
          entityUniqueId: string;
        };
      };
    }
  | { statusCode: 404 };
