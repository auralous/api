import type { IPlatformName, IOAuthProviderName } from "./resolvers.gen";

export interface UserOauthProvider<T extends IOAuthProviderName> {
  provider: T;
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
  oauth: {
    youtube?: UserOauthProvider<IOAuthProviderName.Youtube>;
    spotify?: UserOauthProvider<IOAuthProviderName.Spotify>;
    facebook?: UserOauthProvider<IOAuthProviderName.Facebook>;
    twitter?: UserOauthProvider<IOAuthProviderName.Twitter>;
  };
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

export interface RoomDbObject {
  _id: string;
  title: string;
  description?: string | null;
  creatorId: string;
  createdAt: Date;
  isPublic: boolean;
  image?: string | null;
  // Settings
  collabs?: string[];
  anyoneCanAdd?: boolean;
  password?: string;
}

export interface TrackDbObject {
  id: string;
  platform: IPlatformName;
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
  platform: IPlatformName;
  externalId: string;
  name: string;
  url: string;
  image: string;
}
