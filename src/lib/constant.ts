export const MAX_TRACK_DURATION = 7 * 60 * 1000;

export const REDIS_KEY = {
  _getTypeAndId(typeAndId: string): ["room", string] {
    const [type, id] = typeAndId.split(":");
    if (type === "room") return ["room", id];
    throw new Error("Invalid type in typeAndId key");
  },
  room: (roomId: string) => `room:${roomId}`,
  roomUsers(roomId: string) {
    return `${this.room(roomId)}:users`;
  },
  nowPlaying(typeAndId: string) {
    const [typeFn, id] = this._getTypeAndId(typeAndId);
    return `${this[typeFn](id)}:playing`;
  },
  nowPlayingReaction(typeAndId: string, currQueueItemId: string) {
    const [typeFn, id] = this._getTypeAndId(typeAndId);
    return `${this[typeFn](id)}:reactions:${currQueueItemId}`;
  },
  queue(typeAndId: string) {
    const [typeFn, id] = this._getTypeAndId(typeAndId);
    if (typeAndId.includes(":played")) {
      // Played queue ends with :played instead of :queue
      return `${this[typeFn](id)}:played`;
    }
    return `${this[typeFn](id)}:queue`;
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
