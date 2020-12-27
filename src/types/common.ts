import type { IncomingMessage } from "http";
import type { Db } from "mongodb";
import type Redis from "ioredis";
import type { Session } from "next-session/dist/types";
import type { UserDbObject } from "./db";
import type { PubSub } from "../lib/pubsub";
import type { PlatformName } from "./graphql.gen";
import { UserService } from "../services/user";
import { QueueService } from "../services/queue";
import { TrackService } from "../services/track";
import { MessageService } from "../services/message";
import { StoryService } from "../services/story";
import { NowPlayingService } from "../services/nowPlaying";

type SetCachControl = (maxAge: number, scope?: "PRIVATE" | "PUBLIC") => void;

export type ExtendedIncomingMessage = IncomingMessage & {
  session: Session;
  user?: UserDbObject | null;
  setCacheControl?: SetCachControl;
  is: (type: string) => boolean;
};

export type MyGQLContext = {
  db: Db;
  redis: Redis.Cluster;
  pubsub: PubSub;
  user: UserDbObject | null;
  setCacheControl?: SetCachControl;
  services: {
    User: UserService;
    Queue: QueueService;
    Track: TrackService;
    Message: MessageService;
    Story: StoryService;
    NowPlaying: NowPlayingService;
  };
};

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
