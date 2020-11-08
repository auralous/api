import passport, { Profile } from "passport";
// @ts-ignore
import { Strategy as GoogleStrategy } from "passport-google-oauth20";
// @ts-ignore
import { Strategy as FacebookStrategy } from "passport-facebook";
// @ts-ignore
import { Strategy as TwitterStrategy } from "passport-twitter";
// @ts-ignore
import { Strategy as SpotifyStrategy } from "passport-spotify";
import { db } from "../db/mongo";
import { redis } from "../db/redis";
import { pubsub } from "../lib/pubsub";
import Services from "../services";
import { UserDbObject } from "../types/db";
import { OAuthProviderName, ExtendedIncomingMessage } from "../types/common";

function authCallback(
  req: ExtendedIncomingMessage,
  token1: string,
  token2: string,
  profile: Profile,
  done: (err: Error | null, user: UserDbObject | null) => void
) {
  const { id, displayName: name, emails } = profile;
  let profilePicture = profile.photos?.[0]?.value || null;

  const provider =
    profile.provider === "google"
      ? "youtube"
      : (profile.provider as OAuthProviderName);

  // twitter photo fix
  if (provider === "twitter" && profilePicture)
    profilePicture = profilePicture.replace("_normal", "");

  const authToken = {
    id,
    provider,
    accessToken: token1,
    refreshToken: token2,
  };

  const services = new Services({ user: req.user || null, db, redis, pubsub });

  if (req.user) {
    // Logged in. Associate account with user
    services.User.updateMeOauth(provider, authToken)
      .then((user) => {
        done(null, user);
      })
      .catch((err) => done(err, null));
  } else {
    // Not logged-in. Authenticate based on account.
    const userQuery = {
      [`oauth.${provider}.id`]: id,
    };

    const userCreate = {
      name,
      ...(profilePicture && { profilePicture }),
      email: emails?.[0]?.value,
      oauth: {
        [provider]: authToken,
      },
    };

    services.User.findOrCreate(userQuery, userCreate, authToken).then(
      (user) => {
        done(null, user);
      }
    );
  }
}

passport.serializeUser((user: UserDbObject, done) => {
  done(null, user._id);
});

passport.deserializeUser((id: string, done) => {
  const services = new Services({ user: null, db, redis, pubsub });
  services.User.findById(id).then((user) => done(null, user || null));
});

passport.use(
  new GoogleStrategy(
    {
      clientID: process.env.GOOGLE_CLIENT_KEY,
      clientSecret: process.env.GOOGLE_CLIENT_SECRET,
      callbackURL: `${process.env.API_URI}/auth/google/callback`,
      passReqToCallback: true,
    },
    authCallback
  )
);

passport.use(
  new FacebookStrategy(
    {
      clientID: process.env.FACEBOOK_APP_ID,
      clientSecret: process.env.FACEBOOK_APP_SECRET,
      callbackURL: `${process.env.API_URI}/auth/facebook/callback`,
      profileFields: ["id", "displayName", "picture.type(large)", "email"],
      passReqToCallback: true,
    },
    authCallback
  )
);

passport.use(
  new TwitterStrategy(
    {
      consumerKey: process.env.TWITTER_CONSUMER_KEY,
      consumerSecret: process.env.TWITTER_CONSUMER_SECRET,
      callbackURL: `${process.env.API_URI}/auth/twitter/callback`,
      includeEmail: true,
      passReqToCallback: true,
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
      passReqToCallback: true,
    },
    authCallback
  )
);

export default passport;
