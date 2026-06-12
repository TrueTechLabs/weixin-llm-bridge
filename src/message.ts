import { MessageItemType, MessageType, type WeixinMessage } from "./types.js";

export interface IncomingText {
  id: string;
  userId: string;
  text: string;
  contextToken?: string;
}

export function parsePrivateText(message: WeixinMessage): IncomingText | undefined {
  if (message.message_type !== MessageType.USER || message.group_id) return undefined;
  const userId = message.from_user_id?.trim();
  if (!userId) return undefined;

  const textItem = message.item_list?.find(
    (item) => item.type === MessageItemType.TEXT && item.text_item?.text != null,
  );
  const text = textItem?.text_item?.text?.trim();
  if (!text) return undefined;

  const id =
    message.message_id != null
      ? String(message.message_id)
      : message.client_id?.trim() ||
        `${userId}:${message.seq ?? ""}:${message.create_time_ms ?? ""}`;

  return {
    id,
    userId,
    text,
    ...(message.context_token ? { contextToken: message.context_token } : {}),
  };
}
