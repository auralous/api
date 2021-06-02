import { PubSub } from "../data/pubsub.js";
import { UserDbObject } from "../data/types.js";
import type { SetCacheControl } from "../server/types.js";
import type { FollowService } from "../services/follow.js";
import type { MessageService } from "../services/message.js";
import type { NotificationService } from "../services/notification.js";
import type { NowPlayingService } from "../services/nowPlaying.js";
import type { QueueService } from "../services/queue.js";
import type { StoryService } from "../services/story.js";
import type { TrackService } from "../services/track.js";
import type { UserService } from "../services/user.js";

export type MyGQLContext = {
  pubsub: PubSub;
  user: UserDbObject | null;
  setCacheControl?: SetCacheControl;
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
