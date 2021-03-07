import { DateTimeResolver } from "graphql-scalars";
import type { Resolvers } from "../../types";

export const resolvers: Resolvers = {
  DateTime: DateTimeResolver,
};

export default resolvers;
