# stereo-api

> Music Together

This is the `stereo-api` codebase that powers [Stereo API Server](https://api.withstereo.com/). It is a JavaScript GraphQL Server using [benzene](https://github.com/hoangvvo/benzene) written in [TypeScript](https://github.com/microsoft/TypeScript).

## What is Stereo

Stereo is a completely-free and community-driven project that lets you play & listen to music in sync with friends in public or private "rooms".

Stereo currently supports streaming music on [YouTube](https://www.youtube.com/) and [Spotify](https://www.spotify.com/).

## Other repositories

Stereo consists of several other repos containing server or mobile apps, some of which or open sourced.

- Web: The [Next.js](https://github.com/vercel/next.js) app that powers [Stereo](https://withstereo.com/) Web App
- Mobile (React Native): TBD

## Development

### Prerequisites

#### Local

- [Node](https://nodejs.org/) 14.x ([nvm](https://github.com/nvm-sh/nvm) recommended)
- [Yarn](https://yarnpkg.com/) 1.x: See [Installation](https://classic.yarnpkg.com/en/docs/install)

#### Containers

TBD

### Environment variables

Certain environment variables are required to run this application:

- `APP_URI`: URL of this web app
- `API_URI`: URL of the API Server
- `MONGODB_URI`: The [MongoDB](https://www.mongodb.com/) Connection String URI with authentication **and** the MongoDB database to use.
- `REDIS_URL`: The [Redis](http://redis.io/) URI with authentication.
- `GOOGLE_API_KEY`: The API Key used for YouTube data ([
YouTube Data API (v3)](https://developers.google.com/youtube/v3) must be enabled). See [console.developers.google.com](https://console.developers.google.com/).
- `GOOGLE_CLIENT_KEY`, `GOOGLE_CLIENT_SECRET`: Google Client key and secret for OAuth. See [console.developers.google.com](https://console.developers.google.com/).
- `SPOTIFY_CLIENT_ID`: Spotify Client ID and secret for OAuth and Spotify data, See [developer.spotify.com](https://developer.spotify.com/).
- `FACEBOOK_APP_ID`, `FACEBOOK_APP_SECRET`: (optional) FaceBook App ID and secret for OAuth. See [developers.facebook.com](https://developers.facebook.com/).
- `TWITTER_CONSUMER_KEY`, `TWITTER_CONSUMER_SECRET`: (optional) Twitter Consumer key and secret for OAuth. See [developer.twitter.com](http://developer.twitter.com/).
- `SONGLINK_KEY`: [Songlink/Odesli](https://odesli.co/) API Key. See their [Public API Documentation](https://www.notion.so/odesli/Public-API-d8093b1bb8874f8b85527d985c4f9e68).
- `SENTRY_DSN`: (optional) Sentry DSN for error reporting.
- `CLOUDINARY_URL`: [Cloudinary](https://cloudinary.com/) URL for image upload. We hope to migrate away from this service in the future. See [this](https://cloudinary.com/documentation/node_integration#configuration).
- `LOG_LEVEL`: (optional) Set [log level](https://github.com/pinojs/pino/blob/master/docs/api.md#level-string) for [pino](https://github.com/pinojs/pino). Default: `info`.

#### `.env`

This project supports loading environment variables from `.env` file via [dotenv](https://github.com/motdotla/dotenv). Below is an example `.env` file:

```
APP_URI=http://localhost:3000
API_URI=http://localhost:4000
MONGODB_URI=mongodb://127.0.0.1:27017/withstereo-dev
REDIS_URL=redis://127.0.0.1:6379/0
GOOGLE_API_KEY=AIzaSyDnbEk_7htqBEoCt_Dj0X-5bU7frgBIiYQ
GOOGLE_CLIENT_KEY=710667281357-qcqvtm3quqo76h21csgu464d7r3hcumf.apps.googleusercontent.com
GOOGLE_CLIENT_SECRET=5fQfYMJpk-rFtOn8fqHXwC89
SPOTIFY_CLIENT_ID=8df236c183f349d2a447c7cf1b8d9c6c
SPOTIFY_CLIENT_SECRET=e3262e1915d845ccbf6abe3516b5cf3d
FACEBOOK_APP_ID=x
FACEBOOK_APP_SECRET=x
TWITTER_CONSUMER_KEY=x
TWITTER_CONSUMER_SECRET=x
SONGLINK_KEY=1234-5678-abc-xyz
CLOUDINARY_URL=cloudinary://741947492169653:vkyuRmZ3EbSULnkfXJdtSqwhURw@dbplcha6k
SENTRY_DSN=https://6629d11b3faa439997f293f23804098c@o402572.ingest.sentry.io/5280589
```

> Do not commit `.env`!

### Workflows

TBD

## Deployment

TBD

## License

This program is a free software: you can redistribute it and/or modify it under the terms of the GNU Affero General Public License as published by the Free Software Foundation. See [LICENSE](LICENSE) file in this repository for the full text.

Feel free to email us at [yo@withstereo.com](yo@withstereo.com) with any questions and concerns.
