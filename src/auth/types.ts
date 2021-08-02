import { PlatformName } from "../graphql/graphql.gen";

export interface AuthState {
  token: string;
  userId: string;
  provider: PlatformName;
  oauthId: string;
  accessTokenPromise: Promise<string | null>;
}
