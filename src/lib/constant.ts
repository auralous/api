export const MAX_TRACK_DURATION = 7 * 60 * 1000;

export const REDIS_KEY = {
  room: (roomId: string) => `room:${roomId}`,
  roomUsers(roomId: string) {
    return `${this.room(roomId)}:users`;
  },
  nowPlaying(roomId: string) {
    return `room:${roomId}:playing`;
  },
  nowPlayingReaction(roomId: string, currQueueItemId: string) {
    return `room:${roomId}:reactions:${currQueueItemId}`;
  },
  queue(typeAndId: string) {
    const [type, id] = typeAndId.split(":");
    if (type !== "room") throw new Error("Invalid type in queueId");
    if (typeAndId.includes(":played")) {
      // Played queue ends with :played instead of :queue
      return `${this[type](id)}:played`;
    }
    return `${this[type](id)}:queue`;
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
  randomRoomsMaxAge: 10 * 60,
} as const;

export const PUBSUB_CHANNELS = {
  nowPlayingResolve: "NOW_PLAYING_RESOLVE",
  nowPlayingUpdated: "NOW_PLAYING_UPDATED",
  nowPlayingReactionsUpdated: "NOW_PLAYING_REACTIONS_UPDATED",
  roomStateUpdated: "ROOM_STATE_UPDATED",
  messageAdded: "MESSAGE_ADDED",
  queueUpdated: "QUEUE_UPDATED",
};
