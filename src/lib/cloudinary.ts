/* eslint-disable camelcase */
import { v2 as cloudinary } from "cloudinary";
import type { Stream } from "stream";

export function uploadStreamToCloudinary(
  stream: Stream,
  {
    publicId,
    width,
    height,
  }: {
    publicId: string;
    width?: number;
    height?: number;
  }
): Promise<string> {
  return new Promise((resolve, reject) => {
    const uploadStream = cloudinary.uploader.upload_stream(
      {
        public_id: `stereo/${publicId}`,
        overwrite: true,
        width: width || 512,
        height: height || 512,
        crop: "lfill",
      },
      (err, image) => {
        if (err || !image?.secure_url) return reject(err);
        return resolve(image.secure_url);
      }
    );
    stream.pipe(uploadStream);
  });
}

export function deleteCloudinaryImagesByPrefix(prefix: string) {
  return cloudinary.api.delete_resources_by_prefix(`stereo/${prefix}`);
}
