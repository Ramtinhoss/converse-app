import config from "../config";
import {
  Client,
  Conversation,
  DecodedMessage,
  SortDirection,
} from "../vendor/xmtp-js/src";

const env = config.xmtpEnv === "production" ? "production" : "dev";

export type TimestampByConversation = { [topic: string]: number };

export const getXmtpClientFromKeys = (keys: any) =>
  Client.create(null, {
    privateKeyOverride: Buffer.from(keys),
    env,
  });

export const getConversations = async (client: Client) => {
  const conversations = await client.conversations.list();
  return conversations;
};

export const getNewConversationMessages = async (
  conversation: Conversation,
  lastTimestamp?: number
) => {
  // Loads all messages and sends to Expo
  const messages = await conversation.messages({
    direction: SortDirection.SORT_DIRECTION_ASCENDING,
    startTime: lastTimestamp ? new Date(lastTimestamp) : undefined,
  });
  if (
    messages.length > 1 ||
    (messages.length === 1 && lastTimestamp !== messages[0].sent.getTime())
  ) {
    return messages;
  }
  return [];
};

export const streamNewConversations = async (
  client: Client,
  handleNewConversation: (conversation: Conversation) => void
) => {
  // Stream future conversations and send to expo
  // For each new conversation, load & stream messages
  const conversationStream = await client.conversations.stream();
  for await (const conversation of conversationStream) {
    handleNewConversation(conversation);
  }
};

export const streamNewConversationMessages = async (
  conversation: Conversation,
  handleNewMessage: (message: DecodedMessage) => void
) => {
  // Stream future messages and sends to expo
  const stream = await conversation.streamMessages();
  for await (const m of stream) {
    handleNewMessage(m);
  }
};
