import { DateTimeResolver } from "graphql-scalars";
// @ts-ignore
import { GraphQLUpload } from "graphql-upload";

import type { IResolvers } from "../types/index";

export const typeDefs = `
  # Custom
  scalar DateTime
  scalar Upload
`;

export const resolvers: IResolvers = {
  DateTime: DateTimeResolver,
  Upload: GraphQLUpload,
};
