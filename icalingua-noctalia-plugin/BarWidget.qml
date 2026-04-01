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
    readonly property real uin: state.uin ?? 0
    readonly property bool isDark: Settings.data.colorSchemes.darkMode
    property bool hovering: false

    readonly property string screenName: screen ? screen.name : ""
    readonly property real capsuleHeight: Style.getCapsuleHeightForScreen(screenName)
    readonly property real iconSize: Style.toOdd(capsuleHeight * 0.65)
    readonly property real fontSize: Style.getBarFontSizeForScreen(screenName)

    readonly property string iconFile: {
        if (hovering)
            return isDark ? "icon-dark.png" : "icon-light.png"
        return isDark ? "icon-light.png" : "icon-dark.png"
    }

    visible: uin > 0
    opacity: uin > 0 ? 1.0 : 0.0
    anchors.fill: parent
    implicitWidth: uin > 0 ? contentWidth : 0
    implicitHeight: capsuleHeight

    readonly property bool hasText: unreadCount > 0
    readonly property real textWidth: hasText ? textItem.implicitWidth : 0
    readonly property real paddingH: Math.round(capsuleHeight * 0.2)
    readonly property real overlap: Math.round(capsuleHeight * 0.3)
    readonly property real contentWidth: capsuleHeight + (hasText ? Math.max(0, textWidth + paddingH * 2) : 0)

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

    NText {
        id: textItem
        visible: root.hasText
        anchors.verticalCenter: parent.verticalCenter
        x: iconCircle.width - root.overlap / 2 + (root.contentWidth - iconCircle.width - implicitWidth) / 2
        text: root.unreadCount > 99 ? "99+" : String(root.unreadCount)
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
