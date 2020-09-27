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

## Environment variables

Certain environment variables are required to run this application:

- `APP_URI`: URL of this web app
- `API_URI`: URL of the API Server
- `MONGODB_URI`: The [MongoDB](https://www.mongodb.com/) [Connection String](https://docs.mongodb.com/manual/reference/connection-string/) URI with authentication and the MongoDB database to use.
- `REDIS_URL`: A number of [Redis](http://redis.io/) connection strings for each node with authentication. Seperated with space ` ` where applicable. Usuall,y only one node is required to discover the rest of them.
- `GOOGLE_API_KEY`: The API Key used for YouTube data ([
YouTube Data API (v3)](https://developers.google.com/youtube/v3) must be enabled).
- `GOOGLE_CLIENT_KEY`, `GOOGLE_CLIENT_SECRET`: Google Client key and secret for OAuth.
- `SPOTIFY_CLIENT_ID`, `SPOTIFY_CLIENT_SECRET`: Spotify Client ID  and Secret for OAuth and Spotify data.
- `FACEBOOK_APP_ID`, `FACEBOOK_APP_SECRET`: (optional) FaceBook App ID and secret for OAuth.
- `TWITTER_CONSUMER_KEY`, `TWITTER_CONSUMER_SECRET`: (optional) Twitter Consumer key and secret for OAuth.
- `SONGLINK_KEY`: [Songlink/Odesli](https://odesli.co/) API Key.
- `SENTRY_DSN`: (optional) Sentry DSN for error reporting.
- `CLOUDINARY_URL`: [Cloudinary](https://cloudinary.com/) URL for image upload. We hope to migrate away from this service in the future.
- `LOG_LEVEL`: (optional) Set [log level](https://github.com/pinojs/pino/blob/master/docs/api.md#level-string) for [pino](https://github.com/pinojs/pino). Default: `info`.

This project supports loading environment variables from `.env` file via [dotenv](https://github.com/motdotla/dotenv).

## Local Development

Install the following:

- [Node](https://nodejs.org/) 14.x ([nvm](https://github.com/nvm-sh/nvm) recommended)
- [Yarn](https://yarnpkg.com/) 1.x: See [Installation](https://classic.yarnpkg.com/en/docs/install)
- [Redis](https://redis.io/) 6.x: See [Download](https://redis.io/download). You want to grab `src/
- [Mongo](https://www.mongodb.com/) 4.4: Download [MongoDB Community Server](https://www.mongodb.com/try/download/community).

Set the required environment variables as defined in [Environment variables](#environment-variables).

Redis must be run using cluster mode. See [Redis cluster tutorial](https://redis.io/topics/cluster-tutorial). A quick way to create Redis Cluster is to use [`create-cluster` script](https://redis.io/topics/cluster-tutorial#creating-a-redis-cluster-using-the-create-cluster-script)

```
path/to/create-cluster start
path/to/create-cluster create
path/to/create-cluster stop
```

Run `yarn dev` to start the development server.

## Simple Setup

Create your Redis Cluster and MongoDb instance by any way. Build the app using `yarn build`.

Set the required environment variables by any mean and start the app with `yarn start`. This should start Stereo API in port `4000` unless a specific `PORT` env variable is set.

## Kubernetes Setup

We use [Helm Charts](https://helm.sh/) to manage Kubernetes applications. See [Installing Helm](https://helm.sh/docs/intro/install/).

Install/Upgrade the charts that `stereo-api` depends on and then `stereo-api` chart itself.

### MongoDB

We use [bitnami/mongodb](https://github.com/bitnami/charts/tree/master/bitnami/mongodb) chart to deploy [bitnami/mongodb image](https://github.com/bitnami/bitnami-docker-mongodb).

Install the helm chart and specify the [paramters](https://github.com/bitnami/charts/tree/master/bitnami/mongodb#parameters). You can use their [values-production.yaml](https://github.com/bitnami/charts/blob/master/bitnami/mongodb/values-production.yaml).

```bash
helm repo add bitnami https://charts.bitnami.com/bitnami
helm upgrade --install mongo-s bitnami/mongodb --set architecture="replicaset" --set replicaCount=3
```

Make sure to replace `mongo-s` in the following commands to the actual one if you use a different name or `--generate-name`. `mongo-s` is also hard coded in several other places, so make sure to update them.

```bash
#To get the root password run:
export MONGODB_ROOT_PASSWORD=$(kubectl get secret --namespace default mongo-s-mongodb -o jsonpath="{.data.mongodb-root-password}" | base64 --decode)
# echo $MONGODB_ROOT_PASSWORD

#To connect to your database, create a MongoDB client container:
kubectl run --namespace default mongo-s-mongodb-client --rm --tty -i --restart='Never' --env MONGODB_ROOT_PASSWORD=$MONGODB_ROOT_PASSWORD --image docker.io/bitnami/mongodb:4.4.1-debian-10-r13 --command -- bash

mongo admin --host "mongo-s-mongodb-0.mongo-s-mongodb-headless.default.svc.cluster.local,mongo-s-mongodb-1.mongo-s-mongodb-headless.default.svc.cluster.local,mongo-s-mongodb-2.mongo-s-mongodb-headless.default.svc.cluster.local" --authenticationDatabase admin -u root -p $MONGODB_ROOT_PASSWORD
```

After authenticated as admin, create a database user and let them read `stereo` database

```
use stereo
db.createUser(
  {
    user: "s",
    pwd: passwordPrompt(),  // or cleartext password
    roles: [{ role: "readWrite", db: "stereo" }]
  }
)
```

### Redis

We use [bitnami/redis-cluster](https://github.com/bitnami/charts/tree/master/bitnami/redis-cluster) chart to deploy [bitnami/redis image](https://github.com/bitnami/bitnami-docker-redis) in Cluster Mode.

Install the helm chart and specify the [paramters](https://github.com/bitnami/charts/tree/master/bitnami/redis#parameters). You can use their [values-production.yaml](https://github.com/bitnami/charts/blob/master/bitnami/redis/values-production.yaml) using `-f`.

```bash
helm repo add bitnami https://charts.bitnami.com/bitnami
helm upgrade --install redis-cluster-s bitnami/redis-cluster --set persistence.size=2Gi
```

Make sure to replace `redis-cluster-s` in the following commands to the actual one if you use a different name or `--generate-name`. `redis-cluster-s` is also hard coded in several other places, so make sure to update them.

```bash
# To get your password run:
export REDIS_PASSWORD=$(kubectl get secret --namespace default redis-cluster-s -o jsonpath="{.data.redis-password}" | base64 --decode)
# echo $REDIS_PASSWORD

# To connect to your Redis server:

# 1. Run a Redis pod that you can use as a client:
kubectl run --namespace default redis-cluster-s-client --rm --tty -i --restart='Never' \
   --env REDIS_PASSWORD=$REDIS_PASSWORD \--labels="redis-cluster-s-client=true" \
   --image docker.io/bitnami/redis:6.0.8-debian-10-r0 -- bash

# 2. Connect using the Redis CLI:
redis-cli -h redis-cluster-s.default.svc.cluster.local -a $REDIS_PASSWORD

# To connect to your database from outside the cluster execute the following commands:

kubectl port-forward --namespace default svc/redis-cluster-s-master 6379:6379 &
redis-cli -h 127.0.0.1 -p 6379 -a $REDIS_PASSWORD#
```

### API Application

Open [./stereo/templates/configmap.yaml](./stereo/templates/configmap.yaml) and update the values accordingly.

Create `./stereo/templates/secret.yaml` and copy the below with your own values replaced. (do not commit this, duh)

```
apiVersion: v1
kind: Secret
metadata:
  name: {{ .Release.Name }}-secret
data:
  google-api-key: "YOUR_GOOGLE_API_KEY"
  google-client-secret: "YOUR_GOOGLE_CLIENT_SECRET"
  spotify-client-secret: "YOUR_SPOTIFY_CLIENT_SECRET"
  facebook-app-secret: "YOUR_FACEBOOK_APP_SECRET"
  twitter-consumer-secret: "YOUR_TWITTER_CONSUMER_SECRET"
  mongodb-uri: "YOUR_MONGODB_CONNECTION_STRING"
  redis-url: "YOUR_REDIS_CONNECTION_STRING"
  songlink-key: "YOUR_SONGLINK_API_KEY"
  cloudinary_url: "YOUR_CLOUDINARY_URL"
```

Authenticate with Docker to pull `hoangvvo/stereo-api`, which is a private image.

```bash
kubectl create secret docker-registry regcred --docker-server=https://index.docker.io/v1/ --docker-username=<your-name> --docker-password=<your-pword> --docker-email=<your-email>
```

See [Create a Secret by providing credentials on the command line](https://kubernetes.io/docs/tasks/configure-pod-container/pull-image-private-registry/#create-a-secret-by-providing-credentials-on-the-command-line)

Install `stereo-api` chart.

```bash
helm upgrade --install stereo-api charts/stereo-api
```

By default `stereo-api` service will with `ClusterIP`, to be used with a ingress controller. If this is the only user-facing service, use `LoadBalancer` type by specifying `--set service.type="LoadBalancer"` in `helm install`.

### Ingress controller

If `stereo-api` was not deployed as `type=LoadBalancer`, you need an Kubernetes ingress controller to route external traffic to your services. We use [Contour](https://projectcontour.io/).

```bash
# Install Contour
kubectl apply -f https://projectcontour.io/quickstart/contour.yaml

# Get Contour external address
kubectl get -n projectcontour service envoy -o wide
```

In [values.yaml](charts/stereo-api/values.yaml), change the value of ingress.hosts[0].host to your domain.

Run the following two to debug:

```bash
kubectl -n projectcontour get po
kubectl get -n projectcontour service envoy -o wide
```

#### HTTPS

[jetstack/cert-manager helm chart](https://hub.helm.sh/charts/jetstack/cert-manager) can be used to install `cert-manager`. Follow their installation instruction and run:

```bash
# Make sure to set spec.acme.email
kubectl apply -f charts/yaml/letsencrypt-prod.yaml
```

Check the status by running:

```bash
kubectl describe certificate stereo-api-tls
```

Otherwise, you can set up HTTPS on proxy like [Cloudflare](https://www.cloudflare.com/)

## Workflows

### Docker

Build Docker image

```bash
docker build -t hvvo/stereo-api .
```

Set the required environment variables inside `.env` and start the Docker image. `-p` binds port `4000` of the container to port 8080 of the host machine.

```bash
docker run --env-file .env -p 4000:8080 hvvo/stereo-api
```

Push Docker image to Docker Hub

```bash
docker push hvvo/stereo-api
```

## License

This program is a free software: you can redistribute it and/or modify it under the terms of the GNU Affero General Public License as published by the Free Software Foundation. See [LICENSE](LICENSE) file in this repository for the full text.

Feel free to email us at [yo@withstereo.com](yo@withstereo.com) with any questions and concerns.
