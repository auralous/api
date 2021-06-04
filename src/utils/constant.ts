export const MAX_TRACK_DURATION = 7 * 60 * 1000;

export const REDIS_KEY = {
  story: (storyId: string) => `story:${storyId}`,
  storyUserStatus(storyId: string) {
    return `${this.story(storyId)}:userStatus`;
  },
  nowPlaying(id: string) {
    return `nowPlaying:${id}:playing`;
  },
  nowPlayingReaction(id: string, index: number) {
    return `nowPlaying:${id}:reactions:${index}`;
  },
  queue(id: string) {
    return `queue:${id}`;
  },
  message(id: string) {
    return `message:${id}`;
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
