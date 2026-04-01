import QtQuick
import QtQuick.Layouts
import Quickshell
import Quickshell.Io
import qs.Commons
import qs.Services.UI
import qs.Widgets

Item {
    id: root

    property var pluginApi

    readonly property var state: pluginApi?.mainInstance?.state ?? ({})
    readonly property real uin: state.uin ?? 0
    readonly property string nickname: state.nickname ?? ""
    readonly property var rooms: state.rooms ?? []

    property real contentPreferredWidth: 320
    property real contentPreferredHeight: Math.min(headerHeight + roomListHeight + Style.marginM * 3 + 1, 520)

    readonly property real headerHeight: 72
    readonly property real roomItemHeight: 56
    readonly property real roomListHeight: Math.max(emptyHeight, rooms.length * roomItemHeight)
    readonly property real emptyHeight: 48

    function avatarUrl(roomId) {
        if (roomId < 0)
            return "https://p.qlogo.cn/gh/" + (-roomId) + "/" + (-roomId) + "/0"
        return "https://q1.qlogo.cn/g?b=qq&nk=" + roomId + "&s=140"
    }

    Column {
        anchors.fill: parent
        anchors.margins: Style.marginM
        spacing: Style.marginS

        Row {
            id: header
            width: parent.width
            height: root.headerHeight
            spacing: Style.marginM

            NImageRounded {
                width: 48
                height: 48
                radius: width / 2
                anchors.verticalCenter: parent.verticalCenter
                imagePath: root.uin > 0 ? "https://q1.qlogo.cn/g?b=qq&nk=" + root.uin + "&s=140" : ""
            }

            Column {
                anchors.verticalCenter: parent.verticalCenter
                spacing: 2
                width: header.width - 48 - selfChatBtn.width - Style.marginM * 3

                Text {
                    text: root.nickname || "Icalingua++"
                    font.pixelSize: 15
                    font.bold: true
                    color: Color.mOnSurface
                    elide: Text.ElideRight
                    width: parent.width
                }

                Text {
                    text: root.uin > 0 ? String(root.uin) : ""
                    font.pixelSize: 12
                    color: Color.mOnSurfaceVariant
                }
            }

            NIconButton {
                id: selfChatBtn
                anchors.verticalCenter: parent.verticalCenter
                baseSize: 32
                icon: "message-circle"
                colorBg: "transparent"
                colorFg: Color.mOnSurfaceVariant
                colorBgHover: Color.mHover
                colorFgHover: Color.mOnHover
                tooltipText: ""
                onClicked: {
                    root.pluginApi?.mainInstance?.openRoom(root.uin)
                    root.pluginApi?.closePanel(root.pluginApi?.panelOpenScreen)
                }
            }
        }

        Rectangle {
            width: parent.width
            height: 1
            color: Color.mOutlineVariant
        }

        Flickable {
            id: roomList
            width: parent.width
            height: parent.height - header.height - Style.marginS * 2 - 1
            contentHeight: roomColumn.height
            clip: true
            boundsMovement: Flickable.StopAtBounds

            Column {
                id: roomColumn
                width: parent.width
                spacing: 0

                Repeater {
                    model: root.rooms

                    Rectangle {
                        id: roomDelegate
                        width: roomColumn.width
                        height: root.roomItemHeight
                        radius: Style.radiusM
                        color: roomMouse.containsMouse ? Color.mHover : "transparent"

                        required property var modelData
                        readonly property real roomId: modelData.roomId ?? 0
                        readonly property string roomName: modelData.roomName ?? ""
                        readonly property int unread: modelData.unreadCount ?? 0
                        readonly property var lastMsg: modelData.lastMessage ?? ({})
                        readonly property var atFlag: modelData.at

                        Row {
                            anchors.fill: parent
                            anchors.leftMargin: Style.marginS
                            anchors.rightMargin: Style.marginS
                            spacing: Style.marginS

                            NImageRounded {
                                width: 36
                                height: 36
                                radius: width / 2
                                anchors.verticalCenter: parent.verticalCenter
                                imagePath: root.avatarUrl(roomDelegate.roomId)
                            }

                            Column {
                                anchors.verticalCenter: parent.verticalCenter
                                width: parent.width - 36 - badgeCol.width - Style.marginS * 3
                                spacing: 2

                                Text {
                                    text: roomDelegate.roomName
                                    font.pixelSize: 13
                                    font.bold: true
                                    color: Color.mOnSurface
                                    elide: Text.ElideRight
                                    width: parent.width
                                }

                                Text {
                                    text: {
                                        var msg = roomDelegate.lastMsg
                                        if (!msg || !msg.content) return ""
                                        if (roomDelegate.roomId < 0 && msg.username)
                                            return msg.username + ": " + msg.content
                                        return msg.content
                                    }
                                    font.pixelSize: 11
                                    color: Color.mOnSurfaceVariant
                                    elide: Text.ElideRight
                                    width: parent.width
                                    maximumLineCount: 1
                                }
                            }

                            Column {
                                id: badgeCol
                                anchors.verticalCenter: parent.verticalCenter
                                spacing: 2
                                width: Math.max(unreadBadge.width, atLabel.visible ? atLabel.width : 0)

                                Rectangle {
                                    id: unreadBadge
                                    width: Math.max(unreadText.contentWidth + 10, height)
                                    height: 18
                                    radius: height / 2
                                    color: Color.mError
                                    anchors.horizontalCenter: parent.horizontalCenter

                                    Text {
                                        id: unreadText
                                        anchors.centerIn: parent
                                        text: roomDelegate.unread > 99 ? "99+" : roomDelegate.unread
                                        font.pixelSize: 10
                                        font.bold: true
                                        color: "white"
                                    }
                                }

                                Text {
                                    id: atLabel
                                    visible: !!roomDelegate.atFlag
                                    text: roomDelegate.atFlag === "all" ? "@All" : "@"
                                    font.pixelSize: 10
                                    font.bold: true
                                    color: Color.mError
                                    anchors.horizontalCenter: parent.horizontalCenter
                                }
                            }
                        }

                        MouseArea {
                            id: roomMouse
                            anchors.fill: parent
                            hoverEnabled: true
                            cursorShape: Qt.PointingHandCursor
                            onClicked: {
                                root.pluginApi?.mainInstance?.openRoom(roomDelegate.roomId)
                                root.pluginApi?.closePanel(root.pluginApi?.panelOpenScreen)
                            }
                        }
                    }
                }

                Item {
                    visible: root.rooms.length === 0
                    width: parent.width
                    height: root.emptyHeight

                    Text {
                        anchors.centerIn: parent
                        text: root.uin > 0 ? "没有未读消息" : "未连接"
                        font.pixelSize: 13
                        color: Color.mOnSurfaceVariant
                    }
                }
            }
        }
    }

}
