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

- [Node](https://nodejs.org/) 14.x ([nvm](https://github.com/nvm-sh/nvm) recommended)

Run `docker-compose up` to start redis and mongodb services. Then, run `npm run dev` to start the development server.

## Deployment

### Build Docker image

```bash
sudo docker build -t hvvo/auralous-api .
sudo docker push hvvo/auralous-api
```

### Run with Docker Compose

1. Pull the source code
2. Create `.env.prod` as above
3. Run `docker compose up -d`

## License

This program is a free software: you can redistribute it and/or modify it under the terms of the GNU Affero General Public License as published by the Free Software Foundation. See [LICENSE](LICENSE) file in this repository for the full text.

Feel free to email us at [yo@withstereo.com](yo@withstereo.com) with any questions and concerns.
