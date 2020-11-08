import { DateTimeResolver } from "graphql-scalars";
// @ts-ignore
import { GraphQLUpload } from "graphql-upload";
import { IResolvers } from "../types/resolvers.gen";

export const typeDefs = `
  # Custom
  scalar DateTime
  scalar Upload
`;

export const resolvers: IResolvers = {
  DateTime: DateTimeResolver,
  Upload: GraphQLUpload,
};
