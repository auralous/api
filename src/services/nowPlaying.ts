import {
  CustomError,
  NotFoundError,
  UnauthorizedError,
} from "../error/errors.js";
import type { NowPlayingQueueItem } from "../graphql/graphql.gen.js";
import { NowPlayingController } from "./nowPlayingController.js";
import { QueueService } from "./queue.js";
import { SessionService } from "./session.js";
import type { ServiceContext } from "./types.js";

export class NowPlayingService {
  /**
   * Find the nowPlaying by session id
   */
  static async findCurrentItemById(
    id: string
  ): Promise<NowPlayingQueueItem | null> {
    // See src/data/types.ts#NowPlayingStateRedisValue
    const nowPlayingState =
      await NowPlayingController.getFormattedNowPlayingState(id);

    if (!nowPlayingState) return null;

    const queueItemData = await QueueService.findQueueItemData(
      id,
      nowPlayingState.queuePlayingUid
    );

    if (!queueItemData)
      throw new Error(
        `QueueItem is null for id = ${id}, uid = ${nowPlayingState.queuePlayingUid}`
      );

    return {
      uid: nowPlayingState.queuePlayingUid,
      ...queueItemData,
      playedAt: nowPlayingState.playedAt,
      endedAt: nowPlayingState.endedAt,
      index: nowPlayingState.playingIndex,
    };
  }

  /**
   * Skip forward current track
   */
  static async skipForward(context: ServiceContext, id: string) {
    if (!context.auth) throw new UnauthorizedError();
    const session = await SessionService.findById(context, id);
    if (!session) throw new NotFoundError("session", id);
    if (!session.collaboratorIds.includes(context.auth.userId))
      throw new CustomError("error.not_collaborator");
    await NowPlayingController.skipForward(context, String(session._id));
    return true;
  }

  /**
   * Skip backward current track
   */
  static async skipBackward(context: ServiceContext, id: string) {
    if (!context.auth) throw new UnauthorizedError();
    const session = await SessionService.findById(context, id);
    if (!session) throw new NotFoundError("session", id);
    if (!session.collaboratorIds.includes(context.auth.userId))
      throw new CustomError("error.not_collaborator");
    await NowPlayingController.skipBackward(context, String(session._id));
    return true;
  }

  /**
   * Play queue item with specific uid
   */
  static async playUid(context: ServiceContext, id: string, uid: string) {
    if (!context.auth) throw new UnauthorizedError();
    const session = await SessionService.findById(context, id);
    if (!session) throw new NotFoundError("session", id);
    if (!session.collaboratorIds.includes(context.auth.userId))
      throw new CustomError("error.not_collaborator");
    return Boolean(
      NowPlayingController.setNewPlayingIndexOrUid(
        context,
        String(session._id),
        uid
      )
    );
  }
}
