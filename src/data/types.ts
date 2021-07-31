import mongodb from "mongodb";
import type { PlatformName } from "../graphql/graphql.gen.js";

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

export interface StoryDbObject {
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
  };
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
  _id: mongodb.ObjectID;
  userId: string;
  createdAt: Date;
  hasRead: boolean;
}

interface NotificationDbObjectInvite extends NotificationDbObjectBase {
  inviterId: string;
  storyId: string;
  type: "invite";
}

interface NotificationDbObjectFollow extends NotificationDbObjectBase {
  followerId: string;
  type: "follow";
}

interface NotificationDbObjectNewStory extends NotificationDbObjectBase {
  storyId: string;
  creatorId: string;
  type: "new-story";
}

export type NotificationDbObject =
  | NotificationDbObjectInvite
  | NotificationDbObjectFollow
  | NotificationDbObjectNewStory;
