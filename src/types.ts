export const MessageType = {
  USER: 1,
  BOT: 2,
} as const;

export const MessageItemType = {
  TEXT: 1,
} as const;

export const MessageState = {
  FINISH: 2,
} as const;

export const TypingStatus = {
  TYPING: 1,
  CANCEL: 2,
} as const;

export interface BaseInfo {
  channel_version: string;
  bot_agent: string;
}

export interface TextItem {
  text?: string;
}

export interface MessageItem {
  type?: number;
  text_item?: TextItem;
}

export interface WeixinMessage {
  seq?: number;
  message_id?: number;
  from_user_id?: string;
  to_user_id?: string;
  client_id?: string;
  create_time_ms?: number;
  session_id?: string;
  group_id?: string;
  message_type?: number;
  message_state?: number;
  item_list?: MessageItem[];
  context_token?: string;
}

export interface GetUpdatesResponse {
  ret?: number;
  errcode?: number;
  errmsg?: string;
  msgs?: WeixinMessage[];
  get_updates_buf?: string;
  longpolling_timeout_ms?: number;
}

export interface GetConfigResponse {
  ret?: number;
  errmsg?: string;
  typing_ticket?: string;
}

export interface Credentials {
  token: string;
  accountId: string;
  baseUrl: string;
  userId?: string;
  savedAt: string;
}

export interface PersistedState {
  getUpdatesBuf: string;
  recentMessageIds: string[];
}

export type ChatRole = "system" | "user" | "assistant";

export interface ChatMessage {
  role: ChatRole;
  content: string;
}
