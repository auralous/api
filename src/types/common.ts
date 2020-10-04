import type { IncomingMessage } from "http";
import type { SessionData } from "next-session";
import type { Db } from "mongodb";
import Redis from "ioredis";
import { UserDbObject, PlaylistDbObject } from "./db";
import { PubSub } from "../lib/pubsub";
import { AllServices } from "../services/types";

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
  pubsub: PubSub;
  user: UserDbObject | null;
  services: AllServices;
  setCacheControl?: SetCachControl;
};

export type OAuthProviderName = "youtube" | "twitter" | "facebook" | "spotify";

export type ExternalPlaylistResponse = Pick<
  PlaylistDbObject,
  "externalId" | "platform" | "image" | "title" | "tracks" | "userId"
>;
