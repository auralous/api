import { DateTimeResolver } from "graphql-scalars";
// @ts-ignore
import { GraphQLUpload } from "graphql-upload";

import type { Resolvers } from "../../types";

export const resolvers: Resolvers = {
  DateTime: DateTimeResolver,
  Upload: GraphQLUpload,
};

export default resolvers;
