import QtQuick
import Quickshell
import Quickshell.Io

Item {
    id: root

    required property var pluginApi

    readonly property var emptyState: ({
        uin: 0,
        nickname: "",
        unreadCount: 0,
        rooms: []
    })

    property var state: emptyState

    function openRoom(roomId) {
        if (sockLoader.item) {
            sockLoader.item.write(JSON.stringify({action: "open", roomId: roomId}) + "\n")
            sockLoader.item.flush()
        }
    }

    readonly property string socketPath: pluginApi.pluginSettings.socketPath || "/tmp/icalingua-noctalia.sock"

    FileView {
        path: root.socketPath
        watchChanges: true
        preload: false
        printErrors: false
        onFileChanged: root.reconnect()
    }

    function reconnect() {
        sockLoader.active = false
        sockLoader.active = true
    }

    Loader {
        id: sockLoader
        active: true
        sourceComponent: Component {
            Socket {
                path: root.socketPath
                connected: true

                parser: SplitParser {
                    onRead: message => {
                        try {
                            root.state = JSON.parse(message)
                        } catch (e) {}
                    }
                }

                onConnectionStateChanged: {
                    if (!connected) {
                        root.state = root.emptyState
                        reconnectTimer.start()
                    } else {
                        reconnectTimer.stop()
                    }
                }

                onError: {
                    if (!connected) reconnectTimer.start()
                }
            }
        }
    }

    Timer {
        id: reconnectTimer
        interval: 3000
        repeat: true
        onTriggered: root.reconnect()
    }
}
