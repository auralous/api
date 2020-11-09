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



export type Query = {
  me?: Maybe<User>;
  user?: Maybe<User>;
  meAuth?: Maybe<UserAuthWrapper>;
  room?: Maybe<Room>;
  roomState?: Maybe<RoomState>;
  rooms?: Maybe<Array<Room>>;
  exploreRooms: Array<Room>;
  searchRooms: Array<Room>;
  track?: Maybe<Track>;
  crossTracks?: Maybe<CrossTracks>;
  searchTrack: Array<Track>;
  queue?: Maybe<Queue>;
  nowPlaying?: Maybe<NowPlaying>;
  nowPlayingReactions?: Maybe<NowPlayingReaction>;
};


export type QueryUserArgs = {
  username?: Maybe<Scalars['String']>;
  id?: Maybe<Scalars['ID']>;
};


export type QueryRoomArgs = {
  id: Scalars['ID'];
};


export type QueryRoomStateArgs = {
  id: Scalars['ID'];
};


export type QueryRoomsArgs = {
  creatorId?: Maybe<Scalars['String']>;
};


export type QueryExploreRoomsArgs = {
  by: Scalars['String'];
};


export type QuerySearchRoomsArgs = {
  query: Scalars['String'];
  limit?: Maybe<Scalars['Int']>;
};


export type QueryTrackArgs = {
  id: Scalars['ID'];
};


export type QueryCrossTracksArgs = {
  id: Scalars['ID'];
};


export type QuerySearchTrackArgs = {
  platform: PlatformName;
  query: Scalars['String'];
};


export type QueryQueueArgs = {
  id: Scalars['ID'];
};


export type QueryNowPlayingArgs = {
  id: Scalars['ID'];
};


export type QueryNowPlayingReactionsArgs = {
  id: Scalars['ID'];
};

export type Mutation = {
  me?: Maybe<User>;
  deleteMe: Scalars['Boolean'];
  deleteMeOauth: Scalars['Boolean'];
  createRoom: Room;
  updateRoom: Room;
  joinPrivateRoom: Scalars['Boolean'];
  updateRoomMembership: Scalars['Boolean'];
  deleteRoom: Scalars['ID'];
  addMessage: Scalars['Boolean'];
  updateQueue: Scalars['Boolean'];
  reactNowPlaying?: Maybe<Scalars['Boolean']>;
  skipNowPlaying?: Maybe<Scalars['Boolean']>;
};


export type MutationMeArgs = {
  name?: Maybe<Scalars['String']>;
  username?: Maybe<Scalars['String']>;
  bio?: Maybe<Scalars['String']>;
  profilePicture?: Maybe<Scalars['Upload']>;
};


export type MutationDeleteMeOauthArgs = {
  provider: AuthProviderName;
};


export type MutationCreateRoomArgs = {
  title: Scalars['String'];
  description?: Maybe<Scalars['String']>;
  isPublic: Scalars['Boolean'];
  anyoneCanAdd?: Maybe<Scalars['Boolean']>;
  password?: Maybe<Scalars['String']>;
};


export type MutationUpdateRoomArgs = {
  id: Scalars['ID'];
  title?: Maybe<Scalars['String']>;
  description?: Maybe<Scalars['String']>;
  image?: Maybe<Scalars['Upload']>;
  anyoneCanAdd?: Maybe<Scalars['Boolean']>;
  password?: Maybe<Scalars['String']>;
};


export type MutationJoinPrivateRoomArgs = {
  id: Scalars['ID'];
  password: Scalars['String'];
};


export type MutationUpdateRoomMembershipArgs = {
  id: Scalars['ID'];
  username?: Maybe<Scalars['String']>;
  userId?: Maybe<Scalars['String']>;
  role?: Maybe<RoomMembership>;
};


export type MutationDeleteRoomArgs = {
  id: Scalars['ID'];
};


export type MutationAddMessageArgs = {
  roomId: Scalars['ID'];
  message: Scalars['String'];
};


export type MutationUpdateQueueArgs = {
  id: Scalars['ID'];
  action: QueueAction;
  tracks?: Maybe<Array<Scalars['ID']>>;
  position?: Maybe<Scalars['Int']>;
  insertPosition?: Maybe<Scalars['Int']>;
};


export type MutationReactNowPlayingArgs = {
  id: Scalars['ID'];
  reaction: NowPlayingReactionType;
};


export type MutationSkipNowPlayingArgs = {
  id: Scalars['ID'];
};

export enum AuthProviderName {
  Youtube = 'youtube',
  Twitter = 'twitter',
  Facebook = 'facebook',
  Spotify = 'spotify'
}

export type User = {
  id: Scalars['ID'];
  username: Scalars['String'];
  bio?: Maybe<Scalars['String']>;
  profilePicture: Scalars['String'];
};

export type UserAuthWrapper = {
  youtube?: Maybe<UserOauthProvider>;
  twitter?: Maybe<UserOauthProvider>;
  facebook?: Maybe<UserOauthProvider>;
  spotify?: Maybe<UserOauthProvider>;
};

export type UserOauthProvider = {
  provider: AuthProviderName;
  id: Scalars['ID'];
};

export enum RoomMembership {
  Host = 'host',
  Collab = 'collab'
}

export type Subscription = {
  roomStateUpdated?: Maybe<RoomState>;
  messageAdded: Message;
  queueUpdated: Queue;
  nowPlayingUpdated?: Maybe<NowPlaying>;
  nowPlayingReactionsUpdated?: Maybe<NowPlayingReaction>;
};


export type SubscriptionRoomStateUpdatedArgs = {
  id: Scalars['ID'];
};


export type SubscriptionMessageAddedArgs = {
  roomId: Scalars['ID'];
};


export type SubscriptionQueueUpdatedArgs = {
  id: Scalars['ID'];
};


export type SubscriptionNowPlayingUpdatedArgs = {
  id: Scalars['ID'];
};


export type SubscriptionNowPlayingReactionsUpdatedArgs = {
  id: Scalars['ID'];
};

export type Room = {
  id: Scalars['ID'];
  title: Scalars['String'];
  isPublic: Scalars['Boolean'];
  description?: Maybe<Scalars['String']>;
  image: Scalars['String'];
  creatorId: Scalars['ID'];
  createdAt: Scalars['DateTime'];
};

export type RoomState = {
  id: Scalars['ID'];
  userIds: Array<Scalars['String']>;
  /** Settings */
  anyoneCanAdd: Scalars['Boolean'];
  collabs: Array<Scalars['String']>;
};

export enum PlatformName {
  Youtube = 'youtube',
  Spotify = 'spotify'
}

export type Track = {
  id: Scalars['ID'];
  platform: PlatformName;
  externalId: Scalars['ID'];
  artists: Array<Artist>;
  duration: Scalars['Int'];
  title: Scalars['String'];
  image: Scalars['String'];
  url: Scalars['String'];
};

export type CrossTracks = {
  id: Scalars['ID'];
  youtube?: Maybe<Scalars['ID']>;
  spotify?: Maybe<Scalars['ID']>;
};

export type Artist = {
  id: Scalars['ID'];
  platform: PlatformName;
  externalId: Scalars['ID'];
  name: Scalars['String'];
  image: Scalars['String'];
  url: Scalars['String'];
};

export type Message = {
  id: Scalars['ID'];
  createdAt: Scalars['DateTime'];
  message: Scalars['String'];
  from: MessageParticipant;
};

export type MessageParticipant = {
  type: Scalars['String'];
  id: Scalars['ID'];
  name: Scalars['String'];
  photo: Scalars['String'];
  uri: Scalars['String'];
};

export enum QueueAction {
  Remove = 'remove',
  Reorder = 'reorder',
  Add = 'add',
  Clear = 'clear'
}

export type QueueItem = {
  id: Scalars['ID'];
  trackId: Scalars['String'];
  creatorId: Scalars['String'];
};

export type Queue = {
  id: Scalars['ID'];
  items: Array<QueueItem>;
};

export enum NowPlayingReactionType {
  Heart = 'heart',
  Joy = 'joy',
  Fire = 'fire',
  Cry = 'cry'
}

export type NowPlayingQueueItem = {
  id: Scalars['ID'];
  trackId: Scalars['ID'];
  playedAt: Scalars['DateTime'];
  endedAt: Scalars['DateTime'];
  creatorId: Scalars['ID'];
};

export type NowPlaying = {
  id: Scalars['ID'];
  currentTrack?: Maybe<NowPlayingQueueItem>;
};

export type NowPlayingReaction = {
  id: Scalars['ID'];
  mine?: Maybe<NowPlayingReactionType>;
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

export type IsTypeOfResolverFn<T = {}, TContext = {}> = (obj: T, context: TContext, info: GraphQLResolveInfo) => boolean | Promise<boolean>;

export type NextResolverFn<T> = () => Promise<T>;

export type DirectiveResolverFn<TResult = {}, TParent = {}, TContext = {}, TArgs = {}> = (
  next: NextResolverFn<TResult>,
  parent: TParent,
  args: TArgs,
  context: TContext,
  info: GraphQLResolveInfo
) => TResult | Promise<TResult>;

/** Mapping between all available schema types and the resolvers types */
export type ResolversTypes = {
  DateTime: ResolverTypeWrapper<Scalars['DateTime']>;
  Upload: ResolverTypeWrapper<Scalars['Upload']>;
  Query: ResolverTypeWrapper<{}>;
  String: ResolverTypeWrapper<Scalars['String']>;
  ID: ResolverTypeWrapper<Scalars['ID']>;
  Int: ResolverTypeWrapper<Scalars['Int']>;
  Mutation: ResolverTypeWrapper<{}>;
  Boolean: ResolverTypeWrapper<Scalars['Boolean']>;
  AuthProviderName: AuthProviderName;
  User: ResolverTypeWrapper<UserDbObject>;
  UserAuthWrapper: ResolverTypeWrapper<UserAuthWrapper>;
  UserOauthProvider: ResolverTypeWrapper<UserOauthProvider>;
  RoomMembership: RoomMembership;
  Subscription: ResolverTypeWrapper<{}>;
  Room: ResolverTypeWrapper<RoomDbObject>;
  RoomState: ResolverTypeWrapper<RoomState>;
  PlatformName: PlatformName;
  Track: ResolverTypeWrapper<TrackDbObject>;
  CrossTracks: ResolverTypeWrapper<CrossTracks>;
  Artist: ResolverTypeWrapper<ArtistDbObject>;
  Message: ResolverTypeWrapper<Message>;
  MessageParticipant: ResolverTypeWrapper<MessageParticipant>;
  QueueAction: QueueAction;
  QueueItem: ResolverTypeWrapper<QueueItemDbObject>;
  Queue: ResolverTypeWrapper<Omit<Queue, 'items'> & { items: Array<ResolversTypes['QueueItem']> }>;
  NowPlayingReactionType: NowPlayingReactionType;
  NowPlayingQueueItem: ResolverTypeWrapper<NowPlayingQueueItem>;
  NowPlaying: ResolverTypeWrapper<NowPlaying>;
  NowPlayingReaction: ResolverTypeWrapper<NowPlayingReaction>;
};

/** Mapping between all available schema types and the resolvers parents */
export type ResolversParentTypes = {
  DateTime: Scalars['DateTime'];
  Upload: Scalars['Upload'];
  Query: {};
  String: Scalars['String'];
  ID: Scalars['ID'];
  Int: Scalars['Int'];
  Mutation: {};
  Boolean: Scalars['Boolean'];
  User: UserDbObject;
  UserAuthWrapper: UserAuthWrapper;
  UserOauthProvider: UserOauthProvider;
  Subscription: {};
  Room: RoomDbObject;
  RoomState: RoomState;
  Track: TrackDbObject;
  CrossTracks: CrossTracks;
  Artist: ArtistDbObject;
  Message: Message;
  MessageParticipant: MessageParticipant;
  QueueItem: QueueItemDbObject;
  Queue: Omit<Queue, 'items'> & { items: Array<ResolversParentTypes['QueueItem']> };
  NowPlayingQueueItem: NowPlayingQueueItem;
  NowPlaying: NowPlaying;
  NowPlayingReaction: NowPlayingReaction;
};

export interface DateTimeScalarConfig extends GraphQLScalarTypeConfig<ResolversTypes['DateTime'], any> {
  name: 'DateTime';
}

export interface UploadScalarConfig extends GraphQLScalarTypeConfig<ResolversTypes['Upload'], any> {
  name: 'Upload';
}

export type QueryResolvers<ContextType = MyGQLContext, ParentType extends ResolversParentTypes['Query'] = ResolversParentTypes['Query']> = {
  me?: Resolver<Maybe<ResolversTypes['User']>, ParentType, ContextType>;
  user?: Resolver<Maybe<ResolversTypes['User']>, ParentType, ContextType, RequireFields<QueryUserArgs, never>>;
  meAuth?: Resolver<Maybe<ResolversTypes['UserAuthWrapper']>, ParentType, ContextType>;
  room?: Resolver<Maybe<ResolversTypes['Room']>, ParentType, ContextType, RequireFields<QueryRoomArgs, 'id'>>;
  roomState?: Resolver<Maybe<ResolversTypes['RoomState']>, ParentType, ContextType, RequireFields<QueryRoomStateArgs, 'id'>>;
  rooms?: Resolver<Maybe<Array<ResolversTypes['Room']>>, ParentType, ContextType, RequireFields<QueryRoomsArgs, never>>;
  exploreRooms?: Resolver<Array<ResolversTypes['Room']>, ParentType, ContextType, RequireFields<QueryExploreRoomsArgs, 'by'>>;
  searchRooms?: Resolver<Array<ResolversTypes['Room']>, ParentType, ContextType, RequireFields<QuerySearchRoomsArgs, 'query'>>;
  track?: Resolver<Maybe<ResolversTypes['Track']>, ParentType, ContextType, RequireFields<QueryTrackArgs, 'id'>>;
  crossTracks?: Resolver<Maybe<ResolversTypes['CrossTracks']>, ParentType, ContextType, RequireFields<QueryCrossTracksArgs, 'id'>>;
  searchTrack?: Resolver<Array<ResolversTypes['Track']>, ParentType, ContextType, RequireFields<QuerySearchTrackArgs, 'platform' | 'query'>>;
  queue?: Resolver<Maybe<ResolversTypes['Queue']>, ParentType, ContextType, RequireFields<QueryQueueArgs, 'id'>>;
  nowPlaying?: Resolver<Maybe<ResolversTypes['NowPlaying']>, ParentType, ContextType, RequireFields<QueryNowPlayingArgs, 'id'>>;
  nowPlayingReactions?: Resolver<Maybe<ResolversTypes['NowPlayingReaction']>, ParentType, ContextType, RequireFields<QueryNowPlayingReactionsArgs, 'id'>>;
};

export type MutationResolvers<ContextType = MyGQLContext, ParentType extends ResolversParentTypes['Mutation'] = ResolversParentTypes['Mutation']> = {
  me?: Resolver<Maybe<ResolversTypes['User']>, ParentType, ContextType, RequireFields<MutationMeArgs, never>>;
  deleteMe?: Resolver<ResolversTypes['Boolean'], ParentType, ContextType>;
  deleteMeOauth?: Resolver<ResolversTypes['Boolean'], ParentType, ContextType, RequireFields<MutationDeleteMeOauthArgs, 'provider'>>;
  createRoom?: Resolver<ResolversTypes['Room'], ParentType, ContextType, RequireFields<MutationCreateRoomArgs, 'title' | 'isPublic'>>;
  updateRoom?: Resolver<ResolversTypes['Room'], ParentType, ContextType, RequireFields<MutationUpdateRoomArgs, 'id'>>;
  joinPrivateRoom?: Resolver<ResolversTypes['Boolean'], ParentType, ContextType, RequireFields<MutationJoinPrivateRoomArgs, 'id' | 'password'>>;
  updateRoomMembership?: Resolver<ResolversTypes['Boolean'], ParentType, ContextType, RequireFields<MutationUpdateRoomMembershipArgs, 'id'>>;
  deleteRoom?: Resolver<ResolversTypes['ID'], ParentType, ContextType, RequireFields<MutationDeleteRoomArgs, 'id'>>;
  addMessage?: Resolver<ResolversTypes['Boolean'], ParentType, ContextType, RequireFields<MutationAddMessageArgs, 'roomId' | 'message'>>;
  updateQueue?: Resolver<ResolversTypes['Boolean'], ParentType, ContextType, RequireFields<MutationUpdateQueueArgs, 'id' | 'action'>>;
  reactNowPlaying?: Resolver<Maybe<ResolversTypes['Boolean']>, ParentType, ContextType, RequireFields<MutationReactNowPlayingArgs, 'id' | 'reaction'>>;
  skipNowPlaying?: Resolver<Maybe<ResolversTypes['Boolean']>, ParentType, ContextType, RequireFields<MutationSkipNowPlayingArgs, 'id'>>;
};

export type UserResolvers<ContextType = MyGQLContext, ParentType extends ResolversParentTypes['User'] = ResolversParentTypes['User']> = {
  id?: Resolver<ResolversTypes['ID'], ParentType, ContextType>;
  username?: Resolver<ResolversTypes['String'], ParentType, ContextType>;
  bio?: Resolver<Maybe<ResolversTypes['String']>, ParentType, ContextType>;
  profilePicture?: Resolver<ResolversTypes['String'], ParentType, ContextType>;
  __isTypeOf?: IsTypeOfResolverFn<ParentType, ContextType>;
};

export type UserAuthWrapperResolvers<ContextType = MyGQLContext, ParentType extends ResolversParentTypes['UserAuthWrapper'] = ResolversParentTypes['UserAuthWrapper']> = {
  youtube?: Resolver<Maybe<ResolversTypes['UserOauthProvider']>, ParentType, ContextType>;
  twitter?: Resolver<Maybe<ResolversTypes['UserOauthProvider']>, ParentType, ContextType>;
  facebook?: Resolver<Maybe<ResolversTypes['UserOauthProvider']>, ParentType, ContextType>;
  spotify?: Resolver<Maybe<ResolversTypes['UserOauthProvider']>, ParentType, ContextType>;
  __isTypeOf?: IsTypeOfResolverFn<ParentType, ContextType>;
};

export type UserOauthProviderResolvers<ContextType = MyGQLContext, ParentType extends ResolversParentTypes['UserOauthProvider'] = ResolversParentTypes['UserOauthProvider']> = {
  provider?: Resolver<ResolversTypes['AuthProviderName'], ParentType, ContextType>;
  id?: Resolver<ResolversTypes['ID'], ParentType, ContextType>;
  __isTypeOf?: IsTypeOfResolverFn<ParentType, ContextType>;
};

export type SubscriptionResolvers<ContextType = MyGQLContext, ParentType extends ResolversParentTypes['Subscription'] = ResolversParentTypes['Subscription']> = {
  roomStateUpdated?: SubscriptionResolver<Maybe<ResolversTypes['RoomState']>, "roomStateUpdated", ParentType, ContextType, RequireFields<SubscriptionRoomStateUpdatedArgs, 'id'>>;
  messageAdded?: SubscriptionResolver<ResolversTypes['Message'], "messageAdded", ParentType, ContextType, RequireFields<SubscriptionMessageAddedArgs, 'roomId'>>;
  queueUpdated?: SubscriptionResolver<ResolversTypes['Queue'], "queueUpdated", ParentType, ContextType, RequireFields<SubscriptionQueueUpdatedArgs, 'id'>>;
  nowPlayingUpdated?: SubscriptionResolver<Maybe<ResolversTypes['NowPlaying']>, "nowPlayingUpdated", ParentType, ContextType, RequireFields<SubscriptionNowPlayingUpdatedArgs, 'id'>>;
  nowPlayingReactionsUpdated?: SubscriptionResolver<Maybe<ResolversTypes['NowPlayingReaction']>, "nowPlayingReactionsUpdated", ParentType, ContextType, RequireFields<SubscriptionNowPlayingReactionsUpdatedArgs, 'id'>>;
};

export type RoomResolvers<ContextType = MyGQLContext, ParentType extends ResolversParentTypes['Room'] = ResolversParentTypes['Room']> = {
  id?: Resolver<ResolversTypes['ID'], ParentType, ContextType>;
  title?: Resolver<ResolversTypes['String'], ParentType, ContextType>;
  isPublic?: Resolver<ResolversTypes['Boolean'], ParentType, ContextType>;
  description?: Resolver<Maybe<ResolversTypes['String']>, ParentType, ContextType>;
  image?: Resolver<ResolversTypes['String'], ParentType, ContextType>;
  creatorId?: Resolver<ResolversTypes['ID'], ParentType, ContextType>;
  createdAt?: Resolver<ResolversTypes['DateTime'], ParentType, ContextType>;
  __isTypeOf?: IsTypeOfResolverFn<ParentType, ContextType>;
};

export type RoomStateResolvers<ContextType = MyGQLContext, ParentType extends ResolversParentTypes['RoomState'] = ResolversParentTypes['RoomState']> = {
  id?: Resolver<ResolversTypes['ID'], ParentType, ContextType>;
  userIds?: Resolver<Array<ResolversTypes['String']>, ParentType, ContextType>;
  anyoneCanAdd?: Resolver<ResolversTypes['Boolean'], ParentType, ContextType>;
  collabs?: Resolver<Array<ResolversTypes['String']>, ParentType, ContextType>;
  __isTypeOf?: IsTypeOfResolverFn<ParentType, ContextType>;
};

export type TrackResolvers<ContextType = MyGQLContext, ParentType extends ResolversParentTypes['Track'] = ResolversParentTypes['Track']> = {
  id?: Resolver<ResolversTypes['ID'], ParentType, ContextType>;
  platform?: Resolver<ResolversTypes['PlatformName'], ParentType, ContextType>;
  externalId?: Resolver<ResolversTypes['ID'], ParentType, ContextType>;
  artists?: Resolver<Array<ResolversTypes['Artist']>, ParentType, ContextType>;
  duration?: Resolver<ResolversTypes['Int'], ParentType, ContextType>;
  title?: Resolver<ResolversTypes['String'], ParentType, ContextType>;
  image?: Resolver<ResolversTypes['String'], ParentType, ContextType>;
  url?: Resolver<ResolversTypes['String'], ParentType, ContextType>;
  __isTypeOf?: IsTypeOfResolverFn<ParentType, ContextType>;
};

export type CrossTracksResolvers<ContextType = MyGQLContext, ParentType extends ResolversParentTypes['CrossTracks'] = ResolversParentTypes['CrossTracks']> = {
  id?: Resolver<ResolversTypes['ID'], ParentType, ContextType>;
  youtube?: Resolver<Maybe<ResolversTypes['ID']>, ParentType, ContextType>;
  spotify?: Resolver<Maybe<ResolversTypes['ID']>, ParentType, ContextType>;
  __isTypeOf?: IsTypeOfResolverFn<ParentType, ContextType>;
};

export type ArtistResolvers<ContextType = MyGQLContext, ParentType extends ResolversParentTypes['Artist'] = ResolversParentTypes['Artist']> = {
  id?: Resolver<ResolversTypes['ID'], ParentType, ContextType>;
  platform?: Resolver<ResolversTypes['PlatformName'], ParentType, ContextType>;
  externalId?: Resolver<ResolversTypes['ID'], ParentType, ContextType>;
  name?: Resolver<ResolversTypes['String'], ParentType, ContextType>;
  image?: Resolver<ResolversTypes['String'], ParentType, ContextType>;
  url?: Resolver<ResolversTypes['String'], ParentType, ContextType>;
  __isTypeOf?: IsTypeOfResolverFn<ParentType, ContextType>;
};

export type MessageResolvers<ContextType = MyGQLContext, ParentType extends ResolversParentTypes['Message'] = ResolversParentTypes['Message']> = {
  id?: Resolver<ResolversTypes['ID'], ParentType, ContextType>;
  createdAt?: Resolver<ResolversTypes['DateTime'], ParentType, ContextType>;
  message?: Resolver<ResolversTypes['String'], ParentType, ContextType>;
  from?: Resolver<ResolversTypes['MessageParticipant'], ParentType, ContextType>;
  __isTypeOf?: IsTypeOfResolverFn<ParentType, ContextType>;
};

export type MessageParticipantResolvers<ContextType = MyGQLContext, ParentType extends ResolversParentTypes['MessageParticipant'] = ResolversParentTypes['MessageParticipant']> = {
  type?: Resolver<ResolversTypes['String'], ParentType, ContextType>;
  id?: Resolver<ResolversTypes['ID'], ParentType, ContextType>;
  name?: Resolver<ResolversTypes['String'], ParentType, ContextType>;
  photo?: Resolver<ResolversTypes['String'], ParentType, ContextType>;
  uri?: Resolver<ResolversTypes['String'], ParentType, ContextType>;
  __isTypeOf?: IsTypeOfResolverFn<ParentType, ContextType>;
};

export type QueueItemResolvers<ContextType = MyGQLContext, ParentType extends ResolversParentTypes['QueueItem'] = ResolversParentTypes['QueueItem']> = {
  id?: Resolver<ResolversTypes['ID'], ParentType, ContextType>;
  trackId?: Resolver<ResolversTypes['String'], ParentType, ContextType>;
  creatorId?: Resolver<ResolversTypes['String'], ParentType, ContextType>;
  __isTypeOf?: IsTypeOfResolverFn<ParentType, ContextType>;
};

export type QueueResolvers<ContextType = MyGQLContext, ParentType extends ResolversParentTypes['Queue'] = ResolversParentTypes['Queue']> = {
  id?: Resolver<ResolversTypes['ID'], ParentType, ContextType>;
  items?: Resolver<Array<ResolversTypes['QueueItem']>, ParentType, ContextType>;
  __isTypeOf?: IsTypeOfResolverFn<ParentType, ContextType>;
};

export type NowPlayingQueueItemResolvers<ContextType = MyGQLContext, ParentType extends ResolversParentTypes['NowPlayingQueueItem'] = ResolversParentTypes['NowPlayingQueueItem']> = {
  id?: Resolver<ResolversTypes['ID'], ParentType, ContextType>;
  trackId?: Resolver<ResolversTypes['ID'], ParentType, ContextType>;
  playedAt?: Resolver<ResolversTypes['DateTime'], ParentType, ContextType>;
  endedAt?: Resolver<ResolversTypes['DateTime'], ParentType, ContextType>;
  creatorId?: Resolver<ResolversTypes['ID'], ParentType, ContextType>;
  __isTypeOf?: IsTypeOfResolverFn<ParentType, ContextType>;
};

export type NowPlayingResolvers<ContextType = MyGQLContext, ParentType extends ResolversParentTypes['NowPlaying'] = ResolversParentTypes['NowPlaying']> = {
  id?: Resolver<ResolversTypes['ID'], ParentType, ContextType>;
  currentTrack?: Resolver<Maybe<ResolversTypes['NowPlayingQueueItem']>, ParentType, ContextType>;
  __isTypeOf?: IsTypeOfResolverFn<ParentType, ContextType>;
};

export type NowPlayingReactionResolvers<ContextType = MyGQLContext, ParentType extends ResolversParentTypes['NowPlayingReaction'] = ResolversParentTypes['NowPlayingReaction']> = {
  id?: Resolver<ResolversTypes['ID'], ParentType, ContextType>;
  mine?: Resolver<Maybe<ResolversTypes['NowPlayingReactionType']>, ParentType, ContextType>;
  heart?: Resolver<ResolversTypes['Int'], ParentType, ContextType>;
  cry?: Resolver<ResolversTypes['Int'], ParentType, ContextType>;
  joy?: Resolver<ResolversTypes['Int'], ParentType, ContextType>;
  fire?: Resolver<ResolversTypes['Int'], ParentType, ContextType>;
  __isTypeOf?: IsTypeOfResolverFn<ParentType, ContextType>;
};

export type Resolvers<ContextType = MyGQLContext> = {
  DateTime?: GraphQLScalarType;
  Upload?: GraphQLScalarType;
  Query?: QueryResolvers<ContextType>;
  Mutation?: MutationResolvers<ContextType>;
  User?: UserResolvers<ContextType>;
  UserAuthWrapper?: UserAuthWrapperResolvers<ContextType>;
  UserOauthProvider?: UserOauthProviderResolvers<ContextType>;
  Subscription?: SubscriptionResolvers<ContextType>;
  Room?: RoomResolvers<ContextType>;
  RoomState?: RoomStateResolvers<ContextType>;
  Track?: TrackResolvers<ContextType>;
  CrossTracks?: CrossTracksResolvers<ContextType>;
  Artist?: ArtistResolvers<ContextType>;
  Message?: MessageResolvers<ContextType>;
  MessageParticipant?: MessageParticipantResolvers<ContextType>;
  QueueItem?: QueueItemResolvers<ContextType>;
  Queue?: QueueResolvers<ContextType>;
  NowPlayingQueueItem?: NowPlayingQueueItemResolvers<ContextType>;
  NowPlaying?: NowPlayingResolvers<ContextType>;
  NowPlayingReaction?: NowPlayingReactionResolvers<ContextType>;
};


/**
 * @deprecated
 * Use "Resolvers" root object instead. If you wish to get "IResolvers", add "typesPrefix: I" to your config.
 */
export type IResolvers<ContextType = MyGQLContext> = Resolvers<ContextType>;
