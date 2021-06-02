export type SetCacheControl = (
  maxAge: number,
  scope?: "PRIVATE" | "PUBLIC"
) => void;
