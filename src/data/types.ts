import mongodb from "mongodb";
import type { PlatformName } from "../graphql/graphql.gen.js";

export interface UserDbObject {
  _id: string;
  email?: string;
  username: string;
  profilePicture?: string;
  bio?: string | null;
  createdAt: Date;
  oauthProvider: PlatformName;
  oauthId: string;
}

export interface SessionDbObject {
  _id: mongodb.ObjectID;
  text: string;
  creatorId: string;
  createdAt: Date;
  isLive: boolean;
  image?: string | null;
  // Settings
  collaboratorIds: string[];
  // Internal
  lastCreatorActivityAt: Date;
  location?: {
    type: "Point";
    coordinates: [longitude: number, latitude: number];
  } | null;
  // Store tracks after unlive
  trackIds: string[];
}

export interface TrackDbObject {
  id: string;
  platform: PlatformName;
  externalId: string;
  duration: number;
  title: string;
  image?: string;
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

export interface FollowDbObject {
  _id: mongodb.ObjectID;
  follower: string;
  following: string;
  followedAt: Date;
  unfollowedAt: Date | null;
}

interface NotificationDbObjectBase {
  userId: string;
  createdAt: Date;
  hasRead: boolean;
}

export interface NotificationDbObjectFollow extends NotificationDbObjectBase {
  followedBy: string;
  type: "follow";
}

export interface NotificationDbObjectNewSession
  extends NotificationDbObjectBase {
  sessionId: string;
  type: "new-session";
}

export type NotificationDbObjectUnion =
  | NotificationDbObjectFollow
  | NotificationDbObjectNewSession;

export interface FeedConfig {
  youtubeFeaturedPlaylists: string[];
}
