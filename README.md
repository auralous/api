# @auralous/api

> Music Together

## Environment variables

Environment variables are loaded from `.env` file via [dotenv](https://github.com/motdotla/dotenv).

### Development

```env
API_URI=http://localhost:4000
APP_URI=http://localhost:3000
GOOGLE_API_KEY=
GOOGLE_CLIENT_KEY=
GOOGLE_CLIENT_SECRET=
SPOTIFY_CLIENT_ID=
SPOTIFY_CLIENT_SECRET=
SONGLINK_KEY=
MONGODB_URI=mongodb://localhost:27017/auralous
REDIS_URL=redis://localhost:6379
LOG_LEVEL=debug
LOG_PRETTY=true
```

### Production

```env
API_URI=https://api.auralous.com
APP_URI=https://app.auralous.com
GOOGLE_API_KEY=
GOOGLE_CLIENT_KEY=
GOOGLE_CLIENT_SECRET=
SPOTIFY_CLIENT_ID=
SPOTIFY_CLIENT_SECRET=
SONGLINK_KEY=
MONGODB_URI=mongodb://mongo:27017/auralous
REDIS_URL=redis://redis:6379
```

## Local Development

Install the following:

- [Node](https://nodejs.org/) 16.x

Start docker compose for databases:

```bash
docker compose up
```

Run `npm run dev` to start the development server.

## Deployment

See https://github.com/auralous/deploy

## License

This program is a free software: you can redistribute it and/or modify it under the terms of the GNU Affero General Public License as published by the Free Software Foundation. See [LICENSE](LICENSE) file in this repository for the full text.

Feel free to email us at [listen@auralous.com](listen@auralous.com) with any questions and concerns.
