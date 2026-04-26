import QtQuick
import Quickshell
import qs.Commons
import qs.Modules.Bar.Extras
import qs.Services.UI
import qs.Widgets

Item {
    id: root

    property var pluginApi
    property ShellScreen screen

    property string widgetId: ""
    property string section: ""
    property int sectionWidgetIndex: -1
    property int sectionWidgetsCount: 0

    readonly property var state: pluginApi?.mainInstance?.state ?? ({})
    readonly property int unreadCount: state.unreadCount ?? 0
    readonly property var rooms: state.rooms ?? []
    readonly property real uin: state.uin ?? 0
    readonly property bool isDark: Settings.data.colorSchemes.darkMode
    property bool hovering: false

    // 设置：最多显示几个头像
    readonly property var cfg: pluginApi?.pluginSettings || ({})
    readonly property var defaults: pluginApi?.manifest?.metadata?.defaultSettings || ({})
    readonly property int maxAvatars: cfg.maxAvatars ?? defaults.maxAvatars ?? 5

    // 实际显示的头像数和溢出数
    readonly property int visibleCount: Math.min(unreadCount, maxAvatars)
    readonly property int overflowCount: Math.max(0, unreadCount - maxAvatars)

    readonly property string screenName: screen ? screen.name : ""
    readonly property real capsuleHeight: Style.getCapsuleHeightForScreen(screenName)
    readonly property real iconSize: Style.toOdd(capsuleHeight * 0.65)
    readonly property real avatarSize: Style.toOdd(capsuleHeight * 0.75)
    readonly property real fontSize: Style.getBarFontSizeForScreen(screenName)

    readonly property string iconFile: {
        if (hovering)
            return isDark ? "icon-dark.png" : "icon-light.png"
        return isDark ? "icon-light.png" : "icon-dark.png"
    }

    // 头像重叠
    readonly property real avatarOverlap: Math.round(avatarSize * 0.2)
    readonly property real avatarStep: avatarSize - avatarOverlap

    // 头像区域宽度
    readonly property real avatarsWidth: visibleCount > 0 ? avatarSize + (visibleCount - 1) * avatarStep : 0

    // 溢出文字宽度估算
    readonly property real overflowTextWidth: {
        if (overflowCount <= 0) return 0
        var str = "+" + overflowCount
        return str.length * fontSize * 0.7 + Math.round(capsuleHeight * 0.2)
    }

    // 图标占 capsuleHeight 宽；有未读时右边追加头像（和溢出文字）
    readonly property real paddingH: Math.round(capsuleHeight * 0.2)
    readonly property real contentWidth: {
        if (unreadCount <= 0) return capsuleHeight
        return capsuleHeight + avatarsWidth + overflowTextWidth + paddingH
    }

    visible: uin > 0
    opacity: uin > 0 ? 1.0 : 0.0
    anchors.fill: parent
    implicitWidth: uin > 0 ? contentWidth : 0
    implicitHeight: capsuleHeight

    function avatarUrl(roomId) {
        if (roomId < 0)
            return "https://p.qlogo.cn/gh/" + (-roomId) + "/" + (-roomId) + "/0"
        return "https://q1.qlogo.cn/g?b=qq&nk=" + roomId + "&s=140"
    }

    // 背景板（始终显示，宽度随内容变化）
    Rectangle {
        id: background
        width: root.contentWidth
        height: root.capsuleHeight
        radius: Style.radiusL
        anchors.verticalCenter: parent.verticalCenter
        color: root.hovering ? Color.mHover : Style.capsuleColor
        border.color: root.hovering ? Color.mOutline : Style.capsuleBorderColor
        border.width: Style.capsuleBorderWidth

        Behavior on color {
            enabled: !Color.isTransitioning
            ColorAnimation {
                duration: Style.animationFast
                easing.type: Easing.InOutQuad
            }
        }
    }

    // Icalingua 图标（始终显示，左侧）
    Rectangle {
        id: iconCircle
        width: root.capsuleHeight
        height: root.capsuleHeight
        radius: Math.min(Style.radiusL, width / 2)
        color: "transparent"
        anchors.verticalCenter: parent.verticalCenter

        Image {
            width: root.iconSize
            height: root.iconSize
            anchors.centerIn: parent
            source: "file://" + (root.pluginApi?.pluginDir ?? "") + "/assets/" + root.iconFile
            smooth: true
            mipmap: true
        }
    }

    // 头像行（有未读时显示，紧跟图标右边）
    Item {
        id: avatarsRow
        visible: root.unreadCount > 0
        x: root.capsuleHeight
        anchors.verticalCenter: parent.verticalCenter
        width: root.avatarsWidth
        height: root.avatarSize

        Repeater {
            model: root.rooms

            Item {
                required property var modelData
                required property int index

                visible: index < root.maxAvatars
                x: index * root.avatarStep
                width: root.avatarSize
                height: root.avatarSize
                z: root.visibleCount - index

                Rectangle {
                    anchors.centerIn: parent
                    width: root.avatarSize
                    height: root.avatarSize
                    radius: width / 2
                    // 边框色与背景一致，实现重叠时的视觉分隔
                    color: root.hovering ? Color.mHover : Style.capsuleColor

                    NImageRounded {
                        anchors.centerIn: parent
                        width: root.avatarSize - 2
                        height: root.avatarSize - 2
                        radius: width / 2
                        imagePath: root.avatarUrl(modelData.roomId ?? 0)
                    }
                }
            }
        }
    }

    // 溢出数字 "+N"
    NText {
        id: overflowText
        visible: root.overflowCount > 0
        anchors.verticalCenter: parent.verticalCenter
        x: root.capsuleHeight + root.avatarsWidth + Math.round(capsuleHeight * 0.1)
        text: "+" + root.overflowCount
        family: Settings.data.ui.fontFixed
        pointSize: root.fontSize
        applyUiScale: false
        color: root.hovering ? Color.mOnHover : Color.mOnSurface

        Behavior on color {
            enabled: !Color.isTransitioning
            ColorAnimation {
                duration: Style.animationFast
                easing.type: Easing.InOutQuad
            }
        }
    }

    MouseArea {
        anchors.fill: parent
        hoverEnabled: true
        cursorShape: Qt.PointingHandCursor
        onEntered: root.hovering = true
        onExited: root.hovering = false
        onClicked: root.pluginApi?.togglePanel(screen, root)
    }
}
