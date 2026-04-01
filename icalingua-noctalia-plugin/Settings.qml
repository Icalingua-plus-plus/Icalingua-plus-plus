import QtQuick
import QtQuick.Layouts
import qs.Commons
import qs.Widgets

ColumnLayout {
    id: root

    property var pluginApi: null

    property var cfg: pluginApi?.pluginSettings || ({})
    property var defaults: pluginApi?.manifest?.metadata?.defaultSettings || ({})

    property string socketPath: cfg.socketPath ?? defaults.socketPath ?? "/tmp/icalingua-noctalia.sock"

    spacing: Style.marginL

    ColumnLayout {
        spacing: Style.marginM
        Layout.fillWidth: true

        NTextInput {
            Layout.fillWidth: true
            label: "Socket 路径"
            description: "Icalingua++ 的 Unix socket 地址。多开时每个实例路径不同。"
            placeholderText: "/tmp/icalingua-noctalia.sock"
            text: root.socketPath
            onTextChanged: root.socketPath = text
        }
    }

    function saveSettings() {
        if (!pluginApi) return
        pluginApi.pluginSettings.socketPath = root.socketPath
        pluginApi.saveSettings()
    }
}
