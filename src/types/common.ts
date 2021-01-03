import type { IncomingMessage } from "http";
import type { Session } from "next-session/dist/types";
import type { UserDbObject } from "./db";
import type { PubSub } from "../lib/pubsub";
import type { PlatformName } from "./graphql.gen";
import type { UserService } from "../services/user";
import type { QueueService } from "../services/queue";
import type { TrackService } from "../services/track";
import type { MessageService } from "../services/message";
import type { StoryService } from "../services/story";
import type { NowPlayingService } from "../services/nowPlaying";
import type { FollowService } from "../services/follow";
import type { NotificationService } from "../services/notification";

type SetCachControl = (maxAge: number, scope?: "PRIVATE" | "PUBLIC") => void;

export type ExtendedIncomingMessage = IncomingMessage & {
  session: Session;
  user?: UserDbObject | null;
  setCacheControl?: SetCachControl;
  is: (type: string) => boolean;
};

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
