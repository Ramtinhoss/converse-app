import { translate } from "@i18n";
import { useCallback, useState } from "react";
import { Alert, Platform } from "react-native";

import { currentAccount } from "@data/store/accountsStore";
import { Button } from "@design-system/Button/Button";
import { useRouter } from "@navigation/useNavigation";
import { isCurrentUser } from "@shared/utils/user";
import { useAppTheme } from "@theme/useAppTheme";
import { navigate } from "@utils/navigation";
import { accountCanMessagePeer } from "@/features/consent/account-can-message-peer";
import { usePreferredName } from "@/hooks/usePreferredName";

type NavigationChatProps = {
  address: string;
  groupMode?: boolean;
  addToGroup?: () => void;
};

export function NavigationChatButton({
  address,
  groupMode,
  addToGroup,
}: NavigationChatProps) {
  const { theme } = useAppTheme();

  const navigation = useRouter();

  const [loading, setLoading] = useState(false);
  const preferredName = usePreferredName(address);
  const isCurrentUserAddress = isCurrentUser(address);

  const openChat = useCallback(() => {
    // On Android the accounts are not in the navigation but in a drawer
    navigation.popToTop();

    navigate("Conversation", {
      peer: address,
    });
  }, [address, navigation]);

  const addToGroupIfPossible = useCallback(async () => {
    if (loading) return;
    setLoading(true);
    const allowed = await accountCanMessagePeer({
      account: currentAccount(),
      peer: address,
    });
    setLoading(false);
    // canGroupMessage() returns lowercase addresses
    if (!allowed) {
      Alert.alert(
        translate("cannot_be_added_to_group_yet", {
          name: preferredName,
        })
      );
      return;
    }
    addToGroup?.();
  }, [loading, address, addToGroup, preferredName]);

  const getButtonText = () => {
    if (isCurrentUserAddress) return translate("you");
    if (groupMode) {
      return loading ? translate("add_loading") : translate("add");
    }
    return translate("chat");
  };

  const getButtonAction = () => {
    if (isCurrentUserAddress) return undefined;
    if (groupMode) {
      return loading ? undefined : addToGroupIfPossible;
    }
    return openChat;
  };

  return (
    <Button
      variant={
        isCurrentUserAddress
          ? "fill"
          : Platform.OS === "android"
          ? "link"
          : "outline"
      }
      style={{
        marginRight: theme.spacing.xs,
      }}
      text={getButtonText()}
      onPress={getButtonAction()}
      disabled={isCurrentUserAddress}
    />
  );
}
