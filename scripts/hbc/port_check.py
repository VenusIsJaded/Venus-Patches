#!/usr/bin/env python3
"""
Porting & verification assistant for upgrading Venus Patches to a new Discord Android release.

Usage:
    python3 scripts/hbc/port_check.py [work/new/assets/index.android.bundle]

Prints:
1. HbcPrelude.kt & HbcPrivacy.kt bundle constants (ORIGINAL_SHA256, FUNCTION_COUNT, GLOBAL_OFFSET,
   GLOBAL_SIZE, GLOBAL_SHA256, JOIN_ID, EVAL_ID, PROMISE_ID, RESOLVE_ID).
2. Resolution status of all Metro modules hooked or demand-loaded by bootstrap.js (by source path
   and exported identifiers).
3. Resolution status and auto-located candidates for all 106 HbcPrivacy functions.
"""
import sys, os, hashlib, struct
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from hbc import Bundle, CLOSURES
from privacy_targets import G

BOOTSTRAP_MODULES = [
    (17, None, ["AccessibilityInfo", "Alert", "AppRegistry", "Pressable"], "React Native"),
    (19, None, ["exports"], "React"),
    (120, None, ["enableIntersectionObserverByDefault", "enableMutationObserverByDefault"], "RN Environment setup"),
    (414, None, ["Pressable", "android_disableSound"], "Chat Picker Pressable"),
    (585, None, ["Dispatcher", "DispatchBand", "Early", "Database"], "Flux Dispatcher"),
    (588, '../discord_common/js/packages/tokens/native.tsx', ['default', 'Theme', 'RawColor'], 'Theme tokens'),
    (590, '../discord_common/js/packages/tokens/colors/generated/native/generated-definitions.tsx', ['_private', 'SemanticColors'], 'SemanticColors'),
    (510, '../discord_common/js/packages/storage/Storage.tsx', ['Storage'], 'Storage (hasLoaded gate for Account switcher)'),
    (592, '../discord_common/js/packages/tokens/colors/generated/raw-color-definitions.tsx', ['_private', 'RawColors'], 'RawColors'),
    (1086, None, ['A11Y_RUNTIME_VIOLATION', 'ACCOUNT_SCHEDULED_FOR_DELETION'], 'Discord Constants'),
    (1097, '../discord_common/js/shared/Constants.tsx', ['PRIMARY_NORMAL', 'PRIMARY_NORMAL_ITALIC', 'PRIMARY_MEDIUM'], 'Permissions constant'),
    (1112, '../discord_common/js/shared/lib/TokenManager.tsx', ['init', 'getAnalyticsToken', 'getToken'], 'TokenManager'),
    (1113, 'modules/routing/router_utils.tsx', ['shouldNavigate', 'transitionTo', 'transitionToGuild'], 'NavigationUtils'),
    (1127, 'intl/index.native.tsx', ['intl', 'getSystemLocale', 'getAvailableLocales'], 'Intl / Locale strings'),
    (1163, '../discord_common/js/packages/rtn-codegen/js/NativeFileModule.tsx', ['default'], 'NativeFileModule'),
    (1194, 'modules/user_settings/ThemeStore.tsx', ['default', 'UNSET', 'SET'], 'ThemeStore'),
    (1252, None, ['murmur', 'noConflict'], 'MurmurHashV3'),
    (1283, '../discord_common/js/packages/http-utils/HTTPUtils.tsx', ['INVALID_FORM_BODY_ERROR_CODE', 'convertSkemaError', 'stringifyErrors'], 'HTTPUtils'),
    (1348, '../discord_common/js/packages/analytics-utils/getSuperProperties.tsx', ['browser_user_agent', 'browser_version', 'os_sdk_version'], 'SuperProperties'),
    (1378, 'stores/UserStore.tsx', ['default', 'users', 'ASSISTANT_WUMPUS_VOICE_USER'], 'UserStore'),
    (1403, 'utils/AvatarUtils.tsx', ['default'], 'AvatarUtils'),
    (1491, 'design/components/Navigator/native/useNavigation.native.tsx', ['useNavigation', 'useNativeStackNavigation', 'useStackNavigation'], 'useStackNavigation'),
    (1986, 'stores/native/AppStateStore.tsx', ['default'], 'AppStateStore'),
    (2051, 'stores/ChannelStore.tsx', ['Basic', 'Full', 'default'], 'ChannelStore'),
    (2102, 'stores/SelectedChannelStore.tsx', ['default', 'findFirstVoiceChannelId', 'handleConnectionOpen'], 'SelectedChannelStore (Hidden channels never opens a locked channel by itself)'),
    (2073, 'stores/GuildStore.tsx', ['default'], 'GuildStore'),
    (2111, 'stores/GuildMemberStore.tsx', ['GUILD', 'USER', 'default'], 'GuildMemberStore'),
    (2115, 'modules/user_settings/LocaleStore.tsx', ['default'], 'LocaleStore'),
    (4470, 'stores/GuildChannelStore.tsx', ['default', 'GUILD_SELECTABLE_CHANNELS_KEY', 'GUILD_VOCAL_CHANNELS_KEY'], 'GuildChannelsStore'),
    (4472, 'stores/PermissionStore.tsx', ['default'], 'PermissionStore'),
    (4473, 'modules/lurker_mode/LurkingStore.tsx', ['default'], 'LurkingStore'),
    (4479, 'modules/app_channels/AppChannelPermissions.tsx', ['APP_CHANNEL_MINIMUM_BOT_PERMISSIONS', 'SWAP_APP_CHANNEL_APPLICATION_PERMISSION_LIST', 'SWAP_APP_CHANNEL_APPLICATION_PERMISSIONS'], 'computePermissions'),
    (4482, 'stores/RelationshipStore.tsx', ['default'], 'RelationshipStore'),
    (4491, 'utils/PremiumUtils.tsx', ['BUNDLE', 'TIER_0', 'TIER_1'], 'PremiumUtils'),
    (4531, 'modules/toast/native/ToastActionCreators.tsx', ['default'], 'ToastActionCreators'),
    (4551, '../discord_common/js/packages/design/components/ThemeContextProvider/ThemeContext.tsx', ['createThemedContext', 'useThemeContext', 'FALLBACK_THEME_CONTEXT_VALUE'], 'ThemeContext'),
    (4694, 'modules/main_tabs_v2/helpers/NavigationRouteUtils.native.tsx', ['navigateToChannel', 'navigateToMemberVerification', 'navigateToRootTab'], 'ModalAPI'),
    (4695, 'modules/main_tabs_v2/RootNavigationRef.native.tsx', ['getRootNavigationRef'], 'RootNavigationRef'),
    (4780, 'design/components/Icon/native/redesign/generated/CopyIcon.tsx', ['CopyIcon'], 'CopyIcon'),
    (4788, 'design/components/Icon/native/redesign/generated/CircleInformationIcon.tsx', ['CircleInformationIcon'], 'CircleInformationIcon'),
    (4791, 'design/components/Icon/native/redesign/generated/TrashIcon.tsx', ['TrashIcon'], 'TrashIcon'),
    (4801, 'modules/action_sheet/native/ActionSheetActionCreators.tsx', ['default', 'ACTION_SHEET_HEIGHT_HALF', 'ACTION_SHEET_HEIGHT_EXPANDED'], 'ActionSheetActionCreators'),
    (4802, 'modules/haptics/HapticUtils.native.tsx', ['HapticFeedbackTypes', 'triggerHapticFeedback'], 'HapticUtils'),
    (4803, 'modules/haptics/HapticFeedbackTypes.tsx', ['IMPACT_LIGHT', 'default'], 'HapticFeedbackTypes'),
    (4833, 'design/components/Text/native/Text.tsx', ['TextStyleSheet', 'Text', 'Heading'], 'Design Text'),
    (4837, 'design/components/Styles/native/createStyles.tsx', ['experimental_createToken', 'createStyles', 'createLegacyClassComponentStyles'], 'createStyles'),
    (4852, 'stores/ReadStateStore.tsx', ['IS_GUILD_CHANNEL', 'IS_THREAD', 'IS_MENTION_LOW_IMPORTANCE'], 'ReadStateStore'),
    (4855, 'stores/SessionsStore.tsx', ['default'], 'SessionsStore'),
    (4877, 'stores/PresenceStore.tsx', ['default', 'sortActivity'], 'PresenceStore'),
    (4990, 'modules/channel/useChannelName.tsx', ['default', 'computeDefaultGroupDmNameFromUserIds', 'computeDefaultGroupDmName'], 'ChannelNameUtils'),
    (5019, 'modules/read_states/ReadStateConstants.tsx', ['CHANNEL', 'GUILD_EVENT', 'NOTIFICATION_CENTER'], 'ReadStateTypes'),
    (5057, 'stores/MessageStore.tsx', ['default'], 'MessageStore'),
    (5059, 'modules/messages/MessageRecordUtils.tsx', ['createMessageRecord', 'updateServerMessage', 'updateMessageRecord'], 'MessageRecordUtils'),
    (5205, 'actions/native/AlertActionCreators.tsx', ['default'], 'AlertActionCreators'),
    (5280, 'design/components/Stack/native/Stack.native.tsx', ['Stack'], 'Stack'),
    (5314, 'modules/markup/MarkupChannelMentionRule.tsx', ['default', 'getChannel', 'parseChannel'], 'MarkupChannelMentionRule'),
    (5393, 'design/components/Icon/native/redesign/generated/TextLockIcon.tsx', ['TextLockIcon'], 'TextLockIcon'),
    (7726, 'design/components/Icon/native/redesign/generated/PlayIcon.tsx', ['PlayIcon'], 'PlayIcon (preview Watch button)'),
    (9370, 'design/components/Icon/native/redesign/generated/HandRequestSpeakIcon.tsx', ['HandRequestSpeakIcon'], 'HandRequestSpeakIcon (preview Try it button)'),
    (10455, 'design/components/Icon/native/redesign/generated/PlusLargeIcon.tsx', ['PlusLargeIcon'], 'PlusLargeIcon (preview message bar)'),
    (10604, 'design/components/Icon/native/redesign/generated/ChevronSmallDownIcon.tsx', ['ChevronSmallDownIcon'], 'ChevronSmallDownIcon (preview channel category)'),
    (11106, 'design/components/Icon/native/redesign/generated/RetryIcon.tsx', ['RetryIcon'], 'RetryIcon (preview Start over / New people)'),
    (4778, 'design/components/Icon/native/redesign/generated/SendMessageIcon.tsx', ['SendMessageIcon'], 'SendMessageIcon (preview message bar)'),
    (5388, 'design/components/Icon/native/redesign/generated/ThreadIcon.tsx', ['ThreadIcon'], 'ThreadIcon (preview channel header)'),
    (5937, 'design/components/Icon/native/redesign/generated/ArrowLargeLeftIcon.tsx', ['ArrowLargeLeftIcon'], 'ArrowLargeLeftIcon (preview channel header)'),
    (7364, 'design/components/Icon/native/redesign/generated/MoreHorizontalIcon.tsx', ['MoreHorizontalIcon'], 'MoreHorizontalIcon (preview server header)'),
    (7728, 'design/components/Icon/native/redesign/generated/PauseIcon.tsx', ['PauseIcon'], 'PauseIcon (preview player)'),
    (9461, 'design/components/Icon/native/redesign/generated/MicrophoneIcon.tsx', ['MicrophoneIcon'], 'MicrophoneIcon (preview message bar)'),
    (5375, 'design/components/Icon/native/redesign/generated/AppsIcon.tsx', ['AppsIcon'], 'AppsIcon'),
    (5404, 'design/components/Icon/native/redesign/generated/GroupIcon.tsx', ['GroupIcon'], 'GroupIcon'),
    (5405, 'design/components/Icon/native/redesign/generated/AtIcon.tsx', ['AtIcon'], 'AtIcon'),
    (5410, 'design/components/Icon/native/redesign/generated/LockIcon.tsx', ['LockIcon'], 'LockIcon'),
    (5440, 'lib/uploader/CloudUpload.tsx', ['NOT_STARTED', 'STARTED', 'UPLOADING'], 'CloudUpload'),
    (5442, 'utils/UploadUtils.tsx', ['MAX_TOTAL_ATTACHMENT_SIZE', 'MAX_TOTAL_ATTACHMENT_SIZE_1GB', 'MAX_TOTAL_ATTACHMENT_SIZE_MB'], 'AttachmentUtils'),
    (5751, 'stores/SortedGuildStore.tsx', ['default', 'GuildsNodeType', 'insertUnsortedGuilds'], 'SortedGuildStore'),
    (5764, '../discord_common/js/shared/shared-constants/AdCreativeType.tsx', ['INVALID', 'QUEST', 'QUEST_HOME_HERO'], 'AdCreativeType'),
    (5772, 'modules/emojis/EmojiStore.tsx', ['Unloaded', 'Loading', 'Loaded'], 'EmojiStore'),
    (5815, 'modules/stickers/StickersStore.tsx', ['Unloaded', 'Loaded', 'default'], 'StickersStore'),
    (5913, 'design/components/TableRow/native/TableCheckboxRow.native.tsx', ['TableCheckboxRow'], 'TableCheckboxRow'),
    (5916, 'design/components/TableRow/native/TableRow.native.tsx', ['Icon', 'Arrow', 'TrailingText'], 'TableRow'),
    (5918, 'design/components/Card/native/Card.native.tsx', ['Card', 'InternalCard'], 'Card'),
    (5994, 'design/components/TableRow/native/TableRadioRow.native.tsx', ['TableRadioRow'], 'TableRadioRow'),
    (5995, 'design/components/TableRow/native/TableRadioGroup.native.tsx', ['TableRadioGroupContext', 'TableRadioGroup'], 'TableRadioGroup'),
    (5997, 'design/components/TableRow/native/TableRowGroup.native.tsx', ['TableRowGroupTitle', 'TableRowGroup'], 'TableRowGroup'),
    (6021, 'design/components/TextInput/native/TextInput.native.tsx', ['TextInput'], 'TextInput'),
    (6026, 'design/components/Icon/native/redesign/generated/CircleXIcon.tsx', ['CircleXIcon'], 'CircleXIcon'),
    (6384, 'design/components/Icon/native/redesign/generated/EyeSlashIcon.tsx', ['EyeSlashIcon'], 'EyeSlashIcon'),
    (6472, 'design/components/TextField/native/SearchField.native.tsx', ['SearchField'], 'SearchField'),
    (6473, 'design/components/Icon/native/redesign/generated/MagnifyingGlassIcon.tsx', ['MagnifyingGlassIcon'], 'MagnifyingGlassIcon'),
    (6532, 'actions/ReadStateActionCreators.tsx', ['ack', 'ackCategory', 'ackChannel'], 'ReadStateActionCreators'),
    (6552, 'modules/emojis/native/Emoji.tsx', ['default'], 'Emoji'),
    (6571, 'design/components/Sheet/native/BottomSheetTitleHeader.native.tsx', ['BottomSheetTitleHeader'], 'BottomSheetTitleHeader'),
    (6614, None, ['Clipboard', 'Platform', 'addListener'], 'Clipboard'),
    (6616, 'modules/action_sheet/native/showSimpleActionSheet.tsx', ['showSimpleActionSheet'], 'SimpleActionSheet'),
    (6619, 'design/components/Sheet/native/ActionSheetCloseButton.native.tsx', ['ActionSheetCloseButton'], 'ActionSheetCloseButton'),
    (6621, 'design/components/TableRow/native/TableSwitchRow.native.tsx', ['TableSwitchRow'], 'TableSwitchRow'),
    (6622, 'design/components/Forms/native/FormSwitch.native.tsx', ['FormSwitch'], 'FormSwitch'),
    (6624, 'design/components/Sheet/native/ActionSheet.native.tsx', ['ActionSheet'], 'ActionSheet'),
    (6631, 'design/components/Icon/native/redesign/generated/ChevronSmallRightIcon.tsx', ['ChevronSmallRightIcon'], 'ChevronSmallRightIcon'),
    (6756, 'modules/stickers/StickerSendability.tsx', ['SENDABLE', 'SENDABLE_WITH_PREMIUM', 'NONSENDABLE'], 'StickerUtils'),
    (6799, 'design/components/Icon/native/redesign/generated/SettingsIcon.tsx', ['SettingsIcon'], 'SettingsIcon'),
    (6801, 'modules/user_settings/core/native/openUserSettings.tsx', ['openUserSettings'], 'UserSettingsActionCreators'),
    (6880, 'actions/MessageActionCreators.tsx', ['default'], 'MessageActionCreators'),
    (6952, 'modules/guild_sidebar/ChannelListState.tsx', ['CannotShow', 'DoNotShow', 'WouldShowIfUncollapsed'], 'useGuildChannelsList'),
    (7054, 'stores/GuildReadStateStore.tsx', ['default'], 'GuildReadStateStore'),
    (7099, 'modules/messages/MessageParser.tsx', ['default', 'parseAndRebuild', 'createParserState'], 'MessageParser'),
    (7105, 'modules/chat/SlowmodeUtils.tsx', ['canBypassSlowmode', 'canBypassSlowmodeHelper', 'useCanBypassSlowmode'], 'SlowmodeUtils'),
    (7116, 'modules/quests/utils/QuestDataUtils.tsx', ['THIRTY_DAYS_MS', 'earnedDecisionIsValid', 'findQuestOrReplacement'], 'QuestDataUtils'),
    (7120, 'modules/quests/QuestStore.tsx', ['default'], 'QuestStore'),
    (7127, 'modules/quests/utils/QuestServerUtils.tsx', ['isQuestWithKnownConfigVersion', 'questConfigFromServer', 'questUserStatusFromServer'], 'questUserStatusFromServer'),
    (7179, 'modules/foreground_service/mobile/ForegroundServiceManager.android.tsx', ['default'], 'ForegroundServiceManager'),
    (7309, 'design/components/Icon/native/redesign/generated/PhoneCallIcon.tsx', ['PhoneCallIcon'], 'PhoneCallIcon'),
    (7340, 'design/components/Icon/native/redesign/generated/PaperIcon.tsx', ['PaperIcon'], 'PaperIcon'),
    (7358, 'design/components/Icon/native/redesign/generated/ThumbsUpIcon.tsx', ['ThumbsUpIcon'], 'ThumbsUpIcon'),
    (7378, 'modules/messages/native/renderer/RowGenerator.tsx', ['default'], 'RowGenerator'),
    (7414, 'modules/double_tap_to_react/native/DoubleTapToReactUtils.tsx', ['getFallbackDoubleTapDisambiguatedEmoji', 'reactionEmojiFromSettingsValue', 'disambiguatedEmojiFromSettingsValue'], 'DoubleTapToReactUtils'),
    (7422, 'modules/replies/canReplyToMessage.tsx', ['useCanReplyToMessage', 'canReplyToMessage'], 'canReplyToMessage'),
    (7630, 'actions/UserActionCreators.tsx', ['fetchCurrentUser', 'acceptAgreements', 'setFlag'], 'UserActionCreators'),
    (8041, 'design/components/Icon/native/redesign/generated/LinkExternalSmallIcon.tsx', ['LinkExternalSmallIcon'], 'LinkExternalSmallIcon'),
    (8057, 'design/void/Form/native/index.tsx', ['Form', 'FormArrow', 'FormCheckbox'], 'Form'),
    (8119, 'design/components/Icon/native/redesign/generated/NitroWheelIcon.tsx', ['NitroWheelIcon'], 'NitroWheelIcon'),
    (8216, 'design/components/Icon/native/redesign/generated/ReactionIcon.tsx', ['ReactionIcon'], 'ReactionIcon'),
    (8510, 'modules/oauth2/native/OAuth2AuthorizeModal.tsx', ['default'], 'OAuth2AuthorizeModal'),
    (8602, 'modules/messages/useMessageMaxLength.tsx', ['default', 'getMaxMessageLength'], 'useMessageMaxLength'),
    (8621, 'modules/app_icons/native/AppIconConstants.tsx', ['getDefaultIcon', 'getOfficialAlternateIcons', 'getLimitedAlternateIcons'], 'AppIconConstants'),
    (8719, 'design/components/Icon/native/redesign/generated/ChatSmileIcon.tsx', ['ChatSmileIcon'], 'ChatSmileIcon'),
    (8741, 'lib/pushnotification/PushNotification.tsx', ['default'], 'PushNotification'),
    (8838, 'modules/chat_input/native/useChatBottomManagerUIStore.tsx', ['default', 'updateChatInputContainerHeight', 'updateShowingAutoComplete'], 'ChatInputHeightContext'),
    (9044, 'design/components/Icon/native/redesign/generated/BellIcon.tsx', ['BellIcon'], 'BellIcon'),
    (9108, 'modules/voice_panel/native/shared/FormComponents.tsx', ['VoicePanelFormSection', 'MemberRowItem'], 'VoiceChannelMembers'),
    (9421, 'modules/premium/components/native/NitroUpsellButton.tsx', ['default'], 'NitroUpsellButton'),
    (9652, 'modules/double_tap_to_react/native/DoubleTapReminderToast.tsx', ['maybeShowDoubleTapReminderToast'], 'DoubleTapReminderToast'),
    (9542, 'modules/chat/native/ChatViewWrapper.tsx', ['default'], 'ChatViewWrapper'),
    (9716, 'design/components/Icon/native/redesign/generated/StarIcon.tsx', ['StarIcon'], 'StarIcon'),
    (9742, 'design/components/Icon/native/redesign/generated/BackspaceIcon.tsx', ['BackspaceIcon'], 'BackspaceIcon'),
    (9765, 'modules/quests/QuestActionCreators.tsx', ['SUCCESS', 'CAPTCHA_FAILED', 'UNKNOWN_ERROR'], 'QuestActionCreators'),
    (9861, 'actions/GIFPickerActionCreators.tsx', ['trackSearchStart', 'trackSearchResultViewed', 'search'], 'GIFPickerActionCreators'),
    (9864, 'modules/gif_picker/native/GIFPickerUtils.tsx', ['GIF_HEADER_HEIGHT', 'useFavoriteGIFsMobile', 'GIF_PICKER_ITEM_ESIMTATED_HEIGHT'], 'useFavoriteGIFsMobile'),
    (10140, 'design/components/Icon/native/redesign/generated/AttachmentIcon.tsx', ['AttachmentIcon'], 'AttachmentIcon'),
    (10371, 'modules/main_tabs_v2/native/shared_components/user_list/UserRow.tsx', ['CALL', 'MESSAGE', 'ACCEPT'], 'UserRow'),
    (10420, 'design/components/Icon/native/redesign/generated/UserCircleIcon.tsx', ['UserCircleIcon'], 'UserCircleIcon'),
    (10528, 'design/components/Icon/native/redesign/generated/GiftIcon.tsx', ['GiftIcon'], 'GiftIcon'),
    (10603, 'modules/user_profile/native/UserProfilePrimaryInfo.tsx', ['default', 'DisplayName', 'UserTagAndPronouns'], 'UserProfileHeaderName'),
    (10742, 'modules/profile_customization/native/BioText.tsx', ['default'], 'UserProfileBio'),
    (10813, 'design/components/Icon/native/redesign/generated/KeyboardIcon.tsx', ['KeyboardIcon'], 'KeyboardIcon'),
    (10827, 'design/components/Icon/native/redesign/generated/ArrowLargeUpIcon.tsx', ['ArrowLargeUpIcon'], 'ArrowLargeUpIcon'),
    (10874, 'modules/settings/native/renderer/SettingBuilders.tsx', ['createToggle', 'createStatic', 'createRoute'], 'createSettingsList'),
    (10905, 'modules/messages/native/MessagesHandlers.tsx', ['MessagesHandlers'], 'MessagesHandlers'),
    (11023, 'modules/messages/native/long_press/LongPressMessageActionSheet.tsx', ['default'], 'LongPressMessageActionSheet'),
    (11032, 'modules/messages/native/long_press/LongPressMessageActionSheetUtils.tsx', ['getContextBarCancelReason', 'handleEdit', 'handleCreateThread'], 'LongPressMessageActionSheetUtils'),
    (11047, 'modules/replies/native/replyToMessage.tsx', ['default'], 'replyToMessage'),
    (11105, 'modules/double_tap_to_react/native/DoubleTapEmojiEditNudge.tsx', ['DoubleTapEmojiEditNudge'], 'DoubleTapEmojiEditNudge'),
    (11120, 'modules/messages/canEditMessage.tsx', ['default'], 'canEditMessage'),
    (11348, 'actions/TypingActionCreators.tsx', ['default'], 'TypingActionCreators'),
    (11609, 'modules/chat_input/native/action_buttons/ChatInputActions.tsx', ['displayName', 'default'], 'ChatInputSendAndGiftButton'),
    (11642, 'components_native/chat/JumpToPresentButton.tsx', ['default'], 'JumpToPresentButton'),
    (11643, 'modules/chat_input/native/ChatFloatingNavButton.tsx', ['default'], 'JumpToPresentPill'),
    (11644, None, ['__packager_asset', 'registerAsset'], 'JumpToPresent arrow asset'),
    (11666, 'modules/double_tap_to_react/native/DoubleTapToReactChatInputBanner.tsx', ['DoubleTapToReactChatInputBanner'], 'DoubleTapToReactChatInputBanner'),
    (11800, 'modules/multi_account/MultiAccountStore.tsx', ['INVALID', 'VALIDATING', 'VALID'], 'MultiAccountStore'),
    (11801, 'modules/multi_account/Constants.tsx', ['YOU_ACCOUNT_ACTION_SHEET', 'CHOOSE_ACCOUNT', 'MANAGE_ACCOUNTS_MODAL'], 'MultiAccountConstants'),
    (11802, 'modules/user/isStaffFromRawUser.tsx', ['default'], 'isStaffFromRawUser'),
    (11804, 'modules/multi_account/MultiAccountActionCreators.tsx', ['validateMultiAccountTokens', 'switchAccount', 'moveAccount'], 'MultiAccountActionCreators'),
    (11817, 'modules/chat_input/native/action_buttons/ChatInputRightActions.tsx', ['displayName', 'default'], 'ChatInputGiftButton'),
    (12236, 'design/components/Icon/native/redesign/generated/WaveformIcon.tsx', ['WaveformIcon'], 'WaveformIcon'),
    (12524, 'modules/media_viewer/native/components/overlay/MediaViewerOverlayButtonFavoriteGIF.tsx', ['default'], 'MediaViewerHeader'),
    (12602, 'modules/user_profile/native/UserProfileActivityVoiceChannelUsers.tsx', ['default'], 'UserProfileActivityVoiceChannelUsers'),
    (12627, 'modules/user_profile/native/UserProfileNote.tsx', ['default'], 'UserProfileNote'),
    (12696, 'modules/user_profile/native/UserProfileContactButtons.tsx', ['default'], 'UserProfileContactButtons'),
    (12845, 'modules/main_tabs_v2/native/channel/header/PrivateChannelHeader.tsx', ['default'], 'PrivateChannelHeader'),
    (13174, 'modules/gateway/GatewaySocketSingleton.tsx', ['handleIdentify', 'socket', 'localPresenceState'], 'GatewaySocketSingleton'),
    (13212, 'modules/gateway/PauseGatewaySocket.tsx', ['getIsPaused', 'setIsPaused'], 'PauseGatewaySocket'),
    (13299, 'stores/PrivateChannelReadStateStore.tsx', ['default'], 'PrivateChannelReadStateStore'),
    (13384, 'modules/message_request/MessageRequestUtils.tsx', ['filterOutMessageRequestsAndSpam', 'filterOutMessageRequestsAndSpamById', 'isMessageRequestOrSpamRequest'], 'MessageRequestUtils'),
    (13507, 'modules/guild/markGuildsAsRead.tsx', ['default'], 'markGuildsAsRead'),
    (13521, 'modules/guild_action_sheet/native/components/GuildActionSheetProgress.tsx', ['default'], 'GuildActionSheetJoinRequestRow'),
    (13528, 'modules/premium/ProductCatalog.tsx', ['ANIMATED_EMOJIS', 'EMOJIS_EVERYWHERE', 'STICKERS_EVERYWHERE'], 'EmojiPermissions'),
    (13649, 'design/void/Status/native/Status.tsx', ['default', 'StatusWithTyping'], 'Status'),
    (13987, 'design/components/ContextMenu/native/ContextMenuPopout.native.tsx', ['ContextMenuPopout'], 'ContextMenuPopout'),
    (14130, 'modules/user_settings/core/native/SettingsRendererConfig.tsx', ['SETTING_RENDERER_CONFIG'], 'SettingRendererConfig'),
    (14236, 'modules/settings/native/renderer/SettingListRenderer.tsx', ['SettingsList', 'SearchableSettingsList'], 'SettingsList'),
    (14239, 'modules/settings/native/renderer/SettingRendererUtils.tsx', ['onRouteSettingOnPress', 'getSettingTitle', 'getSettingSearchableTitles'], 'SettingScreens'),
    (14470, 'design/components/Icon/native/redesign/generated/LaptopPhoneIcon.tsx', ['LaptopPhoneIcon'], 'LaptopPhoneIcon'),
    (14478, 'design/components/Icon/native/redesign/generated/PuzzlePieceIcon.tsx', ['PuzzlePieceIcon'], 'PuzzlePieceIcon'),
    (14519, 'design/components/Icon/native/redesign/generated/QuestsIcon.tsx', ['QuestsIcon'], 'QuestsIcon'),
    (14608, 'modules/quests/native/QuestHooks.native.tsx', ['useMobileQuestDockHeight', 'useMobileQuestDock', 'useIsMobileQuestDockVisibleToUser'], 'useMobileQuestDock'),
    (14615, 'modules/main_tabs_v2/native/you_bar/YouBarConstants.tsx', ['CONNECTION_BANNER_HEIGHT', 'YOU_BAR_SPRING_CONFIG', 'YOU_BAR_PADDING'], 'YouBarConstants'),
    (14700, 'modules/quests/native/QuestDock/QuestDock.tsx', ['PENDING', 'SUCCEEDED', 'FAILED'], 'QuestDock'),
    (14795, 'design/components/Icon/native/redesign/generated/PaintPaletteIcon.tsx', ['PaintPaletteIcon'], 'PaintPaletteIcon'),
    (14887, 'design/components/Icon/native/redesign/generated/EyeDropperIcon.tsx', ['EyeDropperIcon'], 'EyeDropperIcon'),
    (14958, 'design/components/Icon/native/redesign/generated/LanguageIcon.tsx', ['LanguageIcon'], 'LanguageIcon'),
    (15065, 'modules/user_settings/app_icon/native/UserSettingsAppIcons.tsx', ['default'], 'UserSettingsAppIcons'),
    (15066, 'modules/app_icons/native/AppIconRows.tsx', ['default'], 'AppIconRows'),
    (15125, 'design/components/Icon/native/redesign/generated/HashmarkIcon.tsx', ['HashmarkIcon'], 'HashmarkIcon'),
    (15161, 'design/components/Icon/native/redesign/generated/DoubleCheckmarkIcon.tsx', ['DoubleCheckmarkIcon'], 'DoubleCheckmarkIcon'),
    (15207, 'design/components/Icon/native/redesign/generated/LettersIcon.tsx', ['LettersIcon'], 'LettersIcon'),
    (15329, 'design/components/Icon/native/redesign/generated/BugIcon.tsx', ['BugIcon'], 'BugIcon'),
    (15667, 'modules/main_tabs_v2/native/tabs/messages/items/channel/MessagesItemChannelContent.tsx', ['default'], 'MessagesItemChannelContent'),
    (15859, 'modules/guild_sidebar/native/ChannelInfo.tsx', ['default'], 'ChannelInfo'),
    (15919, 'modules/guilds_bar/native/GuildsBarConstants.tsx', ['MESSAGES', 'FAVORITES', 'PENDING_JOIN_REQUESTS'], 'FastListRenderSections'),
    (15929, 'modules/guilds_bar/native/hooks/useGuildsBarProps.tsx', ['MESSAGES', 'FAVORITES', 'PENDING_JOIN_REQUESTS'], 'useGuildsBarProps'),
    (16007, 'modules/main_tabs_v2/native/tabs/you/utils/showYouAccountActionSheet.tsx', ['showYouAccountActionSheet'], 'showYouAccountActionSheet'),
    (16012, 'modules/multi_account/native/openManageAccountsModal.tsx', ['default'], 'openManageAccountsModal'),
    (16014, 'modules/multi_account/native/ManageAccountsConstants.tsx', ['MANAGE_ACCOUNTS', 'LOGIN', 'ACCOUNT_DISABLED_OR_DELETION_SCHEDULED'], 'ManageAccountsConstants'),
    (16031, 'modules/main_tabs_v2/native/you_bar/YouBarButton.tsx', ['default', 'YouBarButtonIcon', 'YouBarButtonContainer'], 'YouBarButton'),
    (16032, 'modules/main_tabs_v2/native/you_bar/YouBarNotificationsButton.tsx', ['default'], 'YouBarButtons'),
    (16122, 'design/components/Icon/native/redesign/generated/PaintbrushThinIcon.tsx', ['PaintbrushThinIcon'], 'PaintbrushThinIcon'),
    (16292, 'design/components/Icon/native/redesign/generated/SparklesIcon.tsx', ['SparklesIcon'], 'SparklesIcon'),
    (8324, 'design/components/Icon/native/redesign/generated/TagIcon.tsx', ['TagIcon'], 'TagIcon'),
    (16750, 'modules/app_icons/native/AppIconsCoachmark.tsx', ['default'], 'AppIconsCoachmark'),
    (17096, 'modules/app_icons/native/AppIconPremiumManager.tsx', ['default'], 'AppIconPremiumManager'),
    (4532, 'design/components/Icon/native/redesign/generated/FriendsIcon.tsx', ['FriendsIcon'], 'FriendsIcon'),
    (5282, 'design/components/Button/native/Button.native.tsx', ['Button'], 'Button'),
    (5386, 'design/components/Icon/native/redesign/generated/ChatIcon.tsx', ['ChatIcon'], 'ChatIcon'),
    (5922, 'design/components/TableRow/native/TableRowIcon.native.tsx', ['TableRowIcon'], 'TableRowIcon'),
    (5940, 'design/components/Icon/native/redesign/generated/XSmallIcon.tsx', ['XSmallIcon'], 'XSmallIcon'),
    (6376, 'design/components/Icon/native/redesign/generated/MobilePhoneIcon.tsx', ['MobilePhoneIcon'], 'MobilePhoneIcon'),
    (6555, 'design/components/Icon/native/redesign/generated/CheckmarkSmallIcon.tsx', ['CheckmarkSmallIcon'], 'CheckmarkSmallIcon'),
    (9586, 'design/components/Icon/native/redesign/generated/BellSlashIcon.tsx', ['BellSlashIcon'], 'BellSlashIcon'),
    (14140, 'modules/color_picker/native/showCustomColorPickerActionSheet.tsx', ['CUSTOM_COLOR_PICKER_KEY', 'CustomColorPicker'], 'showCustomColorPickerActionSheet'),
    (4770, 'design/components/Icon/native/redesign/generated/UserPlusIcon.tsx', ['UserPlusIcon'], 'UserPlusIcon'),
    (4776, 'design/components/Icon/native/redesign/generated/LinkIcon.tsx', ['LinkIcon'], 'LinkIcon'),
    (4782, 'design/components/Icon/native/redesign/generated/DownloadIcon.tsx', ['DownloadIcon'], 'DownloadIcon'),
    (4793, 'design/components/Icon/native/redesign/generated/CircleCheckIcon.tsx', ['CircleCheckIcon'], 'CircleCheckIcon'),
    (5395, 'design/components/Icon/native/redesign/generated/TextIcon.tsx', ['TextIcon'], 'TextIcon'),
    (5402, 'design/components/Icon/native/redesign/generated/ImageIcon.tsx', ['ImageIcon'], 'ImageIcon'),
    (6374, 'design/components/Icon/native/redesign/generated/KeyIcon.tsx', ['KeyIcon'], 'KeyIcon'),
    (6503, 'design/components/Icon/native/redesign/generated/EnvelopeIcon.tsx', ['EnvelopeIcon'], 'EnvelopeIcon'),
    (8351, 'design/components/Icon/native/redesign/generated/GlobeEarthIcon.tsx', ['GlobeEarthIcon'], 'GlobeEarthIcon'),
    (8382, 'design/components/Icon/native/redesign/generated/QuoteIcon.tsx', ['QuoteIcon'], 'QuoteIcon'),
    (8532, 'design/components/Icon/native/redesign/generated/GameControllerIcon.tsx', ['GameControllerIcon'], 'GameControllerIcon'),
    (8584, 'design/components/Icon/native/redesign/generated/ServerIcon.tsx', ['ServerIcon'], 'ServerIcon'),
    (8699, 'design/components/Icon/native/redesign/generated/ShieldIcon.tsx', ['ShieldIcon'], 'ShieldIcon'),
    (9348, 'design/components/Icon/native/redesign/generated/DoorExitIcon.tsx', ['DoorExitIcon'], 'DoorExitIcon'),
    (9829, 'design/components/Icon/native/redesign/generated/PencilIcon.tsx', ['PencilIcon'], 'PencilIcon'),
    (10398, 'design/components/Icon/native/redesign/generated/CrownIcon.tsx', ['CrownIcon'], 'CrownIcon'),
    (10976, 'design/components/Icon/native/redesign/generated/VideoIcon.tsx', ['VideoIcon'], 'VideoIcon'),
    (11108, 'design/components/Icon/native/redesign/generated/ArrowAngleLeftUpIcon.tsx', ['ArrowAngleLeftUpIcon'], 'ArrowAngleLeftUpIcon'),
    (11177, 'design/components/Icon/native/redesign/generated/UserIcon.tsx', ['UserIcon'], 'UserIcon'),
    (11519, 'design/components/Icon/native/redesign/generated/ArrowsUpDownIcon.tsx', ['ArrowsUpDownIcon'], 'ArrowsUpDownIcon'),
    (11937, 'design/components/Icon/native/redesign/generated/StickerIcon.tsx', ['StickerIcon'], 'StickerIcon'),
    (12246, 'design/components/Icon/native/redesign/generated/MagicWandIcon.tsx', ['MagicWandIcon'], 'MagicWandIcon'),
    (11840, 'design/components/Icon/native/redesign/generated/ChatWarningIcon.tsx', ['ChatWarningIcon'], 'ChatWarningIcon'),
    (10968, 'design/components/Icon/native/redesign/generated/TimerIcon.tsx', ['TimerIcon'], 'TimerIcon'),
]


def main():
    path = sys.argv[1] if len(sys.argv) > 1 else 'work/348/assets/index.android.bundle'
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
        print(f"  [MOVED/CHECK] 348.10 id={mid:5d} ({desc}): actual_path={actual_path!r}, candidate_in_new_bundle={candidate}")
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


if __name__ == '__main__':
    main()
