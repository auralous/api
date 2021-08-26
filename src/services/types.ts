import { AuthState } from "../auth/types";
import { SessionService } from "./session";
import { TrackService } from "./track";
import { UserService } from "./user";

export interface ServiceContext {
  loaders: {
    session: ReturnType<typeof SessionService.createLoader>;
    track: ReturnType<typeof TrackService.createLoader>;
    user: ReturnType<typeof UserService.createLoader>;
  };
  auth: AuthState | null;
}
