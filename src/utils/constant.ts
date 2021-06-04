export const MAX_TRACK_DURATION = 7 * 60 * 1000;

export const REDIS_KEY = {
  story: (storyId: string) => `story:${storyId}`,
  storyUserStatus(storyId: string) {
    return `${this.story(storyId)}:userStatus`;
  },
  nowPlaying(storyId: string) {
    return `story:${storyId}:playing`;
  },
  nowPlayingReaction(storyId: string, index: number) {
    return `story:${storyId}:reactions:${index}`;
  },
  queue(storyId: string, played?: boolean) {
    if (played) return `${this.story(storyId)}:played`;
    return `${this.story(storyId)}:queue`;
  },
  message(typeAndId: string) {
    const [type, id] = typeAndId.split(":");
    if (type !== "story") throw new TypeError("Invalid resourceType");
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
  activityTimeout: 60 * 1000, // if user does not ping in 1 min, they are considered left
  storyLiveTimeout: 15 * 60 * 1000, // if creator is not active in story in 15 min, unpublish it
  usernameMaxLength: 15,
  storyTextMaxLength: 60,
} as const;

export const PUBSUB_CHANNELS = {
  nowPlayingWorker: "NOW_PLAYING_WORKER",
  nowPlayingUpdated: "NOW_PLAYING_UPDATED",
  nowPlayingReactionsUpdated: "NOW_PLAYING_REACTIONS_UPDATED",
  storyUpdated: "STORY_UPDATED",
  storyUsersUpdated: "STORY_USERS_UPDATED",
  messageAdded: "MESSAGE_ADDED",
  queueUpdated: "QUEUE_UPDATED",
  notificationAdded: "NOTIFICATION_ADDED",
};
