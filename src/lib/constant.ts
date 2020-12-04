export const MAX_TRACK_DURATION = 7 * 60 * 1000;

export const REDIS_KEY = {
  story: (storyId: string) => `story:${storyId}`,
  storyUserStatus(storyId: string) {
    return `${this.story(storyId)}:userStatus`;
  },
  nowPlaying(storyId: string) {
    return `story:${storyId}:playing`;
  },
  nowPlayingReaction(storyId: string, currQueueItemId: string) {
    return `story:${storyId}:reactions:${currQueueItemId}`;
  },
  queue(typeAndId: string) {
    const [type, id] = typeAndId.split(":");
    if (type !== "story") throw new Error("Invalid resourceType");
    if (typeAndId.includes(":played")) {
      // Played queue ends with :played instead of :queue
      return `${this[type](id)}:played`;
    }
    return `${this[type](id)}:queue`;
  },
  message(typeAndId: string) {
    const [type, id] = typeAndId.split(":");
    if (type !== "story") throw new Error("Invalid resourceType");
    return { type, id, key: `${this[type](id)}:messages` };
  },
  track: (platformAndId: string) => `track:${platformAndId}`,
  artist: (platformAndId: string) => `artist:${platformAndId}`,
  crossTracks: (platformAndId: string) => `crossTracks:${platformAndId}`,
} as const;

export const CONFIG = {
  trackMaxAge: 14 * 24 * 60 * 60, // sec
  crossTrackMaxAge: 7 * 24 * 60 * 60,
  userMaxAge: 4 * 60 * 60,
  searchMaxAge: 2 * 60 * 60,
  searchPlaylistMaxAge: 10 * 60,
  randomStorysMaxAge: 10 * 60,
  activityTimeout: 60 * 1000, // story precense: if user does not ping in 1 min, they are considered left
} as const;

export const PUBSUB_CHANNELS = {
  nowPlayingWorker: "NOW_PLAYING_WORKER",
  nowPlayingUpdated: "NOW_PLAYING_UPDATED",
  nowPlayingReactionsUpdated: "NOW_PLAYING_REACTIONS_UPDATED",
  storyStateUpdated: "STORY_STATE_UPDATED",
  messageAdded: "MESSAGE_ADDED",
  queueUpdated: "QUEUE_UPDATED",
};
