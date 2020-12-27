import { Profile, Passport } from "passport";
// @ts-ignore
import { Strategy as GoogleStrategy } from "passport-google-oauth20";
// @ts-ignore
import { Strategy as SpotifyStrategy } from "passport-spotify";
import { UserService } from "../services/user";
import { PlatformName } from "../types/index";

import type { Db } from "mongodb";
import type IORedis from "ioredis";
import type { PubSub } from "../lib/pubsub";
import type { UserDbObject } from "../types/index";

export function createPassport(db: Db, redis: IORedis.Cluster, pubsub: PubSub) {
  function authCallback(
    accessToken: string,
    refreshToken: string,
    profile: Profile,
    done: (err: Error | null, user: UserDbObject | null) => void
  ) {
    const provider: PlatformName =
      profile.provider === "google"
        ? PlatformName.Youtube
        : (profile.provider as PlatformName);

    const userService = new UserService({ db, redis, pubsub });

    const id = profile.id; // id from oauth provider
    const profilePicture = profile.photos?.[0]?.value || null;

    return userService
      .findOrCreate(
        { provider, id },
        {
          ...(profilePicture && { profilePicture }),
          email: profile.emails?.[0]?.value,
          oauth: { id, provider, accessToken, refreshToken },
        }
      )
      .then((user) => {
        done(null, user);
      });
  }

  const passport = new Passport();

  passport.serializeUser((user: UserDbObject, done) => {
    done(null, user._id);
  });

  passport.deserializeUser((id: string, done) => {
    const userService = new UserService({ db, redis, pubsub });
    userService.findById(id).then((user) => done(null, user || null));
  });

  passport.use(
    new GoogleStrategy(
      {
        clientID: process.env.GOOGLE_CLIENT_KEY,
        clientSecret: process.env.GOOGLE_CLIENT_SECRET,
        callbackURL: `${process.env.API_URI}/auth/google/callback`,
      },
      authCallback
    )
  );

  passport.use(
    new SpotifyStrategy(
      {
        clientID: process.env.SPOTIFY_CLIENT_ID,
        clientSecret: process.env.SPOTIFY_CLIENT_SECRET,
        callbackURL: `${process.env.API_URI}/auth/spotify/callback`,
      },
      authCallback
    )
  );

  return passport;
}
