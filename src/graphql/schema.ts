import { loadFiles } from "@graphql-tools/load-files";
import { mergeResolvers, mergeTypeDefs } from "@graphql-tools/merge";
import { makeExecutableSchema } from "@graphql-tools/schema";
import path from "path";
import { fileURLToPath } from "url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));

const requireMethod = (path: string) => import(path);

const typesArray = await loadFiles(path.join(__dirname, "./*/*.graphql"), {
  requireMethod,
});
const typeDefs = mergeTypeDefs(typesArray);

const resolversArray = await loadFiles(path.join(__dirname, "./*/*.ts"), {
  requireMethod,
});
const resolvers = mergeResolvers(resolversArray);

export default makeExecutableSchema({ typeDefs, resolvers });
