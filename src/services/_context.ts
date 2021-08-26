import { AuthState } from "../auth/types.js";
import { SessionService } from "./session.js";
import { TrackService } from "./track.js";
import { ServiceContext } from "./types.js";
import { UserService } from "./user.js";

export function createContext(auth: AuthState | null): ServiceContext {
  return {
    loaders: {
      session: SessionService.createLoader(),
      track: TrackService.createLoader(),
      user: UserService.createLoader(),
    },
    auth,
  };
}
