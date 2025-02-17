import { textPrimaryColor } from "@styles/colors";
import { PictoSizes } from "@styles/sizes";
import React from "react";
import { Platform, StyleSheet, Text, useColorScheme, View } from "react-native";

import Button from "../components/Button/Button";
import Picto from "../components/Picto/Picto";
import { useNotificationsPermission } from "@/features/notifications/hooks/use-notifications-permission";

export default function NotificationsScreen() {
  const { requestPermission, setNotificationsSettings } =
    useNotificationsPermission();
  const styles = useStyles();
  return (
    <View style={styles.notifications}>
      <Picto
        picto="message.badge"
        size={PictoSizes.notification}
        style={styles.picto}
      />
      <Text style={styles.title}>Accept notifications</Text>
      <Text style={styles.p}>
        Converse is a messaging app, it works much better with notifications.
      </Text>
      <Button
        title="Accept notifications"
        action="primary"
        onPress={async () => {
          await requestPermission();
          setNotificationsSettings({ showNotificationScreen: false });
        }}
      />
      <Button
        title="Later"
        style={styles.later}
        variant="text"
        textStyle={{ fontWeight: "600" }}
        onPress={() => {
          setNotificationsSettings({ showNotificationScreen: false });
        }}
      />
    </View>
  );
}

const useStyles = () => {
  const colorScheme = useColorScheme();
  return StyleSheet.create({
    notifications: {
      flex: 1,
      alignItems: "center",
    },
    picto: {
      ...Platform.select({
        default: {
          marginTop: 124,
          marginBottom: 98,
        },
        android: {
          marginTop: 165,
          marginBottom: 61,
        },
      }),
    },
    title: {
      fontWeight: "700",
      fontSize: 34,
      color: textPrimaryColor(colorScheme),
    },
    p: {
      fontSize: 17,
      marginLeft: 32,
      marginRight: 32,
      textAlign: "center",
      marginTop: 21,
      marginBottom: "auto",
      color: textPrimaryColor(colorScheme),
    },
    later: {
      marginBottom: 54,
      marginTop: 21,
    },
  });
};
