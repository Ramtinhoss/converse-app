/**
 *
 * TODO: DELETE when finished refactoring messages/conversation
 *
 */

// import { useSelect } from "@data/store/storeHelpers";
// import { useConversationContext } from "@utils/conversation";
// import { useCallback, useEffect, useRef } from "react";
// import { View } from "react-native";
// import { useShallow } from "zustand/react/shallow";

// import FramePreview from "./FramePreview";
// import { useCurrentAccount } from "../../../data/store/accountsStore";
// import { useFramesStore } from "../../../data/store/framesStore";
// import { FramesForMessage, fetchFramesForMessage } from "../../../utils/frames";
// import { MessageToDisplay } from "../Message/Message";

// type Props = {
//   message: MessageToDisplay;
// };

// export function FramesPreviews({ message }: Props) {
//   const messageId = useRef<string | undefined>(undefined);
//   const tagsFetchedOnceForMessage = useConversationContext(
//     "tagsFetchedOnceForMessage"
//   );
//   const account = useCurrentAccount() as string;
//   const framesToDisplay = useFramesStore(
//     useShallow((s) => s.messageFramesMap[message.id] ?? [])
//   );
//   const { setMessageFramesMap } = useFramesStore(
//     useSelect(["setMessageFramesMap"])
//   );

//   const fetchTagsIfNeeded = useCallback(() => {
//     if (!tagsFetchedOnceForMessage.current[message.id]) {
//       tagsFetchedOnceForMessage.current[message.id] = true;
//       fetchFramesForMessage(
//         account,
//         message.id,
//         message.contentType,
//         message.content
//       ).then((frames: FramesForMessage) => {
//         setMessageFramesMap(frames.messageId, frames.frames);
//       });
//     }
//   }, [account, message, tagsFetchedOnceForMessage, setMessageFramesMap]);

//   // Components are recycled, let's fix when stuff changes
//   useEffect(() => {
//     if (message.id !== messageId.current) {
//       messageId.current = message.id;
//       fetchTagsIfNeeded();
//     }
//   }, [message.id, fetchTagsIfNeeded]);

//   return (
//     <View>
//       {framesToDisplay.map((frameToDisplay) => {
//         return (
//           <FramePreview
//             messageId={message.id}
//             messageTopic={message.topic}
//             messageFromMe={message.fromMe}
//             initialFrame={frameToDisplay}
//             key={frameToDisplay.url}
//           />
//         );
//       })}
//     </View>
//   );
// }
