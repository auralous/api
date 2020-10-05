import { DateTimeResolver } from "graphql-scalars";
import { makeExecutableSchema } from "@graphql-tools/schema";
// @ts-ignore
import { GraphQLUpload } from "graphql-upload";
import { typeDefs as User, resolvers as userResolvers } from "./user";
import { typeDefs as Room, resolvers as roomResolvers } from "./room";
import { typeDefs as Track, resolvers as trackResolvers } from "./track";
import { typeDefs as Message, resolvers as messageResolvers } from "./message";
import { typeDefs as Queue, resolvers as queueResolvers } from "./queue";
import {
  typeDefs as NowPlaying,
  resolvers as nowPlayingResolvers,
} from "./nowPlaying";
import { IResolvers } from "../types/resolvers.gen";

const Base = `
  type Query {
    _empty: String
  }

  type Mutation {
    _empty: String
  }

  type Subscription {
    _empty: String
  }

  # Custom
  scalar DateTime
  scalar Upload
`;

const baseResolvers = {
  DateTime: DateTimeResolver,
  Upload: GraphQLUpload,
};

const typeDefs = [Base, User, Room, Track, Message, Queue, NowPlaying];

const resolvers: IResolvers[] = [
  baseResolvers,
  userResolvers,
  roomResolvers,
  trackResolvers,
  messageResolvers,
  queueResolvers,
  nowPlayingResolvers,
];

// @ts-ignore
export default makeExecutableSchema({ typeDefs, resolvers });
