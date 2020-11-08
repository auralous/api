import { makeExecutableSchema } from "@graphql-tools/schema";
import { mergeTypeDefs, mergeResolvers } from "@graphql-tools/merge";
import { typeDefs as Base, resolvers as baseResolvers } from "./base";
import { typeDefs as User, resolvers as userResolvers } from "./user";
import { typeDefs as Room, resolvers as roomResolvers } from "./room";
import { typeDefs as Track, resolvers as trackResolvers } from "./track";
import { typeDefs as Message, resolvers as messageResolvers } from "./message";
import { typeDefs as Queue, resolvers as queueResolvers } from "./queue";
import {
  typeDefs as NowPlaying,
  resolvers as nowPlayingResolvers,
} from "./nowPlaying";
import { MyGQLContext } from "../types/common";
import { IResolvers } from "../types/resolvers.gen";

const typeDefs = mergeTypeDefs([
  Base,
  User,
  Room,
  Track,
  Message,
  Queue,
  NowPlaying,
]);

const resolvers = mergeResolvers<MyGQLContext, Required<IResolvers>>([
  baseResolvers,
  userResolvers,
  roomResolvers,
  trackResolvers,
  messageResolvers,
  queueResolvers,
  nowPlayingResolvers,
] as Required<IResolvers>[]);

export default makeExecutableSchema<MyGQLContext>({ typeDefs, resolvers });
