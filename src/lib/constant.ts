export const MAX_TRACK_DURATION = 7 * 60 * 1000;

export const REDIS_KEY = {
  roomUsers: (roomId: string) => `room:${roomId}:users`,
  nowPlaying: (typeAndId: string) => `${typeAndId}:playing`,
  nowPlayingReaction: (
    typeAndId: string,
    currQueueItemId: string,
    userId: string | "*"
  ) => `${typeAndId}:reactions:${currQueueItemId}:${userId}`,
  queue: (typeAndId: string) => `${typeAndId}:queue`,
  track: (platformAndId: string) => `track:${platformAndId}`,
} as const;

export const CONFIG = {
  trackMaxAge: 7 * 24 * 60 * 60, // sec
  userMaxAge: 4 * 60 * 60,
  searchMaxAge: 2 * 60 * 60,
  randomRoomsMaxAge: 10 * 60,
} as const;
