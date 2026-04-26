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
    property int maxAvatars: cfg.maxAvatars ?? defaults.maxAvatars ?? 5

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

        NComboBox {
            label: "最大头像数量"
            description: "状态栏最多显示几个未读头像，超出的以 +N 显示。"

            model: {
                var result = [];
                for (var i = 1; i <= 10; ++i) {
                    result.push({ key: String(i), name: String(i) });
                }
                return result;
            }

            currentKey: String(root.maxAvatars)
            onSelected: key => root.maxAvatars = parseInt(key)
        }
    }

    function saveSettings() {
        if (!pluginApi) return
        pluginApi.pluginSettings.socketPath = root.socketPath
        pluginApi.pluginSettings.maxAvatars = root.maxAvatars
        pluginApi.saveSettings()
    }
}
