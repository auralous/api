import type { IncomingMessage } from "http";
import type WebSocket from "ws";
import type { PubSub } from "../lib/pubsub";
import type { FollowService } from "../services/follow";
import type { MessageService } from "../services/message";
import type { NotificationService } from "../services/notification";
import type { NowPlayingService } from "../services/nowPlaying";
import type { QueueService } from "../services/queue";
import type { StoryService } from "../services/story";
import type { TrackService } from "../services/track";
import type { UserService } from "../services/user";
import type { UserDbObject } from "./db";
import type { PlatformName } from "./graphql.gen";

type SetCachControl = (maxAge: number, scope?: "PRIVATE" | "PUBLIC") => void;

export type ExtendedIncomingMessage = IncomingMessage & {
  setCacheControl?: SetCachControl;
  is: (type: string) => boolean;
  query: Record<string, string>;
  url: string;
  method: string;
  path: string;
  body: any;
};

export type ExtendedWebSocket = WebSocket & { isAlive: boolean };

export type MyGQLContext = {
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
    Follow: FollowService;
    Notification: NotificationService;
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
