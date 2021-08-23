export const MAX_TRACK_DURATION = 7 * 60 * 1000;

export const REDIS_KEY = {
  session: (sessionId: string) => `session:${sessionId}`,
  sessionListenerPresences(sessionId: string) {
    return `session:${sessionId}:listenerPresences`;
  },
  sessionInviteToken(sessionId: string) {
    return `session:${sessionId}:inviteToken`;
  },
  nowPlayingState(id: string) {
    return `nowPlaying:${id}:state`;
  },
  npSkipScheduler: "npSkipScheduler",
  nowPlayingReaction(id: string, uid: string) {
    return `nowPlaying:${id}:reactions:${uid}`;
  },
  queueList(id: string) {
    return `queue:${id}:list`;
  },
  queueData(id: string) {
    return `queue:${id}:data`;
  },
  message(id: string) {
    return `message:${id}`;
  },
  crossTracks: (platformAndId: string) => `crossTracks:${platformAndId}`,
  auth(token: string) {
    return `auth:${token}`;
  },
} as const;

export const CONFIG = {
  trackMaxAge: 14 * 24 * 60 * 60, // sec
  crossTrackMaxAge: 7 * 24 * 60 * 60,
  userMaxAge: 4 * 60 * 60,
  searchMaxAge: 2 * 60 * 60,
  searchPlaylistMaxAge: 10 * 60,
  activityTimeout: 120 * 1000, // if user does not ping in 2 min, they are considered left
  sessionLiveTimeout: 15 * 60 * 1000, // if creator is not active in session in 15 min, unlive it
  usernameMaxLength: 15,
  sessionTextMaxLength: 60,
} as const;

export const PUBSUB_CHANNELS = {
  nowPlayingUpdated: "NOW_PLAYING_UPDATED",
  nowPlayingReactionsUpdated: "NOW_PLAYING_REACTIONS_UPDATED",
  sessionUpdated: "SESSION_UPDATED",
  sessionListenersUpdated: "SESSION_LISTENERS_UPDATED",
  messageAdded: "MESSAGE_ADDED",
  queueUpdated: "QUEUE_UPDATED",
  notificationAdded: "NOTIFICATION_ADDED",
};
