import { showActionSheetWithOptions } from "@components/StateHandlers/ActionSheetStateHandler";
import { TableViewPicto } from "@components/TableView/TableViewImage";
import { useCurrentAccount } from "@data/store/accountsStore";
import { useGroupMembers } from "@hooks/useGroupMembers";
import { translate } from "@i18n";
import { actionSheetColors, textSecondaryColor } from "@styles/colors";
import {
  getAccountIsAdmin,
  getAccountIsSuperAdmin,
  getAddressIsAdmin,
  getAddressIsSuperAdmin,
} from "@utils/groupUtils/adminUtils";
import { getGroupMemberActions } from "@utils/groupUtils/getGroupMemberActions";
import { sortGroupMembersByAdminStatus } from "@utils/groupUtils/sortGroupMembersByAdminStatus";
import logger from "@utils/logger";
import { navigate } from "@utils/navigation";
import { getPreferredInboxName } from "@utils/profile";
import { FC, memo, useMemo } from "react";
import { StyleSheet, Text, View, useColorScheme } from "react-native";

import { IProfileSocials } from "@/features/profiles/profile-types";
import { useInboxProfilesSocials } from "@/hooks/useInboxProfilesSocials";
import { useGroupMembersConversationScreenQuery } from "@/queries/useGroupMembersQuery";
import { captureErrorWithFriendlyToast } from "@/utils/capture-error";
import { GroupWithCodecsType } from "@/utils/xmtpRN/client.types";
import { useGroupPermissionPolicyQuery } from "@queries/useGroupPermissionPolicyQuery";
import type { ConversationTopic, InboxId } from "@xmtp/react-native-sdk";
import TableView, {
  TableViewItemType,
} from "../components/TableView/TableView";

type GroupScreenMembersTableProps = {
  topic: ConversationTopic;
  group: GroupWithCodecsType | undefined | null;
};

export const GroupScreenMembersTable: FC<GroupScreenMembersTableProps> = memo(
  ({ topic, group }) => {
    const colorScheme = useColorScheme();
    const currentAccount = useCurrentAccount() as string;
    const styles = useStyles();
    const { data: members } = useGroupMembersConversationScreenQuery({
      account: currentAccount,
      topic,
    });
    const {
      promoteToSuperAdmin,
      promoteToAdmin,
      revokeAdmin,
      revokeSuperAdmin,
      removeMember,
    } = useGroupMembers((topic ?? group?.topic)!);
    const { data: groupPermissionPolicy } = useGroupPermissionPolicyQuery(
      currentAccount,
      (topic ?? group?.topic)!
    );

    const memberInboxIds = useMemo(
      () => members?.ids.map((m) => m) ?? [],
      [members]
    );

    const data = useInboxProfilesSocials(memberInboxIds);

    const mappedData = useMemo(() => {
      const profileMap: Record<InboxId, IProfileSocials[] | null | undefined> =
        {};
      data.forEach(({ data: socials }, index) => {
        const memberId = members?.ids[index];
        if (!memberId) return;
        profileMap[memberId] = socials;
      });
      return profileMap;
    }, [data, members]);

    const currentAccountIsSuperAdmin = useMemo(
      () => getAddressIsSuperAdmin(members, currentAccount),
      [currentAccount, members]
    );

    const currentAccountIsAdmin = useMemo(
      () => getAddressIsAdmin(members, currentAccount),
      [currentAccount, members]
    );

    const tableViewItems = useMemo(() => {
      const items: TableViewItemType[] = [];

      const groupMembers = sortGroupMembersByAdminStatus(
        members,
        currentAccount
      );
      groupMembers.forEach((a) => {
        const isSuperAdmin = getAccountIsSuperAdmin(members, a.inboxId);
        const isAdmin = getAccountIsAdmin(members, a.inboxId);
        const isCurrentUser =
          a.address.toLowerCase() === currentAccount.toLowerCase();
        const preferredName = getPreferredInboxName(mappedData[a.inboxId]);
        items.push({
          id: a.inboxId,
          title: `${preferredName}${isCurrentUser ? translate("you_parentheses") : ""}`,
          action: () => {
            const {
              options,
              cancelButtonIndex,
              promoteAdminIndex,
              promoteSuperAdminIndex,
              revokeAdminIndex,
              revokeSuperAdminIndex,
              removeIndex,
              destructiveButtonIndex,
            } = getGroupMemberActions({
              groupPermissionLevel: groupPermissionPolicy,
              isCurrentUser,
              isSuperAdmin,
              isAdmin,
              currentAccountIsSuperAdmin,
              currentAccountIsAdmin,
            });
            showActionSheetWithOptions(
              {
                options,
                cancelButtonIndex,
                destructiveButtonIndex,
                title: preferredName,
                ...actionSheetColors(colorScheme),
              },
              async (selectedIndex?: number) => {
                switch (selectedIndex) {
                  case 0:
                    navigate("Profile", {
                      address: a.address,
                      fromGroupTopic: topic,
                    });
                    break;
                  case promoteSuperAdminIndex:
                    logger.debug("Promoting super admin...");
                    try {
                      await promoteToSuperAdmin(a.inboxId);
                    } catch (e) {
                      logger.error(e);
                      captureErrorWithFriendlyToast(e);
                    }
                    break;
                  case revokeSuperAdminIndex:
                    logger.debug("Revoking super admin...");
                    try {
                      await revokeSuperAdmin(a.inboxId);
                    } catch (e) {
                      logger.error(e);
                      captureErrorWithFriendlyToast(e);
                    }
                    break;
                  case promoteAdminIndex:
                    logger.debug("Promoting member...");
                    try {
                      await promoteToAdmin(a.inboxId);
                    } catch (e) {
                      logger.error(e);
                      captureErrorWithFriendlyToast(e);
                    }
                    break;
                  case revokeAdminIndex:
                    logger.debug("Revoking admin...");
                    try {
                      await revokeAdmin(a.inboxId);
                    } catch (e) {
                      logger.error(e);
                      captureErrorWithFriendlyToast(e);
                    }
                    break;
                  case removeIndex:
                    logger.debug("Removing member...");
                    try {
                      await removeMember([a.inboxId]);
                    } catch (e) {
                      logger.error(e);
                      captureErrorWithFriendlyToast(e);
                    }
                    break;
                  default:
                }
              }
            );
          },
          rightView: (
            <View style={styles.tableViewRight}>
              {isSuperAdmin && (
                <Text style={styles.adminText}>
                  {translate("group_screen_member_actions.super_admin")}
                </Text>
              )}
              {isAdmin && !isSuperAdmin && (
                <Text style={styles.adminText}>
                  {translate("group_screen_member_actions.admin")}
                </Text>
              )}
              <TableViewPicto
                symbol="chevron.right"
                color={textSecondaryColor(colorScheme)}
              />
            </View>
          ),
        });
      });
      return items;
    }, [
      colorScheme,
      currentAccount,
      currentAccountIsSuperAdmin,
      currentAccountIsAdmin,
      groupPermissionPolicy,
      mappedData,
      members,
      promoteToAdmin,
      promoteToSuperAdmin,
      removeMember,
      revokeAdmin,
      revokeSuperAdmin,
      styles.adminText,
      styles.tableViewRight,
      topic,
    ]);

    return (
      <TableView items={tableViewItems} title={translate("members_title")} />
    );
  }
);

const useStyles = () => {
  const colorScheme = useColorScheme();

  return StyleSheet.create({
    tableViewRight: {
      flexDirection: "row",
      alignItems: "center",
    },
    adminText: {
      fontSize: 17,
      color: textSecondaryColor(colorScheme),
    },
  });
};
