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
        sock.write(JSON.stringify({action: "open", roomId: roomId}) + "\n")
        sock.flush()
    }

    readonly property string socketPath: pluginApi.pluginSettings.socketPath || "/tmp/icalingua-noctalia.sock"

    Socket {
        id: sock
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
    }

    Timer {
        id: reconnectTimer
        interval: 3000
        repeat: true
        onTriggered: {
            sock.connected = false
            sock.connected = true
        }
    }
}
