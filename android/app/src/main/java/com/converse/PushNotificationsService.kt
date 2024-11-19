package com.converse

import android.Manifest
import android.content.pm.PackageManager
import android.util.Log
import androidx.core.app.ActivityCompat
import androidx.core.app.NotificationCompat
import androidx.core.app.NotificationManagerCompat
import com.beust.klaxon.Klaxon
import com.converse.xmtp.NotificationDataResult
import com.converse.xmtp.getGroup
import com.converse.xmtp.getXmtpClient
import com.converse.xmtp.initCodecs
import com.facebook.react.bridge.ReactApplicationContext
import com.google.crypto.tink.subtle.Base64
import com.google.firebase.messaging.FirebaseMessagingService
import com.google.firebase.messaging.RemoteMessage
import com.reactnativecommunity.asyncstorage.AsyncStorageModule
import expo.modules.core.ModuleRegistry
import expo.modules.core.interfaces.InternalModule
import expo.modules.core.interfaces.SingletonModule
import expo.modules.kotlin.AppContext
import expo.modules.kotlin.ModulesProvider
import expo.modules.kotlin.modules.Module
import expo.modules.notifications.notifications.JSONNotificationContentBuilder
import expo.modules.notifications.notifications.model.Notification
import expo.modules.notifications.notifications.model.NotificationContent
import expo.modules.notifications.notifications.model.NotificationRequest
import expo.modules.notifications.notifications.model.triggers.FirebaseNotificationTrigger
import expo.modules.notifications.notifications.presentation.builders.CategoryAwareNotificationBuilder
import expo.modules.notifications.notifications.presentation.builders.ExpoNotificationBuilder
import expo.modules.notifications.service.delegates.SharedPreferencesNotificationCategoriesStore
import expo.modules.securestore.AuthenticationHelper
import expo.modules.securestore.SecureStoreModule
import expo.modules.securestore.encryptors.AESEncryptor
import expo.modules.securestore.encryptors.HybridAESEncryptor
import kotlinx.coroutines.*
import org.json.JSONObject
import java.lang.ref.WeakReference
import java.security.KeyStore
import java.util.*
import kotlin.reflect.full.declaredMemberProperties
import kotlin.reflect.jvm.isAccessible
import kotlin.reflect.jvm.javaField
import androidx.lifecycle.Lifecycle
import androidx.lifecycle.ProcessLifecycleOwner
import com.converse.xmtp.getNewConversation
import com.converse.xmtp.handleV3Message
import com.converse.xmtp.handleV3Welcome
import com.google.protobuf.kotlin.toByteString
import org.xmtp.proto.message.api.v1.MessageApiOuterClass
import org.xmtp.proto.message.api.v1.MessageApiOuterClass.Envelope

class PushNotificationsService : FirebaseMessagingService() {
    companion object {
        const val TAG = "PushNotificationsService"
        lateinit var secureStoreModule: SecureStoreModule
        lateinit var asyncStorageModule: AsyncStorageModule
        lateinit var reactAppContext: ReactApplicationContext
    }

    override fun onCreate() {
        super.onCreate()
        initSecureStore()
        initAsyncStorage()
        initSentry(this)
    }

    // Define a CoroutineScope for the service
    private val serviceJob = SupervisorJob()
    private val serviceScope = CoroutineScope(Dispatchers.IO + serviceJob)

    override fun onMessageReceived(remoteMessage: RemoteMessage) {
        Log.d(TAG, "Received a notification")

        // Check if message contains a data payload.
        if (remoteMessage.data.isEmpty()) return

        if (remoteMessage.data.containsKey("body")) {
            val envelopeJSON = remoteMessage.data["body"] ?: return
            Log.d(TAG, "Message data payload: $envelopeJSON")

            val notificationData = Klaxon().parse<NotificationData>(envelopeJSON) ?: return
            Log.d(TAG, "Decoded notification data: account is ${notificationData.account} - topic is ${notificationData.contentTopic}")

            initCodecs() // Equivalent to initSentry()
            val accounts = getAccounts(this)

            if (!accounts.contains(notificationData.account)) {
                Log.d(TAG, "Account ${notificationData.account} is not in store")
                return
            }

            val appIsInForeground = ProcessLifecycleOwner.get().lifecycle.currentState.isAtLeast(Lifecycle.State.STARTED)
            val currentAccount = getCurrentAccount(this)
            if (appIsInForeground && currentAccount !== null && currentAccount.lowercase() == notificationData.account.lowercase()) {
                Log.d(TAG, "Preventing notification for ${notificationData.account} because user is on it")
                return
            }
            Log.d(TAG, "INSTANTIATED XMTP CLIENT FOR ${notificationData.contentTopic}")

            val encryptedMessageData = Base64.decode(notificationData.message, Base64.NO_WRAP)
            val envelope = Envelope.newBuilder().apply {
                timestampNs = notificationData.timestampNs.toLong() / 1_000_000
                message = encryptedMessageData.toByteString()// Convert ByteString to byte array
                contentTopic = notificationData.contentTopic
            }.build()

            var shouldShowNotification = false
            var result = NotificationDataResult()
            var context = this

            // Using IO dispatcher for background work, not blocking the main thread and UI
            serviceScope.launch {
                try {
                    val xmtpClient = getXmtpClient(context, notificationData.account) ?: run {
                        Log.d(
                            TAG,
                            "NO XMTP CLIENT FOUND FOR TOPIC ${notificationData.contentTopic}"
                        )
                        return@launch
                    }
                    if (isV3WelcomeTopic(notificationData.contentTopic)) {
                        val convo = getNewConversation(xmtpClient, notificationData.contentTopic)
                        if (convo != null) {
                            result = handleV3Welcome(
                                applicationContext,
                                xmtpClient,
                                convo,
                                remoteMessage
                            )
                            if (result != NotificationDataResult()) {
                                shouldShowNotification = result.shouldShowNotification
                            }
                        }
                    } else if (isV3MessageTopic(notificationData.contentTopic)) {
                        Log.d(TAG, "Handling an ongoing group message notification")
                        result = handleV3Message(
                            applicationContext,
                            xmtpClient,
                            envelope,
                            remoteMessage,
                        )
                        if (result != NotificationDataResult()) {
                            shouldShowNotification = result.shouldShowNotification
                        }
                    }
                    val notificationAlreadyShown =
                        notificationAlreadyShown(applicationContext, result.messageId)

                    if (shouldShowNotification && !notificationAlreadyShown) {
                        incrementBadge(applicationContext)
                        result.remoteMessage?.let { showNotification(result, it) }
                    }
                } catch (e: Exception) {
                    // Handle any exceptions
                    Log.e(TAG, "Error on IO Dispatcher coroutine", e)
                }
            }
        } else if (remoteMessage.data.containsKey("data")) {
            Log.i(TAG, "Handling Converse Notification")
            val envelopeJSON = remoteMessage.data["data"] ?: return
            val klaxon = Klaxon().converter(NotificationConverter())
            val payload: NotificationPayload? = try {
                klaxon.parse<NotificationPayload>(envelopeJSON)
            } catch (e: Exception) {
                Log.e(TAG, "Failed to parse NotificationPayload", e)
                null
            }
            if (payload != null) {
                if (payload is GroupInviteNotification) {
                    handleGroupInviteNotification(payload)
                    println("This is an GroupInviteNotification with message: ${payload.groupInviteId}")
                } else if (payload is GroupSyncNotification) {
                    handleGroupSyncNotification(payload)
                    println("This is an GroupSyncNotification with message: ${payload.contentTopic}")
                }
            } else {
                Log.e(TAG, "Payload is null after parsing")
            }
        } else {
            Log.i(TAG, "Empty Notification")
        }
    }

    private fun getNotificationIdentifier(remoteMessage: RemoteMessage): String {
        return remoteMessage.data?.get("tag") ?: remoteMessage.messageId ?: UUID.randomUUID().toString()
    }

    private fun createNotificationRequest(
        identifier: String,
        content: NotificationContent,
        notificationTrigger: FirebaseNotificationTrigger
    ): NotificationRequest {
        return NotificationRequest(identifier, content, notificationTrigger)
    }

    private fun handleGroupInviteNotification(notification: GroupInviteNotification) {
        val context = this

        // Using IO dispatcher for background work, not blocking the main thread and UI
        serviceScope.launch {
            try {
                val mmkv = getMmkv(context)
                val xmtpClient = getXmtpClient(context, notification.account) ?: run {
                    Log.d(
                        TAG,
                        "NO XMTP CLIENT FOUND FOR GROUP INVITE ${notification.groupInviteId}"
                    )
                    return@launch
                }
                val groupId = mmkv?.decodeString("group-invites-link-" + notification.groupInviteId)
                    ?: return@launch
                var apiURI = mmkv.decodeString("api-uri")
                if (apiURI == null) {
                    apiURI = getAsyncStorage("api-uri")
                }
                val group = getGroup(xmtpClient, groupId)
                if (group != null && apiURI != null) {
                    group.addMembers(listOf(notification.address))
                    putGroupInviteRequest(applicationContext, apiURI, xmtpClient, notification.joinRequestId, "ACCEPTED" )
                }


            } catch (e: Exception) {
                // Handle any exceptions
                Log.e(TAG, "Error on IO Dispatcher coroutine", e)
            }
        }
    }

    private fun handleGroupSyncNotification(notification: GroupSyncNotification) {
        val context = this

        // Using IO dispatcher for background work, not blocking the main thread and UI
        serviceScope.launch {
            try {
                val mmkv = getMmkv(context)
                val xmtpClient = getXmtpClient(context, notification.account) ?: run {
                    Log.d(
                        TAG,
                        "NO XMTP CLIENT FOUND FOR GROUP SYNC ${notification.contentTopic}"
                    )
                    return@launch
                }
                val groupId = getV3IdFromTopic(notification.contentTopic)
                val group = getGroup(xmtpClient, groupId)
                if (group != null) {
                    group.sync()
    
                }
            } catch (e: Exception) {
                // Handle any exceptions
                Log.e(TAG, "Error on IO Dispatcher coroutine", e)
            }
        }
    }

    private fun createNotificationFromRemoteMessage(title: String, subtitle:String?, message: String, remoteMessage: RemoteMessage): Notification {
        val identifier = getNotificationIdentifier(remoteMessage)
        var data = remoteMessage.data as MutableMap<Any, Any>
        data["title"] = title
        if (subtitle !== null) {
            data["subtitle"] = subtitle
        }
        data["message"] = message
        Log.d(TAG, "SHOWING NOTIFICATION WITH DATA $data")
        val payload = JSONObject(data as Map<*, *>)
        val content = JSONNotificationContentBuilder(this).setPayload(payload).build()
        val request = createNotificationRequest(identifier, content, FirebaseNotificationTrigger(remoteMessage))
        return Notification(request, Date(remoteMessage.sentTime))
    }

    private suspend fun showNotification(result: NotificationDataResult, remoteMessage: RemoteMessage) {
        val context = this

        // Hooking into Expo's android notification system to get the native NotificationCompat builder and customize it
        // while still enablig Expo's React Native notification interaction handling

        val expoNotification = createNotificationFromRemoteMessage(result.title, result.subtitle, result.body, remoteMessage);
        val expoBuilder = CategoryAwareNotificationBuilder(this, SharedPreferencesNotificationCategoriesStore(this)).also {
            it.setNotification(expoNotification)
        } as ExpoNotificationBuilder
        if (ActivityCompat.checkSelfPermission(
                this,
                Manifest.permission.POST_NOTIFICATIONS
            ) != PackageManager.PERMISSION_GRANTED
        ) {
            return
        }

        val createBuilder = ExpoNotificationBuilder::class.java.getDeclaredMethod("createBuilder")
        createBuilder.isAccessible = true
        val builder = createBuilder.invoke(expoBuilder) as NotificationCompat.Builder

        customizeMessageNotification(this, builder, expoNotification, result)

        NotificationManagerCompat.from(this).notify(
            expoNotification.notificationRequest.identifier,
            0,
            builder.build()
        )
    }

    private fun initSecureStore() {
        // Basically hooking inside React / Expo modules internals
        // to access the Expo SecureStore module from Kotlin

        val internalModules: Collection<InternalModule> = listOf()
        val singletonModules: Collection<SingletonModule> = listOf()

        val moduleRegistry = ModuleRegistry(internalModules, singletonModules)

        reactAppContext = ReactApplicationContext(this)
        val weakRef = WeakReference(reactAppContext)
        val appContext = AppContext(object : ModulesProvider {
            override fun getModulesList() =
                listOf(
                    SecureStoreModule::class.java,
                )
        }, moduleRegistry,  weakRef)
        secureStoreModule = SecureStoreModule()


        val appC = Module::class.declaredMemberProperties.find { it.name == "_appContext" }
        appC?.isAccessible = true
        appC?.javaField?.set(secureStoreModule, appContext)
        val authenticationHelper = SecureStoreModule::class.declaredMemberProperties.find { it.name == "authenticationHelper" }
        val hybridAESEncryptor = SecureStoreModule::class.declaredMemberProperties.find { it.name == "hybridAESEncryptor" }
        val keyStore = SecureStoreModule::class.declaredMemberProperties.find { it.name == "keyStore" }

        authenticationHelper?.isAccessible = true;
        hybridAESEncryptor?.isAccessible = true;
        keyStore?.isAccessible = true;

        authenticationHelper?.javaField?.set(secureStoreModule, AuthenticationHelper(reactAppContext, appContext.legacyModuleRegistry))
        hybridAESEncryptor?.javaField?.set(secureStoreModule, HybridAESEncryptor(reactAppContext, AESEncryptor()))
        val ks = KeyStore.getInstance("AndroidKeyStore")
        ks.load(null)
        keyStore?.javaField?.set(secureStoreModule, ks)
    }

    private fun initAsyncStorage() {
        val reactContext = ReactApplicationContext(this)
        asyncStorageModule = AsyncStorageModule(reactContext)
    }

    override fun onDestroy() {
        super.onDestroy()
        // Cancel the serviceScope when the service is destroyed
        serviceScope.cancel()
    }
}