import DataLoader from "dataloader";
import {
  AuthenticationError,
  ForbiddenError,
  UserInputError,
} from "apollo-server-errors";
import { BaseModel, ModelInit } from "./base";
import { PlaylistDbObject } from "../types/db";
import { PlatformName } from "../types/common";

export class PlaylistModel extends BaseModel {
  private collection = this.context.db.collection<PlaylistDbObject>(
    "playlists"
  );
  private loader: DataLoader<string, PlaylistDbObject | undefined>;
  constructor(options: ModelInit) {
    super(options);
    this.loader = new DataLoader(
      async (keys) => {
        const playlists = await this.collection
          .find({ _id: { $in: keys as string[] } })
          .toArray();
        // retain order
        return keys.map((key) =>
          playlists.find((playlist: PlaylistDbObject) => playlist._id === key)
        );
      },
      { cache: !options.noCache }
    );
  }

  async create({
    title,
    platform,
    tracks,
  }: Pick<PlaylistDbObject, "title" | "platform"> & {
    tracks?: PlaylistDbObject["tracks"] | null;
  }) {
    if (!this.context.user) throw new AuthenticationError("");

    const newPlaylist = await this.services.Service[platform].createPlaylist(
      title
    );

    if (tracks) {
      await this.services.Service[platform].insertPlaylistTracks(
        newPlaylist.externalId,
        tracks.map((trackId) => trackId.split(":")[1])
      );
    }

    const {
      ops: [playlist],
    } = await this.collection.insertOne({
      _id: `${platform}:${newPlaylist.externalId}`,
      platform,
      externalId: newPlaylist.externalId,
      title,
      userId: newPlaylist.userId,
      ...(newPlaylist.image && { image: newPlaylist.image }),
      tracks: tracks || [],
    });

    this.loader.prime(playlist._id, playlist);

    return playlist;
  }

  async findById(id: string) {
    return this.loader.load(id);
  }

  async findByUserId(userId: string) {
    const playlists = await this.collection.find({ userId }).toArray();
    // save them to cache
    for (let i = 0; i < playlists.length; i += 1) {
      const id = playlists[i]._id;
      this.loader.clear(id).prime(id, playlists[i]);
    }

    return playlists;
  }

  async findByMine(): Promise<PlaylistDbObject[] | null> {
    if (!this.context.user) return null;
    const promises: Promise<PlaylistDbObject[]>[] = [];
    if (this.context.user.oauth.youtube) {
      promises.push(this.findByUserId(this.context.user.oauth.youtube.id));
    }
    if (this.context.user.oauth.spotify) {
      promises.push(this.findByUserId(this.context.user.oauth.spotify.id));
    }
    return (await Promise.all(promises)).flat();
  }

  async insertTracks(
    id: string,
    trackIds: string[]
  ): Promise<PlaylistDbObject> {
    if (!this.context.user) throw new AuthenticationError("");
    const previousPlaylist = await this.findById(id);
    if (
      !previousPlaylist ||
      previousPlaylist.userId !==
        this.context.user.oauth[previousPlaylist.platform]?.id
    )
      throw new ForbiddenError("Cannot update playlist tracks");

    // Verify trackIds belong to correct platform
    const externalTrackIds = trackIds.map((trackId) => {
      const [platform, externalTrackId] = trackId.split(":");
      if (platform !== previousPlaylist.platform)
        throw new UserInputError(
          `Cannot add ${platform} track to ${previousPlaylist.platform} playlist`
        );
      return externalTrackId;
    });

    await this.services.Service[previousPlaylist.platform].insertPlaylistTracks(
      previousPlaylist.externalId,
      externalTrackIds
    );

    // Update playlists after insert tracks
    const playlistResponse = await this.services.Service[
      previousPlaylist.platform
    ].getPlaylist(previousPlaylist.externalId);

    if (!playlistResponse)
      throw new Error(
        `Unable to read playlist ${previousPlaylist.platform}:${previousPlaylist.externalId}`
      );

    return this.collection
      .findOneAndUpdate(
        { _id: previousPlaylist._id },
        { $set: playlistResponse },
        { returnOriginal: false }
      )
      .then((res) => res.value as PlaylistDbObject);
  }

  async syncByPlatform(platform: PlatformName) {
    if (!this.context.user) throw new AuthenticationError("");

    const thisOauth = this.context.user.oauth[platform];

    if (!thisOauth)
      throw new AuthenticationError(
        `You must connect to ${platform} before retrieving playlists`
      );

    const playlistResponses = await this.services.Service[
      platform
    ].getPlaylistsByUserId(thisOauth.id);

    const allPlaylists = await this.findByUserId(this.context.user?._id);

    /**
     * There scenerios
     * 1) Playlist exists in database and playlistResponses, we update it
     * 2) Playlist doesn't exist in database, we add it
     * 3) Playlist exists in data but not in playlistResponse, we remove it
     */

    const promiseBatch: Promise<any>[] = [];

    for (const playlistResponse of playlistResponses) {
      // 1 and 2
      promiseBatch.push(
        this.collection.updateOne(
          { _id: `${platform}:${playlistResponse.externalId}` },
          { $set: playlistResponse },
          { upsert: true }
        )
      );
    }

    for (const playlist of allPlaylists) {
      if (
        !playlistResponses.some(
          (plResp) => plResp.externalId === playlist.externalId
        )
      ) {
        // 3
        promiseBatch.push(
          this.collection.deleteOne({
            _id: playlist._id,
          })
        );
      }
    }

    await Promise.all(promiseBatch);
  }

  async removeByMineByPlatform(platform: PlatformName) {
    if (!this.context.user) throw new AuthenticationError("");
    return this.collection.deleteMany({
      creatorId: this.context.user._id,
      platform,
    });
  }
}
