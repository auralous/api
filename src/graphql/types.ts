import { PubSub } from "../data/pubsub.js";
import type { SetCacheControl } from "../server/types.js";
import type { ServiceContext } from "../services/types.js";

export type MyGQLContext = ServiceContext & {
  pubsub: PubSub;
  setCacheControl?: SetCacheControl;
};
