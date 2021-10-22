import assert from "assert";

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
  nowPlayingReaction(id: string, uid: string) {
    return `nowPlaying:${id}:reactions:${uid}`;
  },
  queueList(id: string) {
    return `queue:${id}:list`;
  },
  queueData(id: string) {
    return `queue:${id}:data`;
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
  sessionLiveTimeout: 15 * 60 * 1000, // if creator is not active in session in 15 min, end it
  usernameMaxLength: 15,
  sessionTextMaxLength: 60,
} as const;

export const PUBSUB_CHANNELS = {
  nowPlayingUpdated: "NOW_PLAYING_UPDATED",
  nowPlayingReactionsUpdated: "NOW_PLAYING_REACTIONS_UPDATED",
  sessionUpdated: "SESSION_UPDATED",
  sessionListenersUpdated: "SESSION_LISTENERS_UPDATED",
  messageAdded: "MESSAGE_ADDED",
  notificationAdded: "NOTIFICATION_ADDED",
  worker: "NOW_PLAYING_WORKER",
};

export const IS_DEV = process.env.NODE_ENV !== "production";

assert(process.env.API_URI);
assert(process.env.APP_URI);
assert(process.env.GOOGLE_API_KEY);
assert(process.env.GOOGLE_CLIENT_KEY);
assert(process.env.GOOGLE_CLIENT_SECRET);
assert(process.env.SPOTIFY_CLIENT_ID);
assert(process.env.SPOTIFY_CLIENT_SECRET);
assert(process.env.SONGLINK_KEY);
assert(process.env.MONGODB_URI);
assert(process.env.REDIS_URL);

export const ENV = {
  API_URI: process.env.API_URI,
  APP_URI: process.env.APP_URI,
  GOOGLE_API_KEY: process.env.GOOGLE_API_KEY,
  GOOGLE_CLIENT_KEY: process.env.GOOGLE_CLIENT_KEY,
  GOOGLE_CLIENT_SECRET: process.env.GOOGLE_CLIENT_SECRET,
  SPOTIFY_CLIENT_ID: process.env.SPOTIFY_CLIENT_ID,
  SPOTIFY_CLIENT_SECRET: process.env.SPOTIFY_CLIENT_SECRET,
  SONGLINK_KEY: process.env.SONGLINK_KEY,
  MONGODB_URI: process.env.MONGODB_URI,
  REDIS_URL: process.env.REDIS_URL,
  PORT: process.env.PORT || "4000",
};
