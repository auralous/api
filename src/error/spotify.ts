import { UndecimError } from "undecim";
import { augmentUndecimError } from "./utils.js";

/// <reference path="spotify-api" />

export async function rethrowSpotifyError(
  error: UndecimError | Error
): Promise<never> {
  if (error instanceof UndecimError) {
    // @ts-ignore
    error.type = "SpotifyHTTPStatusError";
    const augmentedError = await augmentUndecimError(error);
    if (typeof augmentedError.responseBody === "object") {
      const spotifyResponse = augmentedError.responseBody as
        | { error: SpotifyApi.ErrorObject }
        | { error: string; error_description: string };
      if ("error_description" in spotifyResponse)
        augmentedError.message = spotifyResponse.error_description;
      else augmentedError.message = spotifyResponse.error.message;
    }
    return Promise.reject(augmentedError);
  }
  throw error;
}
