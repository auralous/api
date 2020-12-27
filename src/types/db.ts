import { ObjectID } from "mongodb";
import type { PlatformName, MessageType } from "./graphql.gen";

export interface UserOauthProvider {
  provider: PlatformName;
  accessToken?: string | null;
  refreshToken?: string | null;
  expiredAt?: Date | null;
  id: string;
}

export interface UserDbObject {
  _id: string;
  email?: string;
  username: string;
  profilePicture?: string;
  bio?: string | null;
  createdAt: Date;
  oauth: UserOauthProvider;
}

export interface QueueItemDbObject {
  id: string;
  trackId: string;
  creatorId: string;
}

export interface NowPlayingItemDbObject extends QueueItemDbObject {
  playedAt: Date;
  endedAt: Date;
}

export interface StoryDbObject {
  _id: ObjectID;
  text: string;
  creatorId: string;
  createdAt: Date;
  isPublic: boolean;
  isLive: boolean;
  image?: string | null;
  // Settings
  queueable: string[];
  viewable: string[];
  // Internal
  lastCreatorActivityAt: Date;
}

export interface TrackDbObject {
  id: string;
  platform: PlatformName;
  externalId: string;
  duration: number;
  title: string;
  image: string;
  artistIds: string[];
  albumId: string;
  url: string;
}

export interface ArtistDbObject {
  id: string;
  platform: PlatformName;
  externalId: string;
  name: string;
  url: string;
  image: string;
}

export interface MessageDbObject {
  id: string;
  creatorId: string;
  createdAt: Date;
  attachment?: undefined; // TODO: Implement
  text?: string;
  type: MessageType;
}

export interface FollowDbObject {
  _id: ObjectID;
  follower: string;
  following: string;
  followedAt: Date;
  unfollowedAt?: Date | null;
}
