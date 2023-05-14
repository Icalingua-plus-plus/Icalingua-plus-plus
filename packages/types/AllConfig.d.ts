import Aria2Config from '@icalingua/types/Aria2Config'
import LoginForm from '@icalingua/types/LoginForm'
import WinSize from '@icalingua/types/WinSize'

type AllConfig = {
    account: LoginForm
    priority: 1 | 2 | 3 | 4 | 5
    aria2: Aria2Config
    darkTaskIcon: 'auto' | 'true' | 'false'
    winSize: WinSize
    socketIo: string
    adapter: 'oicq' | 'socketIo'
    server: string
    privateKey: string
    fetchHistoryOnChatOpen: boolean
    lastUsedStickerType: 'face' | 'remote' | 'stickers' | 'emojis'
    keyToSendMessage: 'Enter' | 'CtrlEnter' | 'ShiftEnter'
    clearRoomsBehavior: 'AllUnpined' | '1WeekAgo' | '1DayAgo' | '1HourAgo' | 'disabled'
    theme: string
    updateCheck: 'ask' | boolean
    disableBridgeVersionCheck: boolean
    shortcuts: { [key: string]: number }
    zoomFactor: number
    debugmode: boolean
    anonymous: boolean
    linkify: boolean
    roomPanelAvatarOnly: boolean
    roomPanelWidth: number
    sendRawMessage: boolean
    custom: boolean
    fetchHistoryOnStart: boolean
    showAppMenu: boolean
    optimizeMethod: string
    silentFetchHistory: boolean
    hideChatImageByDefault: boolean
    disableChatGroups: boolean
    singleImageMode: boolean
    disableChatGroupsRedPoint: boolean
    localImageViewerByDefault: boolean
    disableQLottie: boolean
    disableNotification: boolean
    lockPassword: string
    useSinglePanel: boolean
    disableAtAll: boolean
    removeGroupNameEmotes: boolean
}

export default AllConfig
