import { DecodedMessageWithCodecsType } from "@/utils/xmtpRN/client.types";

type HasNextMessageInSeriesPayload = {
  currentMessage: DecodedMessageWithCodecsType;
  nextMessage: DecodedMessageWithCodecsType | undefined;
};

export const hasNextMessageInSeries = ({
  currentMessage,
  nextMessage,
}: HasNextMessageInSeriesPayload) => {
  if (!nextMessage) return false;
  return nextMessage.senderInboxId === currentMessage.senderInboxId;
};
