import { useDisconnectActionSheet } from "@hooks/useDisconnectActionSheet";
import { translate } from "@i18n";
import Clipboard from "@react-native-clipboard/clipboard";
import {
  actionSheetColors,
  dangerColor,
  primaryColor,
  textSecondaryColor,
} from "@styles/colors";
import { PictoSizes } from "@styles/sizes";
import * as Linking from "expo-linking";
import React, { useCallback } from "react";
import {
  Keyboard,
  Platform,
  TouchableOpacity,
  useColorScheme,
} from "react-native";

import { invalidateProfileSocialsQuery } from "@/queries/useProfileSocialsQuery";
import { useAccountsStore } from "../data/store/accountsStore";
import { useAppStore } from "../data/store/appStore";
import { useSelect } from "../data/store/storeHelpers";
import { NotificationPermissionStatus } from "../features/notifications/types/Notifications.types";
import { requestPushNotificationsPermissions } from "../features/notifications/utils/requestPushNotificationsPermissions";
import { useRouter } from "../navigation/useNavigation";
import { navigate } from "../utils/navigation";
import Picto from "./Picto/Picto";
import { showActionSheetWithOptions } from "./StateHandlers/ActionSheetStateHandler";
import { TableViewPicto } from "./TableView/TableViewImage";

type Props = {
  account: string;
};

export default function AccountSettingsButton({ account }: Props) {
  const router = useRouter();

  const {
    setNotificationsPermissionStatus,
    notificationsPermissionStatus,
    isInternetReachable,
  } = useAppStore(
    useSelect([
      "setNotificationsPermissionStatus",
      "notificationsPermissionStatus",
      "isInternetReachable",
    ])
  );

  const { setCurrentAccount } = useAccountsStore(
    useSelect(["setCurrentAccount"])
  );
  const colorScheme = useColorScheme();
  const showDisconnectActionSheet = useDisconnectActionSheet(account);

  const onPress = useCallback(() => {
    Keyboard.dismiss();

    const methods = {
      [translate("your_profile_page")]: async () => {
        if (account) {
          invalidateProfileSocialsQuery(account);
          setCurrentAccount(account, false);
          router.navigate("Chats");
          navigate("Profile", {
            address: account,
          });
        }
      },
      [translate("copy_wallet_address")]: () => {
        Clipboard.setString(account || "");
      },
      [translate("turn_on_notifications")]: () => {
        // @todo => move that to a helper because also used in Profile
        if (notificationsPermissionStatus === "denied") {
          if (Platform.OS === "android") {
            // Android 13 is always denied first so let's try to show
            requestPushNotificationsPermissions().then(
              (newStatus: NotificationPermissionStatus | undefined) => {
                if (newStatus === "denied") {
                  Linking.openSettings();
                } else if (newStatus) {
                  setNotificationsPermissionStatus(newStatus);
                }
              }
            );
          } else {
            Linking.openSettings();
          }
        } else if (notificationsPermissionStatus === "undetermined") {
          // Open popup
          requestPushNotificationsPermissions().then(
            (newStatus: NotificationPermissionStatus | undefined) => {
              if (!newStatus) return;
              setNotificationsPermissionStatus(newStatus);
            }
          );
        }
      },
      [translate("disconnect_this_account")]: () =>
        showDisconnectActionSheet(colorScheme),
      [translate("cancel")]: () => {},
    };

    const options = Object.keys(methods);
    const icons = [];
    if (isInternetReachable) {
      icons.push(
        <Picto
          style={{
            width: PictoSizes.tableViewImage,
            height: PictoSizes.tableViewImage,
          }}
          size={PictoSizes.tableViewImage}
          picto="exclamationmark.triangle"
          color={dangerColor(colorScheme)}
        />
      );
    }
    if (notificationsPermissionStatus === "granted") {
      options.splice(options.indexOf(translate("turn_on_notifications")), 1);
    }

    showActionSheetWithOptions(
      {
        options,
        icons,
        destructiveButtonIndex: options.indexOf(
          translate("disconnect_this_account")
        ),
        cancelButtonIndex: options.indexOf(translate("cancel")),
        title: account || undefined,
        ...actionSheetColors(colorScheme),
      },
      (selectedIndex?: number) => {
        if (selectedIndex === undefined) return;
        const method = (methods as any)[options[selectedIndex]];
        if (method) {
          method();
        }
      }
    );
  }, [
    router,
    account,
    isInternetReachable,
    notificationsPermissionStatus,
    colorScheme,
    setCurrentAccount,
    setNotificationsPermissionStatus,
    showDisconnectActionSheet,
  ]);

  return Platform.OS === "android" ? (
    <TouchableOpacity onPress={onPress}>
      <Picto
        picto="more_vert"
        size={PictoSizes.accoutSettings}
        color={textSecondaryColor(colorScheme)}
      />
    </TouchableOpacity>
  ) : (
    <TableViewPicto
      symbol="info.circle"
      color={primaryColor(colorScheme)}
      onPress={onPress}
    />
  );
}
