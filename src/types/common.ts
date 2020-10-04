import { IncomingMessage } from "http";
import type { SessionData } from "next-session";
import { Db } from "mongodb";
import Redis from "ioredis";
import { UserDbObject, PlaylistDbObject } from "./db";
import { pubsub } from "../lib/pubsub";
import { BaseModel } from "../models/base";

export type PlatformName = "youtube" | "spotify";

export type PlaylistTrack = string;

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
  pubsub: typeof pubsub;
  pub: Redis.Cluster;
  user: UserDbObject | null;
  services: BaseModel["services"];
  setCacheControl?: SetCachControl;
};

export type OAuthProviderName = "youtube" | "twitter" | "facebook" | "spotify";

export type ExternalPlaylistResponse = Pick<
  PlaylistDbObject,
  "externalId" | "platform" | "image" | "title" | "tracks" | "userId"
>;
