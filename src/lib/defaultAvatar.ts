export function defaultAvatar(resourceType: "room" | "user", id: string) {
  // Powered by https://github.com/tobiaslins/avatar
  return `https://avatar.tobi.sh/${id}`;
}
