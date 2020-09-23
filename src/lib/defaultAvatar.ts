export function defaultAvatar(
  resourceType: "room" | "playlist" | "user",
  id: string
) {
  // Powered by https://github.com/tobiaslins/avatar
  return `https://avatar.tobi.sh/${id}`;
}
