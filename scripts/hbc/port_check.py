#!/usr/bin/env python3
"""
Porting & verification assistant for upgrading Venus Patches to a new Discord Android release.

Usage:
    python3 scripts/hbc/port_check.py [work/new/assets/index.android.bundle]
    python3 scripts/hbc/port_check.py --map      # rewrite module-map.md from BOOTSTRAP_MODULES

Prints:
1. HbcPrelude.kt & HbcPrivacy.kt bundle constants (ORIGINAL_SHA256, FUNCTION_COUNT, GLOBAL_OFFSET,
   GLOBAL_SIZE, GLOBAL_SHA256, JOIN_ID, EVAL_ID, PROMISE_ID, RESOLVE_ID).
2. Resolution status of all Metro modules hooked or demand-loaded by bootstrap.js (by source path
   and exported identifiers).
3. Resolution status and auto-located candidates for every HbcPrivacy function.
4. Metro module IDs used in bootstrap.js that BOOTSTRAP_MODULES doesn't check yet.

Exits 1 when anything needs attention, so it can gate a port.
"""
import sys, os, hashlib, struct
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from hbc import Bundle, CLOSURES
from privacy_targets import G

BOOTSTRAP_MODULES = [
    (17, None, ['AccessibilityInfo', 'Alert', 'AppRegistry', 'Pressable'], 'React Native'),
    (19, None, ['exports'], 'React'),
    (81, None, ['pickScale', 'setCustomSourceTransformer', 'addCustomSourceTransformer', 'default'], 'resolveAssetSource (Icon packs)'),
    (84, None, ['registerAsset', 'getAssetByID'], 'AssetRegistry (Icon packs)'),
    (120, None, ['enableIntersectionObserverByDefault', 'enableMutationObserverByDefault'], 'RN Environment setup'),
    (328, None, ['displayName', 'getSize', 'prefetch', 'resolveAssetSource', 'default'], 'RN.Image (Icon packs)'),
    (414, None, ['Pressable', 'android_disableSound'], 'Chat Picker Pressable'),
    (510, '../discord_common/js/packages/storage/Storage.tsx', ['Storage'], 'Storage (hasLoaded gate for Account switcher)'),
    (572, None, ['default', 'DispatchBand', 'STORAGE_KEY_LOG_DISPATCHES'], 'Flux Dispatcher instance (578 is only the class)'),
    (575, '../discord_common/js/packages/tokens/native.tsx', ['default', 'Theme', 'RawColor'], 'Theme tokens'),
    (577, '../discord_common/js/packages/tokens/colors/generated/native/generated-definitions.tsx', ['_private', 'SemanticColors'], 'SemanticColors'),
    (578, '../discord_common/js/packages/tokens/colors/generated/native/experiment-definitions.tsx', ['_private', 'SemanticColorExperiments'], 'SemanticColorExperiments (Custom themes: experiment overrides win over SemanticColors)'),
    (579, '../discord_common/js/packages/tokens/colors/generated/raw-color-definitions.tsx', ['_private', 'RawColors'], 'RawColors'),
    (1072, None, ['A11Y_RUNTIME_VIOLATION', 'ACCOUNT_SCHEDULED_FOR_DELETION', 'MessageTypesSets', 'Endpoints'], 'Discord Constants'),
    (1083, '../discord_common/js/shared/Constants.tsx', ['PRIMARY_NORMAL', 'PRIMARY_NORMAL_ITALIC', 'PRIMARY_MEDIUM'], 'Permissions constant'),
    (1098, '../discord_common/js/shared/lib/TokenManager.tsx', ['init', 'getAnalyticsToken', 'getToken'], 'TokenManager'),
    (1099, 'modules/routing/router_utils.tsx', ['shouldNavigate', 'transitionTo', 'transitionToGuild'], 'NavigationUtils'),
    (1113, 'intl/index.native.tsx', ['intl', 'getSystemLocale', 'getAvailableLocales'], 'Intl / Locale strings'),
    (1149, '../discord_common/js/packages/rtn-codegen/js/NativeFileModule.tsx', ['default'], 'NativeFileModule'),
    (1190, 'design/void/Button/native/Button.tsx', ['ButtonColors'], 'ButtonColors (red confirm on risky features)'),
    (1192, 'modules/user_settings/ThemeStore.tsx', ['default', 'UNSET', 'SET'], 'ThemeStore'),
    (1251, None, ['murmur', 'noConflict'], 'MurmurHashV3'),
    (1282, '../discord_common/js/packages/http-utils/HTTPUtils.tsx', ['INVALID_FORM_BODY_ERROR_CODE', 'convertSkemaError', 'stringifyErrors', 'HTTP'], 'HTTPUtils'),
    (1347, '../discord_common/js/packages/analytics-utils/getSuperProperties.tsx', ['browser_user_agent', 'browser_version', 'os_build_revision'], 'SuperProperties'),
    (1401, 'modules/user/UserStoreUtils.tsx', ['isStaffEnv', 'isStaffEnvRawData', 'getEnv'], 'UserStoreUtils.isStaffEnv (Unlock Discord experiments)'),
    (1385, 'stores/UserStore.tsx', ['default', 'users', 'ASSISTANT_WUMPUS_VOICE_USER'], 'UserStore'),
    (1411, 'utils/AvatarUtils.tsx', ['default'], 'AvatarUtils'),
    (1499, 'design/components/Navigator/native/useNavigation.native.tsx', ['useNavigation', 'useNativeStackNavigation', 'useStackNavigation'], 'useStackNavigation'),
    (2117, 'stores/native/AppStateStore.tsx', ['default'], 'AppStateStore'),
    (5019, 'stores/ChannelStore.tsx', ['Basic', 'Full', 'default'], 'ChannelStore'),
    (5041, 'stores/GuildStore.tsx', ['default'], 'GuildStore'),
    (5073, 'stores/SelectedChannelStore.tsx', ['default', 'findFirstVoiceChannelId', 'handleConnectionOpen'], 'SelectedChannelStore (Hidden channels never opens a locked channel by itself)'),
    (5076, 'stores/GuildRoleStore.tsx', ['default', 'getNumRoles'], 'GuildRoleStore'),
    (5082, 'stores/GuildMemberStore.tsx', ['GUILD', 'USER', 'default'], 'GuildMemberStore'),
    (2186, 'modules/user_settings/LocaleStore.tsx', ['default'], 'LocaleStore'),
    (5100, 'stores/GuildChannelStore.tsx', ['default', 'GUILD_SELECTABLE_CHANNELS_KEY', 'GUILD_VOCAL_CHANNELS_KEY'], 'GuildChannelsStore'),
    (5102, 'stores/PermissionStore.tsx', ['default'], 'PermissionStore'),
    (5103, 'modules/lurker_mode/LurkingStore.tsx', ['default'], 'LurkingStore'),
    (5109, 'modules/app_channels/AppChannelPermissions.tsx', ['APP_CHANNEL_MINIMUM_BOT_PERMISSIONS', 'SWAP_APP_CHANNEL_APPLICATION_PERMISSION_LIST', 'SWAP_APP_CHANNEL_APPLICATION_PERMISSIONS'], 'computePermissions'),
    (5112, 'stores/RelationshipStore.tsx', ['default'], 'RelationshipStore'),
    (2171, 'utils/PremiumUtils.tsx', ['BUNDLE', 'TIER_0', 'TIER_1'], 'PremiumUtils'),
    (5869, 'modules/toast/native/ToastActionCreators.tsx', ['default'], 'ToastActionCreators'),
    (5873, 'design/components/Icon/native/BaseIconImage.tsx', ['BaseIconImage'], 'BaseIconImage (Icon packs)'),
    (5187, '../discord_common/js/packages/design/components/ThemeContextProvider/ThemeContext.tsx', ['createThemedContext', 'useThemeContext', 'FALLBACK_THEME_CONTEXT_VALUE'], 'ThemeContext'),
    (5188, '../discord_common/js/packages/design/components/ThemeContextProvider/ThemeContextProvider.tsx', ['ThemeContextProvider'], 'ThemeContextProvider (Custom themes re-keys the server list and DMs too)'),
    (5194, 'modules/client_themes/ClientThemesBackgroundStore.tsx', ['default'], 'ClientThemesBackgroundStore (Unlock Nitro themes)'),
    (5346, 'modules/main_tabs_v2/helpers/NavigationRouteUtils.native.tsx', ['navigateToChannel', 'navigateToRootTab', 'pushModal', 'popModal'], 'ModalAPI'),
    (5347, 'modules/main_tabs_v2/RootNavigationRef.native.tsx', ['getRootNavigationRef'], 'RootNavigationRef'),
    (5390, 'stores/GuildMemberCountStore.tsx', ['default', 'getMemberCount', 'getOnlineCount'], 'GuildMemberCountStore'),
    (7212, 'modules/auth/native/components/Login.tsx', ['default', 'LinkButton'], 'Login: Add account screen (Account switcher)'),
    (7434, 'design/components/Icon/native/redesign/generated/CircleCheckIcon.tsx', ['CircleCheckIcon'], 'CircleCheckIcon'),
    (7191, 'design/components/Icon/native/redesign/generated/CircleXIcon.tsx', ['CircleXIcon'], 'CircleXIcon'),
    (5891, 'design/components/Icon/native/redesign/generated/CircleInformationIcon.tsx', ['CircleInformationIcon'], 'CircleInformationIcon'),
    (7345, 'design/components/Icon/native/redesign/generated/EnvelopeIcon.tsx', ['EnvelopeIcon'], 'EnvelopeIcon'),
    (5872, 'design/components/Icon/native/redesign/generated/FriendsIcon.tsx', ['FriendsIcon'], 'FriendsIcon'),
    (5877, 'design/components/Icon/native/redesign/generated/UserPlusIcon.tsx', ['UserPlusIcon'], 'UserPlusIcon'),
    (15123, 'design/components/Icon/native/redesign/generated/NewUserIcon.tsx', ['NewUserIcon'], 'NewUserIcon (Create a new account)'),
    (5883, 'design/components/Icon/native/redesign/generated/LinkIcon.tsx', ['LinkIcon'], 'LinkIcon'),
    (5885, 'design/components/Icon/native/redesign/generated/SendMessageIcon.tsx', ['SendMessageIcon'], 'SendMessageIcon (preview message bar)'),
    (5887, 'design/components/Icon/native/redesign/generated/CopyIcon.tsx', ['CopyIcon'], 'CopyIcon'),
    (5889, 'design/components/Icon/native/redesign/generated/DownloadIcon.tsx', ['DownloadIcon'], 'DownloadIcon'),
    (5894, 'design/components/Icon/native/redesign/generated/TrashIcon.tsx', ['TrashIcon'], 'TrashIcon'),
    (5406, 'modules/action_sheet/native/ActionSheetActionCreators.tsx', ['default', 'ACTION_SHEET_HEIGHT_HALF', 'ACTION_SHEET_HEIGHT_EXPANDED'], 'ActionSheetActionCreators'),
    (5408, 'modules/haptics/HapticUtils.native.tsx', ['HapticFeedbackTypes', 'triggerHapticFeedback'], 'HapticUtils'),
    (5409, 'modules/haptics/HapticFeedbackTypes.tsx', ['IMPACT_LIGHT', 'IMPACT_MEDIUM', 'SELECTION', 'default'], 'HapticFeedbackTypes'),
    (7076, 'design/void/Pressables/native/Pressables.tsx', ['PressableOpacity'], 'PressableOpacity (translate bar, #82)'),
    (5783, 'design/components/Text/native/Text.tsx', ['TextStyleSheet', 'Text', 'Heading'], 'Design Text'),
    (5170, 'design/components/Styles/native/createStyles.tsx', ['experimental_createToken', 'createStyles', 'createLegacyClassComponentStyles'], 'createStyles'),
    (6930, 'stores/ReadStateStore.tsx', ['IS_GUILD_CHANNEL', 'IS_THREAD', 'IS_MENTION_LOW_IMPORTANCE'], 'ReadStateStore'),
    (5927, 'stores/SessionsStore.tsx', ['default'], 'SessionsStore'),
    (5922, 'stores/PresenceStore.tsx', ['default', 'sortActivity'], 'PresenceStore'),
    (5808, 'modules/channel/useChannelName.tsx', ['default', 'computeDefaultGroupDmNameFromUserIds', 'computeDefaultGroupDmName'], 'ChannelNameUtils'),
    (6864, 'modules/read_states/ReadStateConstants.tsx', ['CHANNEL', 'GUILD_EVENT', 'NOTIFICATION_CENTER'], 'ReadStateTypes'),
    (6226, 'stores/MessageStore.tsx', ['default'], 'MessageStore'),
    (6608, 'modules/messages/isMessageMentioned.tsx', ['isRawMessageMentioned', 'isMentioned', 'mention_roles'], 'isMessageMentioned (Message highlights: role mentions)'),
    (6228, 'modules/messages/MessageRecordUtils.tsx', ['createMessageRecord', 'updateServerMessage', 'updateMessageRecord'], 'MessageRecordUtils'),
    (6191, 'design/components/Stack/native/Stack.native.tsx', ['Stack'], 'Stack'),
    (5790, 'design/components/Button/native/Button.native.tsx', ['Button'], 'Button'),
    (6860, 'stores/SortedGuildStore.tsx', ['default', 'GuildsNodeType', 'insertUnsortedGuilds'], 'SortedGuildStore'),
    (6876, '../discord_common/js/shared/shared-constants/AdCreativeType.tsx', ['INVALID', 'QUEST', 'QUEST_HOME_HERO'], 'AdCreativeType'),
    (6884, 'modules/emojis/EmojiStore.tsx', ['Unloaded', 'Loading', 'Loaded'], 'EmojiStore'),
    (6885, 'modules/emojis/RawGuildEmojiStore.tsx', ['default', 'getGuildEmojis'], 'RawGuildEmojiStore'),
    (6925, 'modules/stickers/StickersStore.tsx', ['Unloaded', 'Loaded', 'default'], 'StickersStore'),
    (6926, 'modules/stickers/GuildStickersStore.tsx', ['default', 'getStickersByGuildId'], 'GuildStickersStore'),
    (6990, 'actions/GuildActionCreators.tsx', ['default', 'requestMembersById', 'deleteGuild', 'joinGuild', 'transitionToGuildSync'], 'GuildActionCreators (Preview servers without joining: joinGuild lurker)'),
    (1492, 'utils/native/ImageUtils.tsx', ['default', 'getMobileOptimizedSrc', 'getSrcWithWidthAndHeight'], 'ImageUtils (Load full-quality images)'),
    (8946, 'modules/media_viewer/native/MediaSourceUtil.tsx', ['extractMediaFromAttachment', 'extractMediaFromEmbed', 'extractMediaFromMessageComponents', 'extractMediaSourcesFromMessage', 'extractMediaSourcesFromEmbed', 'extractMediaSourcesFromComponent'], 'MediaSourceUtil (Load full-quality images)'),
    (16620, 'modules/notifications/native/NotificationTokenManager.tsx', ['default'], 'NotificationTokenManager'),
    (17307, 'design/components/Icon/native/redesign/generated/FullscreenEnterIcon.tsx', ['FullscreenEnterIcon'], 'FullscreenEnterIcon (Load full-quality images)'),
    (7585, 'actions/RelationshipActionCreators.tsx', ['default', 'removeFriend', 'removeRelationship'], 'RelationshipActionCreators (Alert when you\'re removed)'),
    (9187, 'modules/guild_settings/GuildSettingsActionCreators.tsx', ['default', 'leaveGuild', 'deleteGuild'], 'GuildSettingsActionCreators (Alert when you\'re removed)'),
    (9188, 'modules/guild_settings/GuildSettingsStore.tsx', ['default', 'EMPTY_METADATA'], 'GuildSettingsStore (Edit servers locally: imports the real GuildStore)'),
    (20098, 'modules/guild_settings/native/GuildSettingsModalLanding.tsx', ['default'], 'GuildSettingsModalLanding (Edit servers locally: imports the real GuildStore)'),
    (6862, 'stores/GuildAvailabilityStore.tsx', ['default', 'isUnavailable'], 'GuildAvailabilityStore (Alert when you\'re removed)'),
    (6123, 'actions/native/AlertActionCreators.tsx', ['default'], 'AlertActionCreators'),
    (6208, 'modules/markup/MarkupChannelMentionRule.tsx', ['default', 'getChannel', 'parseChannel'], 'MarkupChannelMentionRule'),
    (8129, 'design/components/Icon/native/redesign/generated/WarningIcon.tsx', ['WarningIcon'], 'WarningIcon (Risky chip)'),
    (8747, 'design/components/Icon/native/redesign/generated/ChatIcon.tsx', ['ChatIcon'], 'ChatIcon'),
    (8749, 'design/components/Icon/native/redesign/generated/ThreadIcon.tsx', ['ThreadIcon'], 'ThreadIcon (preview channel header)'),
    (8754, 'design/components/Icon/native/redesign/generated/TextLockIcon.tsx', ['TextLockIcon'], 'TextLockIcon'),
    (8756, 'design/components/Icon/native/redesign/generated/TextIcon.tsx', ['TextIcon'], 'TextIcon'),
    (8763, 'design/components/Icon/native/redesign/generated/ImageIcon.tsx', ['ImageIcon'], 'ImageIcon'),
    (8765, 'design/components/Icon/native/redesign/generated/GroupIcon.tsx', ['GroupIcon'], 'GroupIcon'),
    (8766, 'design/components/Icon/native/redesign/generated/AtIcon.tsx', ['AtIcon'], 'AtIcon'),
    (8771, 'design/components/Icon/native/redesign/generated/LockIcon.tsx', ['LockIcon'], 'LockIcon'),
    (8782, 'design/components/Icon/native/redesign/generated/AppsIcon.tsx', ['AppsIcon'], 'AppsIcon'),
    (7001, 'design/components/Icon/native/redesign/generated/ClipboardListIcon.tsx', ['ClipboardListIcon'], 'ClipboardListIcon'),
    (7070, 'design/components/TableRow/native/TableCheckboxRow.native.tsx', ['TableCheckboxRow'], 'TableCheckboxRow'),
    (7071, 'design/components/TableRow/native/TableRow.native.tsx', ['Icon', 'Arrow', 'TrailingText'], 'TableRow'),
    (7073, 'design/components/Card/native/Card.native.tsx', ['Card', 'InternalCard'], 'Card'),
    (7079, 'design/components/TableRow/native/TableRowIcon.native.tsx', ['TableRowIcon'], 'TableRowIcon'),
    (7101, 'design/components/Icon/native/redesign/generated/ArrowLargeLeftIcon.tsx', ['ArrowLargeLeftIcon'], 'ArrowLargeLeftIcon (preview channel header)'),
    (7153, 'design/components/Icon/native/redesign/generated/XSmallIcon.tsx', ['XSmallIcon'], 'XSmallIcon'),
    (7160, 'design/components/TableRow/native/TableRadioRow.native.tsx', ['TableRadioRow'], 'TableRadioRow'),
    (7157, 'design/components/TableRow/native/TableRadioGroup.native.tsx', ['TableRadioGroupContext', 'TableRadioGroup'], 'TableRadioGroup'),
    (7159, 'design/components/TableRow/native/TableRowGroup.native.tsx', ['TableRowGroupTitle', 'TableRowGroup'], 'TableRowGroup'),
    (5424, None, ['BottomSheetScrollView', 'BottomSheetFlatList', 'BottomSheetModal'], '@gorhom/bottom-sheet (Server info sheet scrolling)'),
    (5452, None, ['LegacyScrollView', 'LegacyFlatList', 'LegacyTextInput'], 'react-native-gesture-handler GestureComponents (View raw data sideways scrolling)'),
    (7181, 'design/components/TextInput/native/TextInput.native.tsx', ['TextInput'], 'TextInput'),
    (7492, 'stores/views/PrivateChannelSortStore.tsx', ['default'], 'PrivateChannelSortStore (Read all, more than 20 unread DMs)'),
    (7229, 'design/components/Icon/native/redesign/generated/KeyIcon.tsx', ['KeyIcon'], 'KeyIcon'),
    (7231, 'design/components/Icon/native/redesign/generated/MobilePhoneIcon.tsx', ['MobilePhoneIcon'], 'MobilePhoneIcon'),
    (7195, 'design/components/Icon/native/redesign/generated/EyeSlashIcon.tsx', ['EyeSlashIcon'], 'EyeSlashIcon'),
    (7197, 'design/components/Icon/native/redesign/generated/EyeIcon.tsx', ['EyeIcon'], 'EyeIcon'),
    (7315, 'design/components/Search/native/SearchBar.native.tsx', ['SearchBar'], 'SearchBar'),
    (7316, 'design/components/Icon/native/redesign/generated/MagnifyingGlassIcon.tsx', ['MagnifyingGlassIcon'], 'MagnifyingGlassIcon'),
    (7375, 'actions/ReadStateActionCreators.tsx', ['ack', 'ackCategory', 'ackChannel'], 'ReadStateActionCreators'),
    (7396, 'modules/emojis/native/Emoji.tsx', ['default'], 'Emoji'),
    (7399, 'design/components/Icon/native/redesign/generated/CheckmarkSmallIcon.tsx', ['CheckmarkSmallIcon'], 'CheckmarkSmallIcon'),
    (7415, 'design/components/Sheet/native/BottomSheetTitleHeader.native.tsx', ['BottomSheetTitleHeader'], 'BottomSheetTitleHeader'),
    (7454, None, ['Clipboard', 'Platform', 'addListener'], 'Clipboard'),
    (7456, 'modules/action_sheet/native/showSimpleActionSheet.tsx', ['showSimpleActionSheet'], 'SimpleActionSheet'),
    (7460, 'design/components/Sheet/native/ActionSheetCloseButton.native.tsx', ['ActionSheetCloseButton'], 'ActionSheetCloseButton'),
    (7462, 'design/components/TableRow/native/TableSwitchRow.native.tsx', ['TableSwitchRow'], 'TableSwitchRow'),
    (7463, 'design/components/Forms/native/FormSwitch.native.tsx', ['FormSwitch'], 'FormSwitch'),
    (7459, 'design/components/Sheet/native/ActionSheet.native.tsx', ['ActionSheet'], 'ActionSheet'),
    (7471, 'design/components/Icon/native/redesign/generated/ChevronSmallRightIcon.tsx', ['ChevronSmallRightIcon'], 'ChevronSmallRightIcon'),
    (7548, 'actions/GuildSubscriptionsActionCreators.tsx', ['subscribeGuild'], 'GuildSubscriptionsActionCreators'),
    (7621, 'modules/stickers/StickerSendability.tsx', ['SENDABLE', 'SENDABLE_WITH_PREMIUM', 'NONSENDABLE'], 'StickerUtils'),
    (7666, 'design/components/Icon/native/redesign/generated/SettingsIcon.tsx', ['SettingsIcon'], 'SettingsIcon'),
    (7668, 'modules/user_settings/core/native/openUserSettings.tsx', ['openUserSettings'], 'UserSettingsActionCreators'),
    (7745, 'actions/MessageActionCreators.tsx', ['default'], 'MessageActionCreators'),
    (8041, 'utils/native/PrivateChannelCallUtils.tsx', ['openGuildVoiceModal', 'navigateToVoiceChannel', 'openChannelCallModal'], 'PrivateChannelCallUtils (Hidden channels asks before a locked voice channel opens)'),
    (9013, 'modules/icymi/ICYMIStore.tsx', ['ICYMIStore'], 'ICYMIStore (Hidden channels keeps its real VIEW_CHANNEL answers)'),
    (15939, 'modules/guilds_bar/GuildMediaStateStore.tsx', ['GuildMediaStateStore'], 'GuildMediaStateStore (Hidden channels keeps its real VIEW_CHANNEL answers)'),
    (18492, 'modules/main_tabs_v2/native/shared_components/happening_now/useHappeningNowData.tsx', ['HappeningNowItem', 'MemberListRowTypes'], 'useHappeningNowData (Hidden channels keeps its real VIEW_CHANNEL answers)'),
    (6943, 'modules/guild_scheduled_events/GuildScheduledEventStore.tsx', ['default', 'getGuildScheduledEventsForGuild'], 'GuildScheduledEventStore'),
    (7816, 'modules/guild_sidebar/ChannelListState.tsx', ['CannotShow', 'DoNotShow', 'WouldShowIfUncollapsed'], 'useGuildChannelsList'),
    (6974, 'stores/GuildReadStateStore.tsx', ['default'], 'GuildReadStateStore'),
    (7933, 'modules/messages/MessageParser.tsx', ['default', 'parseAndRebuild', 'createParserState'], 'MessageParser'),
    (7940, 'modules/chat/SlowmodeUtils.tsx', ['canBypassSlowmode', 'canBypassSlowmodeHelper', 'useCanBypassSlowmode'], 'SlowmodeUtils'),
    (7951, 'modules/quests/utils/QuestDataUtils.tsx', ['THIRTY_DAYS_MS', 'earnedDecisionIsValid', 'findQuestOrReplacement'], 'QuestDataUtils'),
    (7955, 'modules/quests/QuestStore.tsx', ['default'], 'QuestStore'),
    (7964, 'modules/quests/utils/QuestServerUtils.tsx', ['isQuestWithKnownConfigVersion', 'questConfigFromServer', 'questUserStatusFromServer'], 'questUserStatusFromServer'),
    (8314, 'utils/UploadUtils.tsx', ['MAX_TOTAL_ATTACHMENT_SIZE', 'MAX_TOTAL_ATTACHMENT_SIZE_1GB', 'MAX_TOTAL_ATTACHMENT_SIZE_MB'], 'AttachmentUtils'),
    (9745, 'modules/main_tabs_v2/native/tabs/you/YouBannerDecorations.tsx', ['default'], 'YouBannerDecorations (Hide extra buttons: profile pill)'),
    (10362, 'modules/foreground_service/mobile/ForegroundServiceManager.android.tsx', ['default'], 'ForegroundServiceManager'),
    (8311, 'lib/uploader/CloudUpload.tsx', ['NOT_STARTED', 'STARTED', 'UPLOADING'], 'CloudUpload'),
    (8333, 'modules/media_uploads/native/VideoUploadUtils.tsx', ['calculateOptimalBitrate', 'calculateTargetDimensions', 'canSkipVideoTranscode'], 'VideoUploadUtils (Compress big files: video bitrate and size)'),
    (8334, 'modules/media_uploads/UploadLimits.tsx', ['FREE_UPLOAD_LIMIT_BYTES', 'getEffectiveUploadLimit'], 'UploadLimits (Compress big files)'),
    (8344, 'lib/uploader/UploadTargets.tsx', ['getUploadTarget'], 'UploadTargets (Compress big files: the limit for this chat)'),
    (10366, 'lib/uploader/native/getPreCompressionFileSize.tsx', ['getPreCompressionFileSize'], 'getPreCompressionFileSize (Compress big files: size gate)'),
    (12429, 'design/components/Icon/native/redesign/generated/FileUpIcon.tsx', ['FileUpIcon'], 'FileUpIcon (Compress big files)'),
    (10909, 'design/components/Icon/native/redesign/generated/MusicIcon.tsx', ['MusicIcon'], 'MusicIcon (Compress big files)'),
    (8343, 'lib/uploader/native/CloudUploaderUtils.tsx', ['default', 'prepareMessagePayload', 'getUploadPayload'], 'CloudUploaderUtils (Anonymous file names)'),
    (9986, 'design/components/Icon/native/redesign/generated/PhoneCallIcon.tsx', ['PhoneCallIcon'], 'PhoneCallIcon'),
    (10006, 'design/components/Icon/native/redesign/generated/PaperIcon.tsx', ['PaperIcon'], 'PaperIcon'),
    (10023, 'design/components/Icon/native/redesign/generated/ThumbsUpIcon.tsx', ['ThumbsUpIcon'], 'ThumbsUpIcon'),
    (9879, 'design/components/Icon/native/redesign/generated/MoreHorizontalIcon.tsx', ['MoreHorizontalIcon'], 'MoreHorizontalIcon (preview server header)'),
    (8481, 'modules/messages/native/renderer/RowGenerator.tsx', ['default'], 'RowGenerator'),
    (8530, 'modules/double_tap_to_react/native/DoubleTapToReactUtils.tsx', ['getFallbackDoubleTapDisambiguatedEmoji', 'reactionEmojiFromSettingsValue', 'disambiguatedEmojiFromSettingsValue'], 'DoubleTapToReactUtils'),
    (8537, 'modules/replies/canReplyToMessage.tsx', ['useCanReplyToMessage', 'canReplyToMessage'], 'canReplyToMessage'),
    (8854, 'modules/user_profile/native/showUserProfileActionSheet.tsx', ['default', 'showUserProfileActionSheet'], 'showUserProfileActionSheet'),
    (8856, 'actions/UserActionCreators.tsx', ['fetchCurrentUser', 'acceptAgreements', 'setFlag'], 'UserActionCreators'),
    (8955, 'design/components/Icon/native/redesign/generated/PlayIcon.tsx', ['PlayIcon'], 'PlayIcon (preview Watch button)'),
    (8957, 'design/components/Icon/native/redesign/generated/PauseIcon.tsx', ['PauseIcon'], 'PauseIcon (preview player)'),
    (8264, 'design/components/Icon/native/redesign/generated/LinkExternalSmallIcon.tsx', ['LinkExternalSmallIcon'], 'LinkExternalSmallIcon'),
    (9645, 'design/components/Icon/native/redesign/generated/NitroWheelIcon.tsx', ['NitroWheelIcon'], 'NitroWheelIcon'),
    (9566, 'design/components/Icon/native/redesign/generated/ReactionIcon.tsx', ['ReactionIcon'], 'ReactionIcon'),
    (9686, 'design/components/Icon/native/redesign/generated/TagIcon.tsx', ['TagIcon'], 'TagIcon'),
    (9163, 'design/components/Icon/native/redesign/generated/GlobeEarthIcon.tsx', ['GlobeEarthIcon'], 'GlobeEarthIcon'),
    (10684, 'design/components/Icon/native/redesign/generated/PollsIcon.tsx', ['PollsIcon'], 'PollsIcon (Hide extra buttons)'),
    (10690, 'modules/media_keyboard/native/components/MediaKeyboardBottomSheetActions.tsx', ['default'], 'MediaKeyboardBottomSheetActions (Hide extra buttons: attach menu)'),
    (12703, 'design/components/Icon/native/redesign/generated/ShopIcon.tsx', ['ShopIcon'], 'ShopIcon (Hide extra buttons)'),
    (15257, 'design/components/Icon/native/redesign/generated/QuoteIcon.tsx', ['QuoteIcon'], 'QuoteIcon'),
    (11063, 'modules/oauth2/native/OAuth2AuthorizeModal.tsx', ['default'], 'OAuth2AuthorizeModal'),
    (9850, 'design/components/Icon/native/redesign/generated/GameControllerIcon.tsx', ['GameControllerIcon'], 'GameControllerIcon'),
    (9881, 'design/components/Icon/native/redesign/generated/ServerIcon.tsx', ['ServerIcon'], 'ServerIcon'),
    (12423, 'design/components/Icon/native/redesign/generated/RefreshIcon.tsx', ['RefreshIcon'], 'RefreshIcon'),
    (12314, 'design/components/Icon/native/redesign/generated/ImagePlusIcon.tsx', ['ImagePlusIcon'], 'ImagePlusIcon'),
    (10962, 'design/components/Icon/native/redesign/generated/ArrowSmallRightIcon.tsx', ['ArrowSmallRightIcon'], 'ArrowSmallRightIcon'),
    (9898, 'modules/messages/useMessageMaxLength.tsx', ['default', 'getMaxMessageLength'], 'useMessageMaxLength'),
    (10357, 'modules/forums/native/composer/ForumComposer.tsx', ['default'], 'ForumComposer (Send long messages keeps the real limit)'),
    (14862, 'modules/scheduled_messages/native/ScheduledMessageEditContentModal.tsx', ['default'], 'ScheduledMessageEditContentModal (Send long messages keeps the real limit)'),
    (10134, 'modules/app_icons/native/AppIconConstants.tsx', ['getDefaultIcon', 'getOfficialAlternateIcons', 'getLimitedAlternateIcons'], 'AppIconConstants'),
    (10071, 'design/components/Icon/native/redesign/generated/UploadIcon.tsx', ['UploadIcon'], 'UploadIcon'),
    (8279, 'design/void/Form/native/index.tsx', ['Form', 'FormArrow', 'FormCheckbox'], 'Form'),
    (11453, 'design/components/Icon/native/redesign/generated/ShieldIcon.tsx', ['ShieldIcon'], 'ShieldIcon'),
    (14878, 'design/components/Icon/native/redesign/generated/ChatSmileIcon.tsx', ['ChatSmileIcon'], 'ChatSmileIcon'),
    (11072, 'lib/pushnotification/PushNotification.tsx', ['default'], 'PushNotification'),
    (8065, '../discord_common/js/packages/rtn-codegen/js/NativePermissionManagerModule.tsx', ['default'], 'NativePermissionManagerModule'),
    (10050, 'modules/chat_input/native/useChatBottomManagerUIStore.tsx', ['default', 'updateChatInputContainerHeight', 'updateShowingAutoComplete'], 'ChatInputHeightContext'),
    (9172, 'design/components/Icon/native/redesign/generated/ShieldUserIcon.tsx', ['ShieldUserIcon'], 'ShieldUserIcon'),
    (9321, 'design/components/Icon/native/redesign/generated/BellIcon.tsx', ['BellIcon'], 'BellIcon'),
    (9228, 'design/components/Icon/native/redesign/generated/CalendarIcon.tsx', ['CalendarIcon'], 'CalendarIcon'),
    (9345, 'modules/voice_panel/native/shared/FormComponents.tsx', ['VoicePanelFormSection', 'MemberRowItem'], 'VoiceChannelMembers'),
    (12078, 'design/components/Icon/native/redesign/generated/DoorExitIcon.tsx', ['DoorExitIcon'], 'DoorExitIcon'),
    (11360, 'design/components/Icon/native/redesign/generated/HandRequestSpeakIcon.tsx', ['HandRequestSpeakIcon'], 'HandRequestSpeakIcon (preview Try it button)'),
    (12127, 'design/components/Icon/native/redesign/generated/ImageSparkleIcon.tsx', ['ImageSparkleIcon'], 'ImageSparkleIcon (Icon packs)'),
    (10441, 'modules/premium/components/native/NitroUpsellButton.tsx', ['default'], 'NitroUpsellButton'),
    (12170, 'design/components/Icon/native/redesign/generated/MicrophoneIcon.tsx', ['MicrophoneIcon'], 'MicrophoneIcon (preview message bar)'),
    (12253, 'design/components/ThemeContextProvider/native/RootThemeContextProvider.native.tsx', ['RootThemeContextProvider', 'DisableCustomTheme'], 'RootThemeContextProvider (Custom themes re-keys its memoized context)'),
    (11407, 'modules/chat/native/ChatViewWrapper.tsx', ['default'], 'ChatViewWrapper'),
    (11154, 'design/components/Icon/native/redesign/generated/BellSlashIcon.tsx', ['BellSlashIcon'], 'BellSlashIcon'),
    (11336, 'design/components/Icon/native/redesign/generated/BellZIcon.tsx', ['BellZIcon'], 'BellZIcon (Banners in Do Not Disturb)'),
    (10105, 'modules/double_tap_to_react/native/DoubleTapReminderToast.tsx', ['maybeShowDoubleTapReminderToast'], 'DoubleTapReminderToast'),
    (10216, 'design/components/Icon/native/redesign/generated/StarIcon.tsx', ['StarIcon'], 'StarIcon'),
    (10244, 'design/components/Icon/native/redesign/generated/BackspaceIcon.tsx', ['BackspaceIcon'], 'BackspaceIcon'),
    (9806, 'modules/quests/QuestActionCreators.tsx', ['SUCCESS', 'UNKNOWN_ERROR', 'fetchCurrentQuests'], 'QuestActionCreators'),
    (10383, 'design/components/Icon/native/redesign/generated/PencilIcon.tsx', ['PencilIcon'], 'PencilIcon'),
    (10395, 'actions/GIFPickerActionCreators.tsx', ['trackSearchStart', 'trackSearchResultViewed', 'search'], 'GIFPickerActionCreators'),
    (10398, 'modules/gif_picker/native/GIFPickerUtils.tsx', ['GIF_HEADER_HEIGHT', 'useFavoriteGIFsMobile', 'GIF_PICKER_ITEM_ESIMTATED_HEIGHT'], 'useFavoriteGIFsMobile'),
    (10675, 'design/components/Icon/native/redesign/generated/IdIcon.tsx', ['IdIcon'], 'IdIcon'),
    (10686, 'design/components/Icon/native/redesign/generated/AttachmentIcon.tsx', ['AttachmentIcon'], 'AttachmentIcon'),
    (10889, 'modules/main_tabs_v2/native/shared_components/user_list/UserRow.tsx', ['CALL', 'MESSAGE', 'ACCEPT'], 'UserRow'),
    (10921, 'design/components/Icon/native/redesign/generated/CrownIcon.tsx', ['CrownIcon'], 'CrownIcon'),
    (10956, 'design/components/Icon/native/redesign/generated/UserCircleIcon.tsx', ['UserCircleIcon'], 'UserCircleIcon'),
    (10979, 'design/components/Icon/native/redesign/generated/PlusLargeIcon.tsx', ['PlusLargeIcon'], 'PlusLargeIcon (preview message bar)'),
    (11141, 'design/components/Icon/native/redesign/generated/PinIcon.tsx', ['PinIcon'], 'PinIcon (Icon packs preview)'),
    (13629, 'design/components/Icon/native/redesign/generated/GiftIcon.tsx', ['GiftIcon'], 'GiftIcon'),
    (11586, 'modules/user_profile/native/UserProfilePrimaryInfo.tsx', ['default', 'DisplayName', 'UserTagAndPronouns'], 'UserProfileHeaderName'),
    (11587, 'design/components/Icon/native/redesign/generated/ChevronSmallDownIcon.tsx', ['ChevronSmallDownIcon'], 'ChevronSmallDownIcon (preview channel category)'),
    (11670, 'modules/profile_customization/native/BioText.tsx', ['default'], 'UserProfileBio'),
    (11264, None, ['pick', 'saveDocuments', 'keepLocalCopy', 'errorCodes', 'isErrorWithCode', 'types'], 'DocumentPicker (Backup and restore, 1.16.0)'),
    (14794, 'design/components/Icon/native/redesign/generated/KeyboardIcon.tsx', ['KeyboardIcon'], 'KeyboardIcon'),
    (11523, 'design/components/Icon/native/redesign/generated/ArrowLargeUpIcon.tsx', ['ArrowLargeUpIcon'], 'ArrowLargeUpIcon'),
    (11717, 'modules/settings/native/renderer/SettingBuilders.tsx', ['createToggle', 'createStatic', 'createRoute'], 'createSettingsList'),
    (11763, 'modules/messages/native/MessagesHandlers.tsx', ['MessagesHandlers'], 'MessagesHandlers'),
    (11832, 'design/components/Icon/native/redesign/generated/TimerIcon.tsx', ['TimerIcon'], 'TimerIcon'),
    (11204, 'design/components/Icon/native/redesign/generated/VideoIcon.tsx', ['VideoIcon'], 'VideoIcon'),
    (10340, 'modules/messages/native/long_press/LongPressMessageActionSheet.tsx', ['default'], 'LongPressMessageActionSheet'),
    (14805, 'modules/action_sheet/native/components/EmojiRow.tsx', ['default'], 'EmojiRow (Remove anything: quick reactions in the message menu)'),
    (13656, 'design/components/Icon/native/redesign/generated/ArrowAngleRightUpIcon.tsx', ['ArrowAngleRightUpIcon'], 'ArrowAngleRightUpIcon (Remove anything: Forward)'),
    (11150, 'design/components/Icon/native/redesign/generated/ChatMarkUnreadIcon.tsx', ['ChatMarkUnreadIcon'], 'ChatMarkUnreadIcon (Remove anything: Mark Unread)'),
    (14815, 'design/components/Icon/native/redesign/generated/BookmarkOutlineIcon.tsx', ['BookmarkOutlineIcon'], 'BookmarkOutlineIcon (Remove anything: Bookmark Message)'),
    (8770, 'design/components/Icon/native/redesign/generated/AnnouncementsIcon.tsx', ['AnnouncementsIcon'], 'AnnouncementsIcon (Remove anything: Publish)'),
    (10237, 'design/components/Icon/native/redesign/generated/FlagIcon.tsx', ['FlagIcon'], 'FlagIcon (Remove anything: Report)'),
    (10350, 'modules/messages/native/long_press/LongPressMessageActionSheetUtils.tsx', ['getContextBarCancelReason', 'handleEdit', 'handleCreateThread'], 'LongPressMessageActionSheetUtils'),
    (11864, 'modules/replies/native/replyToMessage.tsx', ['default'], 'replyToMessage'),
    (14808, 'modules/double_tap_to_react/native/DoubleTapEmojiEditNudge.tsx', ['DoubleTapEmojiEditNudge'], 'DoubleTapEmojiEditNudge'),
    (11247, 'design/components/Icon/native/redesign/generated/RetryIcon.tsx', ['RetryIcon'], 'RetryIcon (preview Start over / New people)'),
    (12981, 'design/components/Icon/native/redesign/generated/ArrowAngleLeftUpIcon.tsx', ['ArrowAngleLeftUpIcon'], 'ArrowAngleLeftUpIcon'),
    (11865, 'modules/messages/canEditMessage.tsx', ['default'], 'canEditMessage'),
    (12318, 'design/components/Icon/native/redesign/generated/UserIcon.tsx', ['UserIcon'], 'UserIcon'),
    (14019, 'actions/TypingActionCreators.tsx', ['default'], 'TypingActionCreators'),
    (12717, 'design/components/Icon/native/redesign/generated/ArrowsUpDownIcon.tsx', ['ArrowsUpDownIcon'], 'ArrowsUpDownIcon'),
    (14062, 'modules/chat_input/native/action_buttons/ChatInputActions.tsx', ['displayName', 'default'], 'ChatInputSendAndGiftButton'),
    (14090, 'components_native/chat/JumpToPresentButton.tsx', ['default'], 'JumpToPresentButton'),
    (14091, 'modules/chat_input/native/ChatFloatingNavButton.tsx', ['default'], 'JumpToPresentPill'),
    (1118, None, ['__packager_asset', 'registerAsset'], 'JumpToPresent arrow asset'),
    (14104, 'modules/double_tap_to_react/native/DoubleTapToReactChatInputBanner.tsx', ['DoubleTapToReactChatInputBanner'], 'DoubleTapToReactChatInputBanner'),
    (14242, 'actions/native/PushNotificationActionCreators.tsx', ['default', 'setPushPermissionState'], 'PushNotificationActionCreators'),
    (14243, 'modules/multi_account/MultiAccountStore.tsx', ['INVALID', 'VALIDATING', 'VALID'], 'MultiAccountStore'),
    (14244, 'modules/multi_account/Constants.tsx', ['YOU_ACCOUNT_ACTION_SHEET', 'CHOOSE_ACCOUNT', 'MANAGE_ACCOUNTS_MODAL'], 'MultiAccountConstants'),
    (14245, 'modules/user/isStaffFromRawUser.tsx', ['default'], 'isStaffFromRawUser'),
    (14247, 'modules/multi_account/MultiAccountActionCreators.tsx', ['validateMultiAccountTokens', 'switchAccount', 'moveAccount'], 'MultiAccountActionCreators'),
    (14261, 'modules/chat_input/native/action_buttons/ChatInputRightActions.tsx', ['displayName', 'default'], 'ChatInputGiftButton'),
    (14297, 'design/components/Icon/native/redesign/generated/ChatWarningIcon.tsx', ['ChatWarningIcon'], 'ChatWarningIcon'),
    (11206, 'design/components/Icon/native/redesign/generated/StickerIcon.tsx', ['StickerIcon'], 'StickerIcon'),
    (14427, 'design/components/Icon/native/redesign/generated/BoostTier1Icon.tsx', ['BoostTier1Icon'], 'BoostTier1Icon'),
    (11224, 'design/components/Icon/native/redesign/generated/WaveformIcon.tsx', ['WaveformIcon'], 'WaveformIcon'),
    (11676, 'design/components/Icon/native/redesign/generated/SlashBoxIcon.tsx', ['SlashBoxIcon'], 'SlashBoxIcon (Clean channel names)'),
    (11137, 'design/components/Icon/native/redesign/generated/MagicWandIcon.tsx', ['MagicWandIcon'], 'MagicWandIcon'),
    (15040, 'modules/media_viewer/native/components/overlay/MediaViewerOverlayButtonFavoriteGIF.tsx', ['default'], 'MediaViewerHeader'),
    (15146, 'modules/user_profile/native/UserProfileActivityVoiceChannelUsers.tsx', ['default'], 'UserProfileActivityVoiceChannelUsers'),
    (15171, 'modules/user_profile/native/UserProfileNote.tsx', ['default'], 'UserProfileNote'),
    (15316, 'modules/user_profile/native/UserProfileContactButtons.tsx', ['default'], 'UserProfileContactButtons'),
    (8131, 'design/components/Button/native/IconButton.native.tsx', ['IconButton'], 'IconButton (Remove anything: Messages header search / new message)'),
    (10919, 'design/components/Icon/native/redesign/generated/XLargeIcon.tsx', ['XLargeIcon'], 'XLargeIcon (Remove anything icon)'),
    (11532, 'design/components/Icon/native/redesign/generated/XSmallBoldIcon.tsx', ['XSmallBoldIcon'], 'XSmallBoldIcon (Remove anything: red X badge)'),
    (12381, 'design/components/Icon/native/redesign/generated/UndoIcon.tsx', ['UndoIcon'], 'UndoIcon (Remove anything: bring everything back)'),
    (10029, 'design/components/ContextMenu/native/ContextMenu.native.tsx', ['ContextMenu'], 'ContextMenu (Remove anything: attach button wrapper)'),
    (14065, 'modules/media_keyboard/native/MediaKeyboardButtonIcon.tsx', ['MediaKeyboardButtonIcon'], 'MediaKeyboardButtonIcon (Remove anything: attach button)'),
    (15076, 'modules/user_profile/native/UserProfileOverflowMenu.tsx', ['default'], 'UserProfileOverflowMenu (Remove anything: profile menu items)'),
    (16781, 'modules/settings/native/renderer/SettingHookHarness.tsx', ['default', 'getCachedSettingTitle', 'getCachedSettingSearchTerms'], 'SettingHookHarness (Remove anything: setting titles)'),
    (16782, 'modules/settings/native/renderer/stores/SettingBlocklistStore.tsx', ['default'], 'SettingBlocklistStore (Remove anything: redraws Settings)'),
    (16939, 'modules/settings/native/renderer/SettingRenderer.tsx', ['GuildSelectDefaultIcon', 'renderSettingItem', 'renderSettingSearchResultItem', 'renderSettingSearchResultPlaceholderItem'], 'SettingRenderer (Remove anything: marks Settings rows)'),
    (14066, 'modules/chat_input/native/action_buttons/ChatInputActionButtonApps.tsx', ['default'], 'ChatInputActionButtonApps (Remove anything: Apps button)'),
    (14070, 'modules/chat_input/native/action_buttons/ChatInputActionButtonGiftOrThread.tsx', ['default'], 'ChatInputActionButtonGiftOrThread (Remove anything: gift/thread button)'),
    (14078, 'modules/chat_input/native/accessories/ChatInputSendButton.tsx', ['default'], 'ChatInputSendButton (Remove anything: canSendVoiceMessage)'),
    (14079, 'modules/voice_messages/native/components/VoiceMessageButton.tsx', ['default'], 'VoiceMessageButton (Remove anything: voice message button)'),
    (14832, 'modules/main_tabs_v2/native/channel/header/PrivateChannelButtons.tsx', ['default'], 'PrivateChannelButtons (Remove anything: DM call / video / search)'),
    (16759, 'components_native/AppContainer.tsx', ['default'], 'AppContainer (Remove anything: removal mode bar)'),
    (18457, 'modules/main_tabs_v2/native/tabs/messages/MessagesHeader.tsx', ['default', 'getMessagesHeaderHeight'], 'MessagesHeader (Remove anything: Messages tab buttons)'),
    (18458, 'modules/main_tabs_v2/native/shared_components/MessageRequestsButton.tsx', ['default'], 'MessageRequestsButton (Remove anything: message requests)'),
    (16199, 'design/components/ContextMenu/native/ContextMenuItem.native.tsx', ['ContextMenuItem'], 'ContextMenuItem (Remove anything: marks profile menu items)'),
    (10030, 'design/components/ContextMenu/native/ContextMenuState.native.tsx', ['hideContextMenu'], 'ContextMenuState (Remove anything: closes the menu before asking)'),
    (9092, 'design/components/SegmentedControl/native/SegmentedControlState.native.tsx', ['useSegmentedControlState'], 'SegmentedControlState (Remove anything: profile tabs)'),
    (9328, 'design/components/SegmentedControl/native/SegmentedControlItem.native.tsx', ['SegmentedControlItem'], 'SegmentedControlItem (Remove anything: marks profile tabs)'),
    (14111, 'modules/channel_list_v2/native/components/GuildSearchAndInvite.tsx', ['default'], 'GuildSearchAndInvite (Remove anything: Search / Invite / Events)'),
    (16139, 'modules/guild_action_sheet/native/components/GuildActionSheetHeader.tsx', ['default'], 'GuildActionSheetHeader (Remove anything: Community Server pill)'),
    (16145, 'modules/guild_action_sheet/native/components/GuildActionSheetTabItems.tsx', ['default'], 'GuildActionSheetTabItems (Remove anything: Boost / Invite / Notifications)'),
    (16075, 'modules/guild_action_sheet/native/components/GuildActionSheetActions.tsx', ['GuildUnreadAction', 'GuildActionSheetSecondaryActions'], 'GuildActionSheetActions (Remove anything: server menu rows)'),
    (16149, 'modules/guild_action_sheet/native/components/GuildActionSheetEmojiSection.tsx', ['default'], 'GuildActionSheetEmojiSection (Remove anything: Server Emoji)'),
    (10075, 'design/components/Icon/native/redesign/generated/BoostGemIcon.tsx', ['BoostGemIcon'], 'BoostGemIcon (Remove anything: Boost button in the server menu)'),
    (12374, 'design/components/Tabs/native/Tabs.native.tsx', ['Tabs'], 'Tabs (Remove anything: profile tab bar)'),
    (12375, 'design/components/Tabs/native/TabItem.native.tsx', ['TabItem'], 'TabItem (Remove anything: marks Activity / Wishlist)'),
    (15309, 'modules/user_profile/native/UserProfileMutuals.tsx', ['default'], 'UserProfileMutuals (Remove anything: mutual servers)'),
    (11669, 'modules/user_profile/native/UserProfileAboutMeCard.tsx', ['default', 'a6XYD9'], 'UserProfileAboutMeCard (Remove anything: Member Since dates)'),
    (7448, 'modules/user_profile/native/UserProfileRolesCard.tsx', ['default'], 'UserProfileRolesCard (Remove anything: Roles)'),
    (15290, 'modules/user_profile/native/UserProfileConnections.tsx', ['UserProfileAccountConnectionsCard'], 'UserProfileConnections (Remove anything: Connections)'),
    (18456, 'modules/main_tabs_v2/native/tabs/messages/useMessagesSpecs.tsx', ['default', 'headerSize'], 'useMessagesSpecs (Remove anything: Messages header closes up)'),
    (18561, 'modules/channel_list_v2/native/RedesignGuildHeader.tsx', ['useRedesignGuildHeaderHeight'], 'RedesignGuildHeader (Remove anything: channel list header closes up)'),
    (14312, 'components_native/chat/ChatBeginningRow.tsx', ['default'], 'ChatBeginningRow (Remove anything: bot DM Mute / Deauthorize / Report Spam)'),
    (12741, 'modules/chat_input/native/accessories/ChatInputExpressionButton.tsx', ['default'], 'ChatInputExpressionButton (Remove anything: emoji button)'),
    (11569, 'modules/user_profile/native/UserProfileCustomStatusBubble.tsx', ['default'], 'UserProfileCustomStatusBubble (Remove anything: your status bubble)'),
    (19290, 'modules/user_profile/native/UserProfileYourFriendsCard.tsx', ['default'], 'UserProfileYourFriendsCard (Remove anything: Friends)'),
    (18065, 'modules/virtual_currency/native/BalanceWidgetMenu.tsx', ['default'], 'BalanceWidgetMenu (Remove anything: Orbs Balance)'),
    (18563, 'modules/channel_list_v2/native/components/ChannelListStickyHeader.tsx', ['default'], 'ChannelListStickyHeader (Remove anything: member count / Community)'),
    (19204, 'modules/main_tabs_v2/native/sidebar/details/header_v2/ChannelDetailsNavigationBar.tsx', ['default'], 'ChannelDetailsNavigationBar (Remove anything: details search / mute / settings / more)'),
    (19192, 'modules/search/native/components/tabs/hooks/useSearchSegmentedControlState.tsx', ['useSearchSegmentedControlState'], 'useSearchSegmentedControlState (Remove anything: details tabs)'),
    (11812, 'modules/main_tabs_v2/native/shared_components/user_list/useMemberListAction.tsx', ['default'], 'useMemberListAction (Remove anything: New Group)'),
    (9649, 'design/components/Icon/native/redesign/generated/OrbsIcon.tsx', ['OrbsIcon'], 'OrbsIcon'),
    (8750, 'design/components/Icon/native/redesign/generated/FolderIcon.tsx', ['FolderIcon'], 'FolderIcon'),
    (11827, 'design/components/Icon/native/redesign/generated/ChatPlusIcon.tsx', ['ChatPlusIcon'], 'ChatPlusIcon'),
    (6944, 'modules/message_request/MessageRequestStore.tsx', ['getMessageRequestsCount'], 'MessageRequestStore (Remove anything: message requests count)'),
    (6945, 'modules/message_request/SpamMessageRequestStore.tsx', ['getSpamChannelsCount'], 'SpamMessageRequestStore (Remove anything: message requests count)'),
    (5796, 'design/components/Button/native/ButtonConstants.native.tsx', ['SMALL_BUTTON_HEIGHT'], 'ButtonConstants (Remove anything: header row height)'),
    (5914, 'modules/channel_list_v2/native/RedesignChannelListConstants.tsx', ['SEARCH_BAR_MARGIN_BOTTOM'], 'RedesignChannelListConstants (Remove anything: search row margin)'),
    (10836, 'design/components/Icon/native/redesign/generated/ClydeIcon.tsx', ['ClydeIcon'], 'ClydeIcon (Remove anything: Discord join date)'),
    (14840, 'modules/main_tabs_v2/native/channel/header/PrivateChannelHeader.tsx', ['default'], 'PrivateChannelHeader'),
    (15729, 'design/components/Icon/native/redesign/generated/BoostTier3Icon.tsx', ['BoostTier3Icon'], 'BoostTier3Icon'),
    (15843, 'modules/gateway/GatewaySocketSingleton.tsx', ['handleIdentify', 'socket', 'localPresenceState'], 'GatewaySocketSingleton'),
    (15878, 'modules/gateway/PauseGatewaySocket.tsx', ['getIsPaused', 'setIsPaused'], 'PauseGatewaySocket'),
    (15983, 'stores/PrivateChannelReadStateStore.tsx', ['default'], 'PrivateChannelReadStateStore'),
    (6972, 'modules/message_request/MessageRequestUtils.tsx', ['filterOutMessageRequestsAndSpam', 'filterOutMessageRequestsAndSpamById', 'isMessageRequestOrSpamRequest'], 'MessageRequestUtils'),
    (16126, 'modules/guild/markGuildsAsRead.tsx', ['default'], 'markGuildsAsRead'),
    (16146, 'modules/guild_action_sheet/native/components/GuildActionSheetProgress.tsx', ['default'], 'GuildActionSheetJoinRequestRow'),
    (16217, 'modules/premium/ProductCatalog.tsx', ['ANIMATED_EMOJIS', 'EMOJIS_EVERYWHERE', 'STICKERS_EVERYWHERE', 'CLIENT_THEMES'], 'EmojiPermissions'),
    (16331, 'design/void/Status/native/Status.tsx', ['default', 'StatusWithTyping'], 'Status'),
    (16201, 'design/components/ContextMenu/native/ContextMenuPopout.native.tsx', ['ContextMenuPopout'], 'ContextMenuPopout'),
    (16783, 'modules/user_settings/core/native/SettingsRendererConfig.tsx', ['SETTING_RENDERER_CONFIG'], 'SettingRendererConfig'),
    (16794, 'modules/color_picker/native/showCustomColorPickerActionSheet.tsx', ['CUSTOM_COLOR_PICKER_KEY', 'CustomColorPicker'], 'showCustomColorPickerActionSheet'),
    (16937, 'modules/settings/native/renderer/SettingListRenderer.tsx', ['SettingsList', 'SearchableSettingsList'], 'SettingsList'),
    (16940, 'modules/settings/native/renderer/SettingRendererUtils.tsx', ['onRouteSettingOnPress', 'getSettingTitle', 'getSettingSearchableTitles'], 'SettingScreens'),
    (17213, 'design/components/Icon/native/redesign/generated/LaptopPhoneIcon.tsx', ['LaptopPhoneIcon'], 'LaptopPhoneIcon'),
    (19309, 'design/components/Icon/native/redesign/generated/PuzzlePieceIcon.tsx', ['PuzzlePieceIcon'], 'PuzzlePieceIcon'),
    (14983, 'design/components/Icon/native/redesign/generated/QuestsIcon.tsx', ['QuestsIcon'], 'QuestsIcon'),
    (17422, 'modules/quests/native/QuestHooks.native.tsx', ['useMobileQuestDockHeight', 'useMobileQuestDock', 'useIsMobileQuestDockVisibleToUser'], 'useMobileQuestDock'),
    (17430, 'modules/main_tabs_v2/native/you_bar/YouBarConstants.tsx', ['CONNECTION_BANNER_HEIGHT', 'YOU_BAR_SPRING_CONFIG', 'YOU_BAR_PADDING'], 'YouBarConstants'),
    (17511, 'modules/quests/native/QuestDock/QuestDock.tsx', ['PENDING', 'SUCCEEDED', 'FAILED'], 'QuestDock'),
    (10396, 'modules/gif_picker/GifProvider.tsx', ['GIF_PROVIDER', 'GIF_PROVIDER_EMBED_NAME', 'getSearchPlaceholder'], 'GifProvider (Bring back Tenor GIFs)'),
    (10411, 'design/components/Icon/native/redesign/generated/GifIcon.tsx', ['GifIcon'], 'GifIcon (Bring back Tenor GIFs)'),
    (13049, 'design/components/Icon/native/redesign/generated/ImagesIcon.tsx', ['ImagesIcon'], 'ImagesIcon (Bring back Tenor GIFs)'),
    (8757, 'design/components/Icon/native/redesign/generated/ImageWarningIcon.tsx', ['ImageWarningIcon'], 'ImageWarningIcon (Bring back Tenor GIFs)'),
    (14887, 'design/components/Icon/native/redesign/generated/EmbedIcon.tsx', ['EmbedIcon'], 'EmbedIcon (Fix link previews)'),
    (8680, 'design/components/Icon/native/redesign/generated/XNeutralIcon.tsx', ['XNeutralIcon'], 'XNeutralIcon (Fix link previews)'),
    (8684, 'design/components/Icon/native/redesign/generated/InstagramNeutralIcon.tsx', ['InstagramNeutralIcon'], 'InstagramNeutralIcon (Fix link previews)'),
    (14169, 'design/components/Icon/native/redesign/generated/TiktokNeutralIcon.tsx', ['TiktokNeutralIcon'], 'TiktokNeutralIcon (Fix link previews)'),
    (9721, 'design/components/Icon/native/redesign/generated/RedditNeutralIcon.tsx', ['RedditNeutralIcon'], 'RedditNeutralIcon (Fix link previews)'),
    (9719, 'design/components/Icon/native/redesign/generated/BlueskyNeutralIcon.tsx', ['BlueskyNeutralIcon'], 'BlueskyNeutralIcon (Fix link previews)'),
    (8682, 'design/components/Icon/native/redesign/generated/FacebookNeutralIcon.tsx', ['FacebookNeutralIcon'], 'FacebookNeutralIcon (Fix link previews)'),
    (9717, 'design/components/Icon/native/redesign/generated/YoutubeNeutralIcon.tsx', ['YoutubeNeutralIcon'], 'YoutubeNeutralIcon (Fix link previews)'),
    (9723, 'design/components/Icon/native/redesign/generated/TwitchNeutralIcon.tsx', ['TwitchNeutralIcon'], 'TwitchNeutralIcon (Fix link previews)'),
    (18512, 'design/components/Icon/native/redesign/generated/SpotifyNeutralIcon.tsx', ['SpotifyNeutralIcon'], 'SpotifyNeutralIcon (Fix link previews)'),
    (11353, 'design/components/Icon/native/redesign/generated/ThemeDarkIcon.tsx', ['ThemeDarkIcon'], 'ThemeDarkIcon (Fix link previews, Dark Tumblr posts)'),
    (13052, 'design/components/Icon/native/redesign/generated/FiltersHorizontalIcon.tsx', ['FiltersHorizontalIcon'], 'FiltersHorizontalIcon (translate bar, #82)'),
    (17608, 'design/components/Icon/native/redesign/generated/PaintPaletteIcon.tsx', ['PaintPaletteIcon'], 'PaintPaletteIcon'),
    (17614, 'modules/user_settings/appearance/native/SettingsAppearanceThemePickerScreen.tsx', ['default'], 'Theme picker (Unlock Nitro themes)'),
    (17660, 'design/components/Icon/native/redesign/generated/CircleMinusIcon.tsx', ['CircleMinusIcon'], 'CircleMinusIcon (Hide extra buttons)'),
    (17699, 'design/components/Icon/native/redesign/generated/EyeDropperIcon.tsx', ['EyeDropperIcon'], 'EyeDropperIcon'),
    (9741, 'design/components/Icon/native/redesign/generated/LanguageIcon.tsx', ['LanguageIcon'], 'LanguageIcon'),
    (17884, 'modules/user_settings/app_icon/native/UserSettingsAppIcons.tsx', ['default'], 'UserSettingsAppIcons'),
    (17885, 'modules/app_icons/native/AppIconRows.tsx', ['default'], 'AppIconRows'),
    (18113, 'design/components/Icon/native/redesign/generated/HashmarkIcon.tsx', ['HashmarkIcon'], 'HashmarkIcon'),
    (5386, 'modules/experiments/ExperimentStore.tsx', ['default', 'registerExperiment'], 'ExperimentStore (Unlock Discord experiments)'),
    (7974, 'stores/DeveloperExperimentStore.tsx', ['default'], 'DeveloperExperimentStore (Unlock Discord experiments)'),
    (17921, 'design/components/Icon/native/redesign/generated/WrenchIcon.tsx', ['WrenchIcon'], 'WrenchIcon (Advanced group)'),
    (14375, 'design/components/Icon/native/redesign/generated/HeadphonesIcon.tsx', ['HeadphonesIcon'], 'HeadphonesIcon (Keep Bluetooth audio clear in calls, Listen along)'),
    (15152, 'modules/user_profile/native/UserProfileActivityButtons.tsx', ['PlayOnSpotifyButton'], 'UserProfileActivityButtons (Listen along)'),
    (6659, 'stores/ConnectedAccountsStore.tsx', ['default'], 'ConnectedAccountsStore (Listen along)'),
    (16198, 'design/components/Slider/native/Slider.native.tsx', ['Slider'], 'Slider (Listen along)'),
    (6079, 'actions/AudioActionCreators.tsx', ['default'], 'AudioActionCreators (Voice channel options)'),
    (6223, 'modules/soundboard/SoundboardStore.tsx', ['default'], 'SoundboardStore (Voice channel options)'),
    (6225, 'modules/soundboard/SoundboardConstants.tsx', ['DEFAULT_SOUND_GUILD_ID'], 'SoundboardConstants (Voice channel options)'),
    (6793, 'actions/SelectedChannelActionCreators.tsx', ['default'], 'SelectedChannelActionCreators (Voice channel options)'),
    (7622, 'modules/soundboard/SoundboardActionCreators.tsx', ['maybeFetchSoundboardSounds'], 'SoundboardActionCreators (Voice channel options)'),
    (14373, 'design/components/Icon/native/redesign/generated/SoundboardIcon.tsx', ['SoundboardIcon'], 'SoundboardIcon (Voice channel options)'),
    (5929, '../discord_common/js/packages/media-engine/Constants.tsx', ['MediaEngineContextTypes'], 'MediaEngineContextTypes (Voice channel options)'),
    (9335, 'modules/voice_calls/native/AudioManagerStore.android.tsx', ['default'], 'AudioManagerStore (Voice channel options)'),
    (9336, '../discord_common/js/packages/rtn-codegen/js/NativeAudioManagerModule.tsx', ['AudioDeviceType', 'getInvalidAndroidDevice'], 'NativeAudioManagerModule (Voice channel options)'),
    (9344, 'modules/voice_calls/native/AudioManagerActionCreator.tsx', ['setAudioOutputDevice'], 'AudioManagerActionCreator (Voice channel options)'),
    (11192, 'modules/sound_playback/SoundUtils.tsx', ['createSoundForPack', 'createSound', 'playSound'], 'SoundUtils (Voice channel options)'),
    (11196, 'modules/sound_playback/native/SoundUtils.tsx', ['MobileAudioSound'], 'MobileAudioSound (Voice channel options)'),
    (8777, 'design/components/Icon/native/redesign/generated/VoiceNormalIcon.tsx', ['VoiceNormalIcon'], 'VoiceNormalIcon (Voice channel options)'),
    (13627, 'design/components/Icon/native/redesign/generated/PhoneIcon.tsx', ['PhoneIcon'], 'PhoneIcon (Voice channel options)'),
    (12440, 'design/components/Icon/native/redesign/generated/BeakerIcon.tsx', ['BeakerIcon'], 'BeakerIcon (Experimental chip)'),
    (17976, 'design/components/Icon/native/redesign/generated/DoubleCheckmarkIcon.tsx', ['DoubleCheckmarkIcon'], 'DoubleCheckmarkIcon'),
    (18022, 'design/components/Icon/native/redesign/generated/LettersIcon.tsx', ['LettersIcon'], 'LettersIcon'),
    (12432, 'design/components/Icon/native/redesign/generated/BugIcon.tsx', ['BugIcon'], 'BugIcon'),
    (18465, 'modules/main_tabs_v2/native/tabs/messages/items/channel/MessagesItemChannelContent.tsx', ['default'], 'MessagesItemChannelContent'),
    (18646, 'design/components/Icon/native/redesign/generated/BoostTier2Icon.tsx', ['BoostTier2Icon'], 'BoostTier2Icon'),
    (18657, 'modules/guild_sidebar/native/ChannelInfo.tsx', ['default'], 'ChannelInfo'),
    (18727, 'modules/guilds_bar/native/GuildsBarConstants.tsx', ['MESSAGES', 'FAVORITES', 'PENDING_JOIN_REQUESTS'], 'FastListRenderSections'),
    (18731, 'modules/guilds_bar/native/utils/getGuildsBarGuildMenuItems.tsx', ['default'], 'getGuildsBarGuildMenuItems (Server info menu row)'),
    (18737, 'modules/guilds_bar/native/hooks/useGuildsBarProps.tsx', ['MESSAGES', 'FAVORITES', 'PENDING_JOIN_REQUESTS'], 'useGuildsBarProps'),
    (18830, 'modules/main_tabs_v2/native/tabs/you/utils/showYouAccountActionSheet.tsx', ['showYouAccountActionSheet'], 'showYouAccountActionSheet'),
    (18835, 'modules/multi_account/native/openManageAccountsModal.tsx', ['default'], 'openManageAccountsModal'),
    (18837, 'modules/multi_account/native/ManageAccountsConstants.tsx', ['MANAGE_ACCOUNTS', 'LOGIN', 'ACCOUNT_DISABLED_OR_DELETION_SCHEDULED'], 'ManageAccountsConstants'),
    (18852, 'modules/main_tabs_v2/native/you_bar/YouBarButton.tsx', ['default', 'YouBarButtonIcon', 'YouBarButtonContainer'], 'YouBarButton'),
    (18855, 'modules/main_tabs_v2/native/you_bar/YouBarNotificationsButton.tsx', ['default'], 'YouBarButtons'),
    (18940, 'design/components/Icon/native/redesign/generated/PaintbrushThinIcon.tsx', ['PaintbrushThinIcon'], 'PaintbrushThinIcon'),
    (12467, 'design/components/Icon/native/redesign/generated/SparklesIcon.tsx', ['SparklesIcon'], 'SparklesIcon (Unlock Nitro themes)'),
    (19428, 'modules/app_icons/native/AppIconsCoachmark.tsx', ['default'], 'AppIconsCoachmark'),
    (19841, 'modules/app_icons/native/AppIconPremiumManager.tsx', ['default'], 'AppIconPremiumManager'),
    (9351, 'design/components/Icon/native/redesign/generated/HeadphonesSlashIcon.tsx', ['HeadphonesSlashIcon'], 'HeadphonesSlashIcon (Fake deafen)'),
    (15885, 'modules/gateway/LocalVoiceStateManager.tsx', ['default'], 'LocalVoiceStateManager (Fake deafen)'),
    (19778, 'modules/voice_panel/native/controls/VoicePanelVoiceControlsButtons.tsx', ['DeafenSwitch'], 'VoicePanelVoiceControlsButtons (Fake deafen)'),
    (502, 'stores/AuthenticationStore.tsx', ['default'], 'AuthenticationStore (Badge Completer)'),
    (2130, 'stores/MediaEngineStore.tsx', ['default'], 'MediaEngineStore (Badge Completer)'),
    (2156, 'stores/DetectableGameStore.tsx', ['default'], 'DetectableGameStore (Badge Completer)'),
    (5896, 'design/components/Icon/native/redesign/generated/ClockIcon.tsx', ['ClockIcon'], 'ClockIcon (Badge Completer)'),
    (5835, 'stores/VoiceStateStore.tsx', ['default'], 'VoiceStateStore (Badge Completer)'),
    (6657, 'stores/SelfPresenceStore.tsx', ['default'], 'SelfPresenceStore (Badge Completer)'),
    (6829, 'stores/ConsentStore.tsx', ['default'], 'ConsentStore (Badge Completer)'),
    (6969, 'modules/applications/ApplicationActionCreators.tsx', ['fetchApplication'], 'ApplicationActionCreators (Badge Completer)'),
    (8859, '../discord_common/js/shared/shared-constants/BadgeId.tsx', ['BadgeId'], 'BadgeId (Badge Completer)'),
    (8867, 'modules/badges/BadgeDirectoryStore.tsx', ['default'], 'BadgeDirectoryStore (Badge Completer)'),
    (8872, 'modules/badges/BadgeDirectoryActionCreators.tsx', ['fetchBadgeDirectory'], 'BadgeDirectoryActionCreators (Badge Completer)'),
    (9492, 'design/components/Icon/native/redesign/generated/TrophyIcon.tsx', ['TrophyIcon'], 'TrophyIcon (Badge Completer)'),
    (11702, 'stores/LocalActivityStore.tsx', ['default'], 'LocalActivityStore (Badge Completer)'),
    (17108, 'actions/ConsentActionCreators.tsx', ['setConsents'], 'ConsentActionCreators (Badge Completer)'),
    (1082, 'modules/user_settings/UserSettingsConstants.tsx', ['UserSettingsDelay'], 'UserSettingsConstants (Unlock Nitro themes)'),
    (1196, '../discord_common/js/packages/protos/discord_protos/discord_users/v1/preloaded_user_settings.tsx', ['ClientThemeSettings'], 'ClientThemeSettings proto (Unlock Nitro themes)'),
    (1227, '../discord_common/js/packages/protos/google/protobuf/wrappers.tsx', ['UInt64Value', 'UInt32Value', 'FloatValue'], 'Protobuf wrappers (Unlock Nitro themes)'),
    (5000, 'modules/user_settings/UserSettingsProtoActionCreators.tsx', ['PreloadedUserSettingsActionCreators'], 'UserSettingsProtoActionCreators (Unlock Nitro themes)'),
    (6827, 'actions/AuthenticationActionCreators.tsx', ['default'], 'AuthenticationActionCreators (Account switcher)'),
    (7097, 'design/components/Navigator/native/NavigatorHeader.native.tsx', ['default', 'HeaderBackImage'], 'NavigatorHeader (Account switcher)'),
    (17360, 'modules/client_themes/ClientThemesBackgroundActionCreators.tsx', ['updateBackgroundGradientPreset', 'resetPreviewClientTheme'], 'ClientThemesBackgroundActionCreators (Unlock Nitro themes)'),
    (18355, 'modules/auth/native/components/Auth.tsx', ['default', 'TrackRegistrationContext'], 'Auth & TrackRegistrationContext (Account switcher)'),
    (18357, 'modules/auth/native/RegistrationStepsUtils.tsx', ['getAllAuthScreens'], 'RegistrationStepsUtils (Account switcher)'),
    (18358, 'modules/auth/native/RegistrationUIStore.tsx', ['resetRegistration'], 'RegistrationUIStore (Account switcher)'),
    (18367, 'modules/auth/native/RegistrationUtils.tsx', ['BackButtonWithTracking', 'getTrackRegTransition'], 'RegistrationUtils (Account switcher)'),
    (18370, 'modules/auth/register.tsx', ['default', 'registerFull'], 'register (Account switcher)'),
    (18836, 'modules/multi_account/native/ManageAccountsModal.tsx', ['default'], 'ManageAccountsModal (Account switcher)'),
    (6834, 'utils/TrackedHTTPUtils.tsx', ['default'], 'TrackedHTTPUtils (Account switcher: sign-up requests go out signed out)'),
    (5881, 'design/components/Icon/native/redesign/generated/UserMinusIcon.tsx', ['UserMinusIcon'], 'UserMinusIcon (Hide blocked or ignored messages)'),
    (7875, 'modules/replies/ReferencedMessageStore.tsx', ['default'], 'ReferencedMessageStore (Hide blocked or ignored messages: replies)'),
    (13979, 'modules/messages/native/createChannelStream.tsx', ['default'], 'createChannelStream (Hide blocked or ignored messages)'),
    (13242, 'design/components/Icon/native/redesign/generated/ChatShieldIcon.tsx', ['ChatShieldIcon'], 'ChatShieldIcon (Hide blocked or ignored messages)'),
    (14592, 'modules/accept_invite/native/InviteDetails.tsx', ['ACCEPT', 'DECLINE', 'default'], 'InviteDetails (Preview servers without joining: Preview button on the join screen)'),
    (6855, 'design/components/ButtonGroup/native/ButtonGroup.native.tsx', ['ButtonGroup'], 'ButtonGroup (the join screen\'s Accept and Decline)'),
    (7582, 'actions/ChannelActionCreators.tsx', ['default'], 'ChannelActionCreators (Hide blocked: Close their DM; Leave group DMs silently: closePrivateChannel)'),
    (8815, 'modules/suspicious_downloads/SuspiciousDownloadUtils.tsx', ['isSuspiciousDownload'], 'SuspiciousDownloadUtils (Always trust)'),
    (9054, 'stores/MaskedLinkStore.tsx', ['default'], 'MaskedLinkStore (Always trust)'),
    (13987, 'modules/chat_input/native/ChatInput.tsx', ['displayName', 'default'], 'ChatInput (Expand the message bar: the button sits on the bar)'),
    (13057, 'modules/chat_input/native/ChatInputNativeComponent.tsx', ['displayName', 'default'], 'ChatInputNativeComponent (Tap mentions to open profiles; Expand the message bar)'),
    (13058, 'modules/chat_input/native/useChatInputMaxHeight.tsx', ['getChatInputMaxHeightWorklet', 'getChatInputHeightAnimationTimingWorklet', 'getChatInputMaxHeight'], 'useChatInputMaxHeight (Expand the message bar: the height cap)'),
    (14057, 'modules/chat_input/native/useChatInputHeightWorklet.native.tsx', ['default', 'getIsChatInputHeightWorkletEnabled'], 'useChatInputHeightWorklet (Expand the message bar: the live height)'),
    (1652, None, ['makeMutable', 'withTiming', 'Easing'], 'react-native-reanimated (Expand the message bar: the shared height reserve)'),
    (11416, 'modules/safe_area/useSafeAreaInsetsSharedValue.native.tsx', ['getSafeAreaInsetsWorklet'], 'useSafeAreaInsetsSharedValue (Expand the message bar: room for the navigation bar)'),
    (8137, None, ['Svg', 'Path'], 'react-native-svg (Expand the message bar: the collapse arrows)'),
    (10352, 'modules/replies/PendingReplyActionCreators.tsx', ['createPendingReply', 'createShallowPendingReply'], 'PendingReplyActionCreators (Reply without pinging)'),
    (11177, 'modules/notifications/NotificationTextUtils.tsx', ['shouldNotify'], 'NotificationTextUtils (Banners in Do Not Disturb)'),
    (11190, 'modules/notifications/native/playInAppMessageSound.tsx', ['playInAppMessageSound'], 'playInAppMessageSound (Banners in Do Not Disturb: no sound)'),
    (1441, '../discord_common/js/packages/rtn-codegen/js/NativeMediaManagerModule.tsx', ['default'], 'NativeMediaManagerModule (Download voice messages)'),
    (10338, 'modules/messages/native/snowflake/MessageDataSnowflakeUtils.tsx', ['getNativeSyntheticEventData'], 'MessageDataSnowflakeUtils (Download voice messages)'),
    (10204, 'modules/messages/native/emoji/MessageEmojiActionSheet.tsx', ['default'], 'MessageEmojiActionSheet (Clone emojis and stickers)'),
    (10438, 'modules/stickers/native/StickerDetailActionSheet.tsx', ['default'], 'StickerDetailActionSheet (Clone emojis and stickers)'),
    (10210, 'actions/EmojiActionCreators.tsx', ['uploadEmoji'], 'EmojiActionCreators (Clone emojis and stickers)'),
    (10418, 'modules/stickers/StickersActionCreators.tsx', ['createGuildSticker'], 'StickersActionCreators (Clone emojis and stickers)'),
    (8567, 'utils/GuildBoostingUtils.tsx', ['getMaxEmojiSlots', 'getTotalStickerCountForTier'], 'GuildBoostingUtils (Clone emojis and stickers: free slots)'),
    (5349, 'modules/chat/native/useChatLayout.tsx', ['default', 'getChatLayout'], 'useChatLayout (Full-screen chat in landscape)'),
    (5879, 'design/components/Icon/native/redesign/generated/UserPlatformIcon.tsx', ['UserPlatformIcon'], 'UserPlatformIcon (Platform spoof)'),
    (7092, 'design/components/Icon/native/redesign/generated/CheckmarkLargeIcon.tsx', ['CheckmarkLargeIcon'], 'CheckmarkLargeIcon'),
    (9708, 'design/components/Icon/native/redesign/generated/ScreenIcon.tsx', ['ScreenIcon'], 'ScreenIcon'),
    (14792, 'design/components/Icon/native/redesign/generated/PencilSparkleIcon.tsx', ['PencilSparkleIcon'], 'PencilSparkleIcon (Local edit)'),
    (15317, 'design/components/Icon/native/redesign/generated/UserClockIcon.tsx', ['UserClockIcon'], 'UserClockIcon (Custom idle)'),
    (20099, 'design/components/Icon/native/redesign/generated/ChannelListIcon.tsx', ['ChannelListIcon'], 'ChannelListIcon (Fast delete channels)'),
    (20165, 'design/components/Icon/native/redesign/generated/HomeIcon.tsx', ['HomeIcon'], 'HomeIcon (HypeSquad)'),
    (10954, 'modules/channel/native/ChannelLongPressActionSheet.tsx', ['default'], 'ChannelLongPressActionSheet (Fast delete channels menu row)'),
    (18545, 'modules/threads/native/components/ThreadLongPressActionSheet.tsx', ['default'], 'ThreadLongPressActionSheet (View raw data menu row)'),
    (11298, 'modules/action_sheet/native/components/LongPressForumPostActionSheet.tsx', ['default'], 'LongPressForumPostActionSheet (View raw data menu row)'),
    (11226, 'design/components/Icon/native/redesign/generated/FileIcon.tsx', ['FileIcon'], 'FileIcon (View raw data)'),
    (8764, 'design/components/Icon/native/redesign/generated/ForumIcon.tsx', ['ForumIcon'], 'ForumIcon (View raw data)'),
    (15004, 'design/components/Icon/native/redesign/generated/ShieldLockIcon.tsx', ['ShieldLockIcon'], 'ShieldLockIcon (View raw data)'),
]


def main():
    path = next((a for a in sys.argv[1:] if not a.startswith('--')), 'work/new/assets/index.android.bundle')
    with open(path, 'rb') as fp:
        raw_bytes = fp.read()

    bundle_sha256 = hashlib.sha256(raw_bytes).hexdigest()
    B = Bundle(path)
    h = B.h
    b = h.b

    f0 = h.func(0)
    g0_sha256 = hashlib.sha256(b[f0['offset']:f0['offset'] + f0['size']]).hexdigest()

    def find_ascii_string_id(target):
        for i in range(h.h['stringCount']):
            if h.string(i) == target:
                return i
        return None

    join_id = find_ascii_string_id('join')
    eval_id = find_ascii_string_id('eval')
    promise_id = find_ascii_string_id('Promise')
    resolve_id = find_ascii_string_id('resolve')
    empty_id = find_ascii_string_id('')

    print("=== 1. Bundle & Global Function Constants ===")
    print(f'HbcPrivacy.ORIGINAL_SHA256 = "{bundle_sha256}"')
    print(f"HbcPrelude.FUNCTION_COUNT  = {h.h['functionCount']}")
    print(f"HbcPrelude.GLOBAL_OFFSET   = {f0['offset']}")
    print(f"HbcPrelude.GLOBAL_SIZE     = {f0['size']}")
    print(f'HbcPrelude.GLOBAL_SHA256   = "{g0_sha256}"')
    print(f"Global #0 frame={f0['frame']}, reads={f0['read']}, flags=0x{f0['flags']:02x}")
    print(f"String IDs: JOIN_ID={join_id}, EVAL_ID={eval_id}, PROMISE_ID={promise_id}, RESOLVE_ID={resolve_id}, EMPTY_ID={empty_id}")

    path_to_mid = {}
    for mid, p in B.paths().items():
        path_to_mid[p] = mid
        path_to_mid[os.path.basename(p)] = mid

    print("\n=== 2. Bootstrap Metro Module Verification ===")
    moved = 0
    for mid, path_hint, exports, desc in BOOTSTRAP_MODULES:
        actual_path = B.paths().get(mid)
        if mid in B.modules:
            mstrings = B.strs(mid, deep=True)
            if all(e in mstrings for e in exports) and (path_hint is None or actual_path == path_hint):
                continue
        candidate = path_to_mid.get(path_hint) if path_hint else (B.find(*exports, deep=True)[0] if exports and B.find(*exports, deep=True) else None)
        print(f"  [MOVED/CHECK] id={mid:5d} ({desc}): actual_path={actual_path!r}, candidate_in_new_bundle={candidate}")
        moved += 1
    if moved == 0:
        print(f"  OK: All {len(BOOTSTRAP_MODULES)} inspected Metro modules verified at their pinned IDs.")

    def locate_hbc_target(mod_hint, fn_name):
        if mod_hint:
            mid = path_to_mid.get(mod_hint) or path_to_mid.get(os.path.basename(mod_hint))
            if mid is not None:
                matches = [f for f in B.tree(mid) if h.fname(f) == fn_name and h.func(f)['expanded'] and (h.func(f)['flags'] & 0xc8 == 0)]
                if len(matches) == 1:
                    return matches[0]
                elif matches:
                    return matches
        return None

    print("\n=== 3. HbcPrivacy Target Verification ===")
    missing_hbc = 0
    for group, targets in G.items():
        for mod, fid, name, promise in targets:
            f = h.func(fid) if fid < h.h['functionCount'] else None
            if f is not None and h.fname(fid) == name and f['expanded'] and (f['flags'] & 0xc8 == 0):
                continue
            candidate = locate_hbc_target(mod, name)
            print(f"  [CHANGED] {group} #{fid} expected {name!r} (mod={mod}), got {h.fname(fid) if f else None!r} -> candidate={candidate}")
            missing_hbc += 1
    if missing_hbc == 0:
        print(f"  OK: All {sum(len(v) for v in G.values())} HbcPrivacy targets verified (expanded, no exception handlers, register-safe).")

    print("\n=== 4. Module IDs bootstrap.js uses that this script doesn't check ===")
    unchecked = sorted(bootstrap_module_ids() - {m[0] for m in BOOTSTRAP_MODULES})
    for mid in unchecked:
        print(f"  [UNCHECKED] id={mid:5d} path={B.paths().get(mid)!r}: add it to BOOTSTRAP_MODULES, then run --map")
    if not unchecked:
        print("  OK: every module ID in bootstrap.js is checked above.")
    return 1 if moved or missing_hbc or unchecked else 0


def bootstrap_module_ids():
    """Metro module IDs bootstrap.js reads: selectModules lists, inspectedExport/venusIcon/rowIcon/__r calls, icon pairs."""
    import re
    src = open(os.path.join(os.path.dirname(os.path.abspath(__file__)), '../../patches/src/main/resources/venus/bootstrap.js')).read()
    ids = set()
    for pattern in (r'(?<![\w.])(?:inspectedExport|venusIcon|rowIcon|global\.__r|serverStore|x)\((\d{2,5}),\s*["\w]',
                    r'selectModules\(\[([\d,\s]+)\]', r'\[(\d{3,5}),\s*"[A-Z]\w*Icon"\]', r'targetModules\[(\d+)\]\s*=\s*1'):
        for match in re.findall(pattern, src):
            ids.update(int(x) for x in re.findall(r'\d+', match))
    return ids


def write_module_map(out=os.path.join(os.path.dirname(os.path.abspath(__file__)), 'module-map.md')):
    """module-map.md is generated from BOOTSTRAP_MODULES, so the two never disagree."""
    rows = sorted(BOOTSTRAP_MODULES, key=lambda m: m[0])
    lines = ['# Metro modules Venus uses', '',
             'Generated by `python3 scripts/hbc/port_check.py --map` from `BOOTSTRAP_MODULES`; edit that list, not this file.',
             'The supported Discord version and bundle hash live in `DiscordPatches.kt` and `HbcPrivacy.kt`.', '',
             '| ID | Source path | Exports checked | Used for |', '|---|---|---|---|']
    lines += [f"| {mid} | {('`' + path + '`') if path else '-'} | {', '.join(exports)} | {desc} |" for mid, path, exports, desc in rows]
    open(out, 'w').write('\n'.join(lines) + '\n')
    print(f"{os.path.relpath(out)}: {len(rows)} modules")


if __name__ == '__main__':
    if '--map' in sys.argv:
        write_module_map(); sys.exit(0)
    sys.exit(main())
