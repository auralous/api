import { GraphQLResolveInfo, GraphQLScalarType, GraphQLScalarTypeConfig } from 'graphql';
import { UserDbObject, TrackDbObject, ArtistDbObject, RoomDbObject, QueueItemDbObject } from './db';
import { MyGQLContext } from './common';
export type Maybe<T> = T | null;
export type Exact<T extends { [key: string]: unknown }> = { [K in keyof T]: T[K] };
export type Omit<T, K extends keyof T> = Pick<T, Exclude<keyof T, K>>;
export type RequireFields<T, K extends keyof T> = { [X in Exclude<keyof T, K>]?: T[X] } & { [P in K]-?: NonNullable<T[P]> };
/** All built-in and custom scalars, mapped to their actual values */
export type Scalars = {
  ID: string;
  String: string;
  Boolean: boolean;
  Int: number;
  Float: number;
  /** A date-time string at UTC, such as 2007-12-03T10:15:30Z, compliant with the `date-time` format outlined in section 5.6 of the RFC 3339 profile of the ISO 8601 standard for representation of dates and times using the Gregorian calendar. */
  DateTime: any;
  /** The `Upload` scalar type represents a file upload. */
  Upload: any;
};

export type IQuery = {
  _empty?: Maybe<Scalars['String']>;
  me?: Maybe<IUser>;
  user?: Maybe<IUser>;
  meAuth?: Maybe<IUserAuthWrapper>;
  room?: Maybe<IRoom>;
  roomState?: Maybe<IRoomState>;
  rooms?: Maybe<Array<IRoom>>;
  exploreRooms: Array<IRoom>;
  searchRooms: Array<IRoom>;
  track?: Maybe<ITrack>;
  crossTracks?: Maybe<ICrossTracks>;
  searchTrack: Array<ITrack>;
  queue?: Maybe<IQueue>;
  nowPlaying?: Maybe<INowPlaying>;
  nowPlayingReactions?: Maybe<INowPlayingReaction>;
};


export type IQueryUserArgs = {
  username?: Maybe<Scalars['String']>;
  id?: Maybe<Scalars['ID']>;
};


export type IQueryRoomArgs = {
  id: Scalars['ID'];
};


export type IQueryRoomStateArgs = {
  id: Scalars['ID'];
};


export type IQueryRoomsArgs = {
  creatorId?: Maybe<Scalars['String']>;
};


export type IQueryExploreRoomsArgs = {
  by: Scalars['String'];
};


export type IQuerySearchRoomsArgs = {
  query: Scalars['String'];
  limit?: Maybe<Scalars['Int']>;
};


export type IQueryTrackArgs = {
  id?: Maybe<Scalars['ID']>;
  uri?: Maybe<Scalars['String']>;
};


export type IQueryCrossTracksArgs = {
  id: Scalars['ID'];
};


export type IQuerySearchTrackArgs = {
  platform: IPlatformName;
  query: Scalars['String'];
};


export type IQueryQueueArgs = {
  id: Scalars['ID'];
};


export type IQueryNowPlayingArgs = {
  id: Scalars['ID'];
};


export type IQueryNowPlayingReactionsArgs = {
  id: Scalars['ID'];
};

export type IMutation = {
  _empty?: Maybe<Scalars['String']>;
  me?: Maybe<IUser>;
  deleteMe: Scalars['Boolean'];
  deleteMeOauth: Scalars['Boolean'];
  createRoom: IRoom;
  updateRoom: IRoom;
  updateRoomMembership: Scalars['Boolean'];
  deleteRoom: Scalars['ID'];
  addMessage: Scalars['Boolean'];
  updateQueue: Scalars['Boolean'];
  reactNowPlaying?: Maybe<Scalars['Boolean']>;
  skipNowPlaying?: Maybe<Scalars['Boolean']>;
};


export type IMutationMeArgs = {
  name?: Maybe<Scalars['String']>;
  username?: Maybe<Scalars['String']>;
  bio?: Maybe<Scalars['String']>;
  profilePicture?: Maybe<Scalars['Upload']>;
};


export type IMutationDeleteMeOauthArgs = {
  provider: IOAuthProviderName;
};


export type IMutationCreateRoomArgs = {
  title: Scalars['String'];
  description?: Maybe<Scalars['String']>;
  isPublic: Scalars['Boolean'];
  anyoneCanAdd?: Maybe<Scalars['Boolean']>;
  password?: Maybe<Scalars['String']>;
};


export type IMutationUpdateRoomArgs = {
  id: Scalars['ID'];
  title?: Maybe<Scalars['String']>;
  description?: Maybe<Scalars['String']>;
  image?: Maybe<Scalars['Upload']>;
  anyoneCanAdd?: Maybe<Scalars['Boolean']>;
  password?: Maybe<Scalars['String']>;
};


export type IMutationUpdateRoomMembershipArgs = {
  id: Scalars['ID'];
  username?: Maybe<Scalars['String']>;
  userId?: Maybe<Scalars['String']>;
  role?: Maybe<IRoomMembership>;
};


export type IMutationDeleteRoomArgs = {
  id: Scalars['ID'];
};


export type IMutationAddMessageArgs = {
  roomId: Scalars['ID'];
  message: Scalars['String'];
};


export type IMutationUpdateQueueArgs = {
  id: Scalars['ID'];
  action: IQueueAction;
  tracks?: Maybe<Array<Scalars['ID']>>;
  position?: Maybe<Scalars['Int']>;
  insertPosition?: Maybe<Scalars['Int']>;
};


export type IMutationReactNowPlayingArgs = {
  id: Scalars['ID'];
  reaction: INowPlayingReactionType;
};


export type IMutationSkipNowPlayingArgs = {
  id: Scalars['ID'];
};

export type ISubscription = {
  _empty?: Maybe<Scalars['String']>;
  roomStateUpdated?: Maybe<IRoomState>;
  messageAdded: IMessage;
  queueUpdated: IQueue;
  nowPlayingUpdated?: Maybe<INowPlaying>;
  nowPlayingReactionsUpdated?: Maybe<INowPlayingReaction>;
};


export type ISubscriptionRoomStateUpdatedArgs = {
  id: Scalars['ID'];
};


export type ISubscriptionMessageAddedArgs = {
  roomId: Scalars['ID'];
};


export type ISubscriptionQueueUpdatedArgs = {
  id: Scalars['ID'];
};


export type ISubscriptionNowPlayingUpdatedArgs = {
  id: Scalars['ID'];
};


export type ISubscriptionNowPlayingReactionsUpdatedArgs = {
  id: Scalars['ID'];
};



export enum IOAuthProviderName {
  Youtube = 'youtube',
  Twitter = 'twitter',
  Facebook = 'facebook',
  Spotify = 'spotify'
}

export type IUser = {
  id: Scalars['ID'];
  username: Scalars['String'];
  bio?: Maybe<Scalars['String']>;
  profilePicture: Scalars['String'];
};

export type IUserAuthWrapper = {
  youtube?: Maybe<IUserOauthProvider>;
  twitter?: Maybe<IUserOauthProvider>;
  facebook?: Maybe<IUserOauthProvider>;
  spotify?: Maybe<IUserOauthProvider>;
};

export type IUserOauthProvider = {
  provider: IOAuthProviderName;
  id: Scalars['ID'];
};

export enum IRoomMembership {
  Host = 'host',
  Collab = 'collab'
}

export type IRoom = {
  id: Scalars['ID'];
  title: Scalars['String'];
  isPublic: Scalars['Boolean'];
  description?: Maybe<Scalars['String']>;
  image: Scalars['String'];
  creator: IUser;
  createdAt: Scalars['DateTime'];
};

export type IRoomState = {
  id: Scalars['ID'];
  userIds: Array<Scalars['String']>;
  /** Settings */
  anyoneCanAdd: Scalars['Boolean'];
  collabs: Array<Scalars['String']>;
};

export enum IPlatformName {
  Youtube = 'youtube',
  Spotify = 'spotify'
}

export type ITrack = {
  id: Scalars['ID'];
  platform: IPlatformName;
  externalId: Scalars['ID'];
  artists: Array<IArtist>;
  duration: Scalars['Int'];
  title: Scalars['String'];
  image: Scalars['String'];
  url: Scalars['String'];
};

export type ICrossTracks = {
  originalId: Scalars['ID'];
  youtube?: Maybe<ITrack>;
  spotify?: Maybe<ITrack>;
};

export type IArtist = {
  id: Scalars['ID'];
  platform: IPlatformName;
  externalId: Scalars['ID'];
  name: Scalars['String'];
  image: Scalars['String'];
  url: Scalars['String'];
};

export type IMessage = {
  id: Scalars['ID'];
  createdAt: Scalars['DateTime'];
  message: Scalars['String'];
  from: IMessageParticipant;
};

export type IMessageParticipant = {
  type: Scalars['String'];
  id: Scalars['ID'];
  name: Scalars['String'];
  photo: Scalars['String'];
  uri: Scalars['String'];
};

export enum IQueueAction {
  Remove = 'remove',
  Reorder = 'reorder',
  Add = 'add',
  Clear = 'clear'
}

export type IQueueItem = {
  id: Scalars['ID'];
  trackId: Scalars['String'];
  creatorId: Scalars['String'];
};

export type IQueue = {
  id: Scalars['ID'];
  items: Array<IQueueItem>;
};

export enum INowPlayingReactionType {
  Heart = 'heart',
  Joy = 'joy',
  Fire = 'fire',
  Cry = 'cry'
}

export type INowPlayingQueueItem = {
  id: Scalars['ID'];
  trackId: Scalars['ID'];
  playedAt: Scalars['DateTime'];
  endedAt: Scalars['DateTime'];
  creatorId: Scalars['ID'];
};

export type INowPlaying = {
  id: Scalars['ID'];
  currentTrack?: Maybe<INowPlayingQueueItem>;
};

export type INowPlayingReaction = {
  id: Scalars['ID'];
  mine?: Maybe<INowPlayingReactionType>;
  heart: Scalars['Int'];
  cry: Scalars['Int'];
  joy: Scalars['Int'];
  fire: Scalars['Int'];
};



export type ResolverTypeWrapper<T> = Promise<T> | T;

export type Resolver<TResult, TParent = {}, TContext = {}, TArgs = {}> = ResolverFn<TResult, TParent, TContext, TArgs>;

export type ResolverFn<TResult, TParent, TContext, TArgs> = (
  parent: TParent,
  args: TArgs,
  context: TContext,
  info: GraphQLResolveInfo
) => Promise<TResult> | TResult;

export type SubscriptionSubscribeFn<TResult, TParent, TContext, TArgs> = (
  parent: TParent,
  args: TArgs,
  context: TContext,
  info: GraphQLResolveInfo
) => AsyncIterator<TResult> | Promise<AsyncIterator<TResult>>;

export type SubscriptionResolveFn<TResult, TParent, TContext, TArgs> = (
  parent: TParent,
  args: TArgs,
  context: TContext,
  info: GraphQLResolveInfo
) => TResult | Promise<TResult>;

export interface SubscriptionSubscriberObject<TResult, TKey extends string, TParent, TContext, TArgs> {
  subscribe: SubscriptionSubscribeFn<{ [key in TKey]: TResult }, TParent, TContext, TArgs>;
  resolve?: SubscriptionResolveFn<TResult, { [key in TKey]: TResult }, TContext, TArgs>;
}

export interface SubscriptionResolverObject<TResult, TParent, TContext, TArgs> {
  subscribe: SubscriptionSubscribeFn<any, TParent, TContext, TArgs>;
  resolve: SubscriptionResolveFn<TResult, any, TContext, TArgs>;
}

export type SubscriptionObject<TResult, TKey extends string, TParent, TContext, TArgs> =
  | SubscriptionSubscriberObject<TResult, TKey, TParent, TContext, TArgs>
  | SubscriptionResolverObject<TResult, TParent, TContext, TArgs>;

export type SubscriptionResolver<TResult, TKey extends string, TParent = {}, TContext = {}, TArgs = {}> =
  | ((...args: any[]) => SubscriptionObject<TResult, TKey, TParent, TContext, TArgs>)
  | SubscriptionObject<TResult, TKey, TParent, TContext, TArgs>;

export type TypeResolveFn<TTypes, TParent = {}, TContext = {}> = (
  parent: TParent,
  context: TContext,
  info: GraphQLResolveInfo
) => Maybe<TTypes> | Promise<Maybe<TTypes>>;

export type IsTypeOfResolverFn<T = {}> = (obj: T, info: GraphQLResolveInfo) => boolean | Promise<boolean>;

export type NextResolverFn<T> = () => Promise<T>;

export type DirectiveResolverFn<TResult = {}, TParent = {}, TContext = {}, TArgs = {}> = (
  next: NextResolverFn<TResult>,
  parent: TParent,
  args: TArgs,
  context: TContext,
  info: GraphQLResolveInfo
) => TResult | Promise<TResult>;

/** Mapping between all available schema types and the resolvers types */
export type IResolversTypes = {
  Query: ResolverTypeWrapper<{}>;
  String: ResolverTypeWrapper<Scalars['String']>;
  ID: ResolverTypeWrapper<Scalars['ID']>;
  Int: ResolverTypeWrapper<Scalars['Int']>;
  Mutation: ResolverTypeWrapper<{}>;
  Boolean: ResolverTypeWrapper<Scalars['Boolean']>;
  Subscription: ResolverTypeWrapper<{}>;
  DateTime: ResolverTypeWrapper<Scalars['DateTime']>;
  Upload: ResolverTypeWrapper<Scalars['Upload']>;
  OAuthProviderName: IOAuthProviderName;
  User: ResolverTypeWrapper<UserDbObject>;
  UserAuthWrapper: ResolverTypeWrapper<IUserAuthWrapper>;
  UserOauthProvider: ResolverTypeWrapper<IUserOauthProvider>;
  RoomMembership: IRoomMembership;
  Room: ResolverTypeWrapper<RoomDbObject>;
  RoomState: ResolverTypeWrapper<IRoomState>;
  PlatformName: IPlatformName;
  Track: ResolverTypeWrapper<TrackDbObject>;
  CrossTracks: ResolverTypeWrapper<Omit<ICrossTracks, 'youtube' | 'spotify'> & { youtube?: Maybe<IResolversTypes['Track']>, spotify?: Maybe<IResolversTypes['Track']> }>;
  Artist: ResolverTypeWrapper<ArtistDbObject>;
  Message: ResolverTypeWrapper<IMessage>;
  MessageParticipant: ResolverTypeWrapper<IMessageParticipant>;
  QueueAction: IQueueAction;
  QueueItem: ResolverTypeWrapper<QueueItemDbObject>;
  Queue: ResolverTypeWrapper<Omit<IQueue, 'items'> & { items: Array<IResolversTypes['QueueItem']> }>;
  NowPlayingReactionType: INowPlayingReactionType;
  NowPlayingQueueItem: ResolverTypeWrapper<INowPlayingQueueItem>;
  NowPlaying: ResolverTypeWrapper<INowPlaying>;
  NowPlayingReaction: ResolverTypeWrapper<INowPlayingReaction>;
};

/** Mapping between all available schema types and the resolvers parents */
export type IResolversParentTypes = {
  Query: {};
  String: Scalars['String'];
  ID: Scalars['ID'];
  Int: Scalars['Int'];
  Mutation: {};
  Boolean: Scalars['Boolean'];
  Subscription: {};
  DateTime: Scalars['DateTime'];
  Upload: Scalars['Upload'];
  User: UserDbObject;
  UserAuthWrapper: IUserAuthWrapper;
  UserOauthProvider: IUserOauthProvider;
  Room: RoomDbObject;
  RoomState: IRoomState;
  Track: TrackDbObject;
  CrossTracks: Omit<ICrossTracks, 'youtube' | 'spotify'> & { youtube?: Maybe<IResolversParentTypes['Track']>, spotify?: Maybe<IResolversParentTypes['Track']> };
  Artist: ArtistDbObject;
  Message: IMessage;
  MessageParticipant: IMessageParticipant;
  QueueItem: QueueItemDbObject;
  Queue: Omit<IQueue, 'items'> & { items: Array<IResolversParentTypes['QueueItem']> };
  NowPlayingQueueItem: INowPlayingQueueItem;
  NowPlaying: INowPlaying;
  NowPlayingReaction: INowPlayingReaction;
};

export type IQueryResolvers<ContextType = MyGQLContext, ParentType extends IResolversParentTypes['Query'] = IResolversParentTypes['Query']> = {
  _empty?: Resolver<Maybe<IResolversTypes['String']>, ParentType, ContextType>;
  me?: Resolver<Maybe<IResolversTypes['User']>, ParentType, ContextType>;
  user?: Resolver<Maybe<IResolversTypes['User']>, ParentType, ContextType, RequireFields<IQueryUserArgs, never>>;
  meAuth?: Resolver<Maybe<IResolversTypes['UserAuthWrapper']>, ParentType, ContextType>;
  room?: Resolver<Maybe<IResolversTypes['Room']>, ParentType, ContextType, RequireFields<IQueryRoomArgs, 'id'>>;
  roomState?: Resolver<Maybe<IResolversTypes['RoomState']>, ParentType, ContextType, RequireFields<IQueryRoomStateArgs, 'id'>>;
  rooms?: Resolver<Maybe<Array<IResolversTypes['Room']>>, ParentType, ContextType, RequireFields<IQueryRoomsArgs, never>>;
  exploreRooms?: Resolver<Array<IResolversTypes['Room']>, ParentType, ContextType, RequireFields<IQueryExploreRoomsArgs, 'by'>>;
  searchRooms?: Resolver<Array<IResolversTypes['Room']>, ParentType, ContextType, RequireFields<IQuerySearchRoomsArgs, 'query'>>;
  track?: Resolver<Maybe<IResolversTypes['Track']>, ParentType, ContextType, RequireFields<IQueryTrackArgs, never>>;
  crossTracks?: Resolver<Maybe<IResolversTypes['CrossTracks']>, ParentType, ContextType, RequireFields<IQueryCrossTracksArgs, 'id'>>;
  searchTrack?: Resolver<Array<IResolversTypes['Track']>, ParentType, ContextType, RequireFields<IQuerySearchTrackArgs, 'platform' | 'query'>>;
  queue?: Resolver<Maybe<IResolversTypes['Queue']>, ParentType, ContextType, RequireFields<IQueryQueueArgs, 'id'>>;
  nowPlaying?: Resolver<Maybe<IResolversTypes['NowPlaying']>, ParentType, ContextType, RequireFields<IQueryNowPlayingArgs, 'id'>>;
  nowPlayingReactions?: Resolver<Maybe<IResolversTypes['NowPlayingReaction']>, ParentType, ContextType, RequireFields<IQueryNowPlayingReactionsArgs, 'id'>>;
};

export type IMutationResolvers<ContextType = MyGQLContext, ParentType extends IResolversParentTypes['Mutation'] = IResolversParentTypes['Mutation']> = {
  _empty?: Resolver<Maybe<IResolversTypes['String']>, ParentType, ContextType>;
  me?: Resolver<Maybe<IResolversTypes['User']>, ParentType, ContextType, RequireFields<IMutationMeArgs, never>>;
  deleteMe?: Resolver<IResolversTypes['Boolean'], ParentType, ContextType>;
  deleteMeOauth?: Resolver<IResolversTypes['Boolean'], ParentType, ContextType, RequireFields<IMutationDeleteMeOauthArgs, 'provider'>>;
  createRoom?: Resolver<IResolversTypes['Room'], ParentType, ContextType, RequireFields<IMutationCreateRoomArgs, 'title' | 'isPublic'>>;
  updateRoom?: Resolver<IResolversTypes['Room'], ParentType, ContextType, RequireFields<IMutationUpdateRoomArgs, 'id'>>;
  updateRoomMembership?: Resolver<IResolversTypes['Boolean'], ParentType, ContextType, RequireFields<IMutationUpdateRoomMembershipArgs, 'id'>>;
  deleteRoom?: Resolver<IResolversTypes['ID'], ParentType, ContextType, RequireFields<IMutationDeleteRoomArgs, 'id'>>;
  addMessage?: Resolver<IResolversTypes['Boolean'], ParentType, ContextType, RequireFields<IMutationAddMessageArgs, 'roomId' | 'message'>>;
  updateQueue?: Resolver<IResolversTypes['Boolean'], ParentType, ContextType, RequireFields<IMutationUpdateQueueArgs, 'id' | 'action'>>;
  reactNowPlaying?: Resolver<Maybe<IResolversTypes['Boolean']>, ParentType, ContextType, RequireFields<IMutationReactNowPlayingArgs, 'id' | 'reaction'>>;
  skipNowPlaying?: Resolver<Maybe<IResolversTypes['Boolean']>, ParentType, ContextType, RequireFields<IMutationSkipNowPlayingArgs, 'id'>>;
};

export type ISubscriptionResolvers<ContextType = MyGQLContext, ParentType extends IResolversParentTypes['Subscription'] = IResolversParentTypes['Subscription']> = {
  _empty?: SubscriptionResolver<Maybe<IResolversTypes['String']>, "_empty", ParentType, ContextType>;
  roomStateUpdated?: SubscriptionResolver<Maybe<IResolversTypes['RoomState']>, "roomStateUpdated", ParentType, ContextType, RequireFields<ISubscriptionRoomStateUpdatedArgs, 'id'>>;
  messageAdded?: SubscriptionResolver<IResolversTypes['Message'], "messageAdded", ParentType, ContextType, RequireFields<ISubscriptionMessageAddedArgs, 'roomId'>>;
  queueUpdated?: SubscriptionResolver<IResolversTypes['Queue'], "queueUpdated", ParentType, ContextType, RequireFields<ISubscriptionQueueUpdatedArgs, 'id'>>;
  nowPlayingUpdated?: SubscriptionResolver<Maybe<IResolversTypes['NowPlaying']>, "nowPlayingUpdated", ParentType, ContextType, RequireFields<ISubscriptionNowPlayingUpdatedArgs, 'id'>>;
  nowPlayingReactionsUpdated?: SubscriptionResolver<Maybe<IResolversTypes['NowPlayingReaction']>, "nowPlayingReactionsUpdated", ParentType, ContextType, RequireFields<ISubscriptionNowPlayingReactionsUpdatedArgs, 'id'>>;
};

export interface IDateTimeScalarConfig extends GraphQLScalarTypeConfig<IResolversTypes['DateTime'], any> {
  name: 'DateTime';
}

export interface IUploadScalarConfig extends GraphQLScalarTypeConfig<IResolversTypes['Upload'], any> {
  name: 'Upload';
}

export type IUserResolvers<ContextType = MyGQLContext, ParentType extends IResolversParentTypes['User'] = IResolversParentTypes['User']> = {
  id?: Resolver<IResolversTypes['ID'], ParentType, ContextType>;
  username?: Resolver<IResolversTypes['String'], ParentType, ContextType>;
  bio?: Resolver<Maybe<IResolversTypes['String']>, ParentType, ContextType>;
  profilePicture?: Resolver<IResolversTypes['String'], ParentType, ContextType>;
  __isTypeOf?: IsTypeOfResolverFn<ParentType>;
};

export type IUserAuthWrapperResolvers<ContextType = MyGQLContext, ParentType extends IResolversParentTypes['UserAuthWrapper'] = IResolversParentTypes['UserAuthWrapper']> = {
  youtube?: Resolver<Maybe<IResolversTypes['UserOauthProvider']>, ParentType, ContextType>;
  twitter?: Resolver<Maybe<IResolversTypes['UserOauthProvider']>, ParentType, ContextType>;
  facebook?: Resolver<Maybe<IResolversTypes['UserOauthProvider']>, ParentType, ContextType>;
  spotify?: Resolver<Maybe<IResolversTypes['UserOauthProvider']>, ParentType, ContextType>;
  __isTypeOf?: IsTypeOfResolverFn<ParentType>;
};

export type IUserOauthProviderResolvers<ContextType = MyGQLContext, ParentType extends IResolversParentTypes['UserOauthProvider'] = IResolversParentTypes['UserOauthProvider']> = {
  provider?: Resolver<IResolversTypes['OAuthProviderName'], ParentType, ContextType>;
  id?: Resolver<IResolversTypes['ID'], ParentType, ContextType>;
  __isTypeOf?: IsTypeOfResolverFn<ParentType>;
};

export type IRoomResolvers<ContextType = MyGQLContext, ParentType extends IResolversParentTypes['Room'] = IResolversParentTypes['Room']> = {
  id?: Resolver<IResolversTypes['ID'], ParentType, ContextType>;
  title?: Resolver<IResolversTypes['String'], ParentType, ContextType>;
  isPublic?: Resolver<IResolversTypes['Boolean'], ParentType, ContextType>;
  description?: Resolver<Maybe<IResolversTypes['String']>, ParentType, ContextType>;
  image?: Resolver<IResolversTypes['String'], ParentType, ContextType>;
  creator?: Resolver<IResolversTypes['User'], ParentType, ContextType>;
  createdAt?: Resolver<IResolversTypes['DateTime'], ParentType, ContextType>;
  __isTypeOf?: IsTypeOfResolverFn<ParentType>;
};

export type IRoomStateResolvers<ContextType = MyGQLContext, ParentType extends IResolversParentTypes['RoomState'] = IResolversParentTypes['RoomState']> = {
  id?: Resolver<IResolversTypes['ID'], ParentType, ContextType>;
  userIds?: Resolver<Array<IResolversTypes['String']>, ParentType, ContextType>;
  anyoneCanAdd?: Resolver<IResolversTypes['Boolean'], ParentType, ContextType>;
  collabs?: Resolver<Array<IResolversTypes['String']>, ParentType, ContextType>;
  __isTypeOf?: IsTypeOfResolverFn<ParentType>;
};

export type ITrackResolvers<ContextType = MyGQLContext, ParentType extends IResolversParentTypes['Track'] = IResolversParentTypes['Track']> = {
  id?: Resolver<IResolversTypes['ID'], ParentType, ContextType>;
  platform?: Resolver<IResolversTypes['PlatformName'], ParentType, ContextType>;
  externalId?: Resolver<IResolversTypes['ID'], ParentType, ContextType>;
  artists?: Resolver<Array<IResolversTypes['Artist']>, ParentType, ContextType>;
  duration?: Resolver<IResolversTypes['Int'], ParentType, ContextType>;
  title?: Resolver<IResolversTypes['String'], ParentType, ContextType>;
  image?: Resolver<IResolversTypes['String'], ParentType, ContextType>;
  url?: Resolver<IResolversTypes['String'], ParentType, ContextType>;
  __isTypeOf?: IsTypeOfResolverFn<ParentType>;
};

export type ICrossTracksResolvers<ContextType = MyGQLContext, ParentType extends IResolversParentTypes['CrossTracks'] = IResolversParentTypes['CrossTracks']> = {
  originalId?: Resolver<IResolversTypes['ID'], ParentType, ContextType>;
  youtube?: Resolver<Maybe<IResolversTypes['Track']>, ParentType, ContextType>;
  spotify?: Resolver<Maybe<IResolversTypes['Track']>, ParentType, ContextType>;
  __isTypeOf?: IsTypeOfResolverFn<ParentType>;
};

export type IArtistResolvers<ContextType = MyGQLContext, ParentType extends IResolversParentTypes['Artist'] = IResolversParentTypes['Artist']> = {
  id?: Resolver<IResolversTypes['ID'], ParentType, ContextType>;
  platform?: Resolver<IResolversTypes['PlatformName'], ParentType, ContextType>;
  externalId?: Resolver<IResolversTypes['ID'], ParentType, ContextType>;
  name?: Resolver<IResolversTypes['String'], ParentType, ContextType>;
  image?: Resolver<IResolversTypes['String'], ParentType, ContextType>;
  url?: Resolver<IResolversTypes['String'], ParentType, ContextType>;
  __isTypeOf?: IsTypeOfResolverFn<ParentType>;
};

export type IMessageResolvers<ContextType = MyGQLContext, ParentType extends IResolversParentTypes['Message'] = IResolversParentTypes['Message']> = {
  id?: Resolver<IResolversTypes['ID'], ParentType, ContextType>;
  createdAt?: Resolver<IResolversTypes['DateTime'], ParentType, ContextType>;
  message?: Resolver<IResolversTypes['String'], ParentType, ContextType>;
  from?: Resolver<IResolversTypes['MessageParticipant'], ParentType, ContextType>;
  __isTypeOf?: IsTypeOfResolverFn<ParentType>;
};

export type IMessageParticipantResolvers<ContextType = MyGQLContext, ParentType extends IResolversParentTypes['MessageParticipant'] = IResolversParentTypes['MessageParticipant']> = {
  type?: Resolver<IResolversTypes['String'], ParentType, ContextType>;
  id?: Resolver<IResolversTypes['ID'], ParentType, ContextType>;
  name?: Resolver<IResolversTypes['String'], ParentType, ContextType>;
  photo?: Resolver<IResolversTypes['String'], ParentType, ContextType>;
  uri?: Resolver<IResolversTypes['String'], ParentType, ContextType>;
  __isTypeOf?: IsTypeOfResolverFn<ParentType>;
};

export type IQueueItemResolvers<ContextType = MyGQLContext, ParentType extends IResolversParentTypes['QueueItem'] = IResolversParentTypes['QueueItem']> = {
  id?: Resolver<IResolversTypes['ID'], ParentType, ContextType>;
  trackId?: Resolver<IResolversTypes['String'], ParentType, ContextType>;
  creatorId?: Resolver<IResolversTypes['String'], ParentType, ContextType>;
  __isTypeOf?: IsTypeOfResolverFn<ParentType>;
};

export type IQueueResolvers<ContextType = MyGQLContext, ParentType extends IResolversParentTypes['Queue'] = IResolversParentTypes['Queue']> = {
  id?: Resolver<IResolversTypes['ID'], ParentType, ContextType>;
  items?: Resolver<Array<IResolversTypes['QueueItem']>, ParentType, ContextType>;
  __isTypeOf?: IsTypeOfResolverFn<ParentType>;
};

export type INowPlayingQueueItemResolvers<ContextType = MyGQLContext, ParentType extends IResolversParentTypes['NowPlayingQueueItem'] = IResolversParentTypes['NowPlayingQueueItem']> = {
  id?: Resolver<IResolversTypes['ID'], ParentType, ContextType>;
  trackId?: Resolver<IResolversTypes['ID'], ParentType, ContextType>;
  playedAt?: Resolver<IResolversTypes['DateTime'], ParentType, ContextType>;
  endedAt?: Resolver<IResolversTypes['DateTime'], ParentType, ContextType>;
  creatorId?: Resolver<IResolversTypes['ID'], ParentType, ContextType>;
  __isTypeOf?: IsTypeOfResolverFn<ParentType>;
};

export type INowPlayingResolvers<ContextType = MyGQLContext, ParentType extends IResolversParentTypes['NowPlaying'] = IResolversParentTypes['NowPlaying']> = {
  id?: Resolver<IResolversTypes['ID'], ParentType, ContextType>;
  currentTrack?: Resolver<Maybe<IResolversTypes['NowPlayingQueueItem']>, ParentType, ContextType>;
  __isTypeOf?: IsTypeOfResolverFn<ParentType>;
};

export type INowPlayingReactionResolvers<ContextType = MyGQLContext, ParentType extends IResolversParentTypes['NowPlayingReaction'] = IResolversParentTypes['NowPlayingReaction']> = {
  id?: Resolver<IResolversTypes['ID'], ParentType, ContextType>;
  mine?: Resolver<Maybe<IResolversTypes['NowPlayingReactionType']>, ParentType, ContextType>;
  heart?: Resolver<IResolversTypes['Int'], ParentType, ContextType>;
  cry?: Resolver<IResolversTypes['Int'], ParentType, ContextType>;
  joy?: Resolver<IResolversTypes['Int'], ParentType, ContextType>;
  fire?: Resolver<IResolversTypes['Int'], ParentType, ContextType>;
  __isTypeOf?: IsTypeOfResolverFn<ParentType>;
};

export type IResolvers<ContextType = MyGQLContext> = {
  Query?: IQueryResolvers<ContextType>;
  Mutation?: IMutationResolvers<ContextType>;
  Subscription?: ISubscriptionResolvers<ContextType>;
  DateTime?: GraphQLScalarType;
  Upload?: GraphQLScalarType;
  User?: IUserResolvers<ContextType>;
  UserAuthWrapper?: IUserAuthWrapperResolvers<ContextType>;
  UserOauthProvider?: IUserOauthProviderResolvers<ContextType>;
  Room?: IRoomResolvers<ContextType>;
  RoomState?: IRoomStateResolvers<ContextType>;
  Track?: ITrackResolvers<ContextType>;
  CrossTracks?: ICrossTracksResolvers<ContextType>;
  Artist?: IArtistResolvers<ContextType>;
  Message?: IMessageResolvers<ContextType>;
  MessageParticipant?: IMessageParticipantResolvers<ContextType>;
  QueueItem?: IQueueItemResolvers<ContextType>;
  Queue?: IQueueResolvers<ContextType>;
  NowPlayingQueueItem?: INowPlayingQueueItemResolvers<ContextType>;
  NowPlaying?: INowPlayingResolvers<ContextType>;
  NowPlayingReaction?: INowPlayingReactionResolvers<ContextType>;
};


