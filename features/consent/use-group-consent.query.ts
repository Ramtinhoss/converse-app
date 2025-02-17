import {
  getGroupQueryData,
  getGroupQueryOptions,
  setGroupQueryData,
} from "@/queries/useGroupQuery";
import { useQuery } from "@tanstack/react-query";
import type { ConsentState, ConversationTopic } from "@xmtp/react-native-sdk";

type IGroupConsentQueryArgs = {
  account: string;
  topic: ConversationTopic;
};

export const useGroupConsentQuery = (args: IGroupConsentQueryArgs) => {
  const { account, topic } = args;
  return useQuery({
    ...getGroupQueryOptions({ account, topic }),
    select: (group) => group?.state,
  });
};

export const getGroupConsentQueryData = (
  account: string,
  topic: ConversationTopic
) => {
  const group = getGroupQueryData({ account, topic });
  return group?.state;
};

export const setGroupConsentQueryData = (
  account: string,
  topic: ConversationTopic,
  consent: ConsentState
) => {
  const currentGroup = getGroupQueryData({ account, topic });
  if (!currentGroup) return;
  currentGroup.state = consent;
  setGroupQueryData({
    account,
    topic,
    group: currentGroup,
  });
};
