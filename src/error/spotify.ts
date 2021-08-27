import { UndecimError } from "undecim";
import { undecimAddResponseBody } from "./utils.js";

/// <reference path="spotify-api" />

export async function rethrowSpotifyError(
  error: UndecimError | Error
): Promise<never> {
  if (error instanceof UndecimError) {
    const augmentedError = await undecimAddResponseBody(error);
    if (typeof augmentedError.responseBody === "string") {
      return Promise.reject(new Error(augmentedError.responseBody));
    } else {
      const spotifyResponse = augmentedError.responseBody as
        | {
            error: SpotifyApi.ErrorObject;
          }
        | { error: string; error_description: string };
      if ("error_description" in spotifyResponse)
        Promise.reject(new Error(spotifyResponse.error_description));
      else return Promise.reject(Error(spotifyResponse.error.message));
    }
  }
  throw error;
}
