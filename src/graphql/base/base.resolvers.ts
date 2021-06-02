import { DateTimeResolver } from "graphql-scalars";
import type { Resolvers } from "../graphql.gen.js";

export const resolvers: Resolvers = {
  DateTime: DateTimeResolver,
};

export default resolvers;
