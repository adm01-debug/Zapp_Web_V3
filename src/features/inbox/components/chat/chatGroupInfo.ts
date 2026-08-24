export const SAME_GROUP_MS = 5 * 60 * 1000;

export function buildGroupInfo<
  T extends { sender?: string | null; timestamp?: string | number | null },
>(messages: T[]): { isFirstInGroup: boolean; isLastInGroup: boolean }[] {
  return messages.map((msg, i) => {
    const prev = messages[i - 1];
    const next = messages[i + 1];
    const ts = new Date(msg.timestamp ?? 0).getTime();
    const isFirstInGroup =
      !prev ||
      prev.sender !== msg.sender ||
      ts - new Date(prev.timestamp ?? 0).getTime() > SAME_GROUP_MS;
    const isLastInGroup =
      !next ||
      next.sender !== msg.sender ||
      new Date(next.timestamp ?? 0).getTime() - ts > SAME_GROUP_MS;
    return { isFirstInGroup, isLastInGroup };
  });
}
