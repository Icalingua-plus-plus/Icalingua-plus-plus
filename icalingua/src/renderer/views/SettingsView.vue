<template>
    <div class="settings-page">
        <div class="settings-layout">
            <nav class="settings-nav" aria-label="设置分类">
                <button
                    v-for="item in navigation"
                    :key="item.id"
                    class="nav-item"
                    :class="{ active: activeSection === item.id }"
                    type="button"
                    @click="scrollToSection(item.id, $event)"
                >
                    <span class="nav-icon"><i :class="item.icon"></i></span>
                    <span class="nav-copy">
                        <strong>{{ item.label }}</strong>
                        <small>{{ item.description }}</small>
                    </span>
                    <i class="el-icon-arrow-right nav-arrow"></i>
                </button>
            </nav>

            <main ref="content" class="settings-content">
                <section id="settings-general" class="settings-section">
                    <div class="section-heading">
                        <div>
                            <span class="section-kicker">01 / GENERAL</span>
                            <h2>通用</h2>
                            <p>启动、操作和安全习惯，打开应用时按你的习惯。</p>
                        </div>
                    </div>

                    <div class="settings-card">
                        <div class="card-heading">
                            <span class="card-icon blue"><i class="el-icon-setting"></i></span>
                            <div>
                                <h3>启动与操作</h3>
                                <p>启动与操作的设置</p>
                            </div>
                        </div>
                        <div class="setting-row">
                            <div class="setting-copy">
                                <strong>自动登录</strong>
                                <span>启动应用后自动登录当前账号</span>
                            </div>
                            <el-switch
                                :value="settings.account.autologin"
                                @change="updateAccountSetting('autologin', $event)"
                            />
                        </div>
                        <div class="setting-row">
                            <div class="setting-copy">
                                <strong>启动时检查更新</strong>
                                <span>在应用启动时检查可用的新版本</span>
                            </div>
                            <el-switch
                                :value="settings.updateCheck === true"
                                @change="updateSetting('updateCheck', $event)"
                            />
                        </div>
                        <div class="setting-row">
                            <div class="setting-copy">
                                <strong>禁用 Ctrl + Q 退出快捷键</strong>
                                <span>避免误触导致应用退出</span>
                            </div>
                            <el-switch
                                :value="settings.disableQuitShortcut"
                                @change="updateSetting('disableQuitShortcut', $event)"
                            />
                        </div>
                    </div>

                    <div class="action-grid">
                        <button class="action-card" type="button" @click="openSetLockPassword">
                            <span class="action-icon purple"><i class="el-icon-lock"></i></span>
                            <span class="action-copy">
                                <strong>锁定口令</strong>
                                <small>{{ settings.lockPassword ? '已设置 · 点击修改' : '尚未设置' }}</small>
                            </span>
                            <i class="el-icon-arrow-right"></i>
                        </button>
                    </div>
                </section>

                <section id="settings-appearance" class="settings-section">
                    <div class="section-heading">
                        <div>
                            <span class="section-kicker">02 / LOOK & FEEL</span>
                            <h2>界面</h2>
                            <p>颜色、缩放和窗口行为都集中在这里。</p>
                        </div>
                    </div>

                    <div class="settings-card">
                        <div class="card-heading">
                            <span class="card-icon purple"><i class="el-icon-magic-stick"></i></span>
                            <div>
                                <h3>主题</h3>
                                <p>选择适合当前环境的外观</p>
                            </div>
                        </div>
                        <div class="theme-grid">
                            <button
                                v-for="theme in themeOptions"
                                :key="theme"
                                class="theme-option"
                                :class="{ active: settings.theme === theme }"
                                type="button"
                                @click="selectTheme(theme)"
                            >
                                <span class="theme-preview" :style="themePreviewStyle(theme)"></span>
                                <span>{{ themeLabel(theme) }}</span>
                            </button>
                        </div>
                    </div>

                    <div class="settings-card">
                        <div class="card-heading">
                            <span class="card-icon teal"><i class="el-icon-monitor"></i></span>
                            <div>
                                <h3>窗口与缩放</h3>
                                <p>调整窗口样式和界面缩放比例</p>
                            </div>
                        </div>
                        <div class="setting-row">
                            <div class="setting-copy">
                                <strong>界面缩放</strong>
                                <span>同步应用主窗口和独立聊天窗口</span>
                            </div>
                            <el-select
                                :value="settings.zoomFactor"
                                class="compact-select"
                                size="small"
                                @change="updateSetting('zoomFactor', $event)"
                            >
                                <el-option
                                    v-for="factor in zoomOptions"
                                    :key="factor"
                                    :label="factor + '%'"
                                    :value="factor"
                                />
                            </el-select>
                        </div>
                        <div class="setting-row">
                            <div class="setting-copy">
                                <strong>显示菜单栏</strong>
                                <span>关闭后仍可从托盘和快捷键打开设置</span>
                            </div>
                            <el-switch :value="settings.showAppMenu" @change="updateSetting('showAppMenu', $event)" />
                        </div>
                        <div class="setting-row">
                            <div class="setting-copy">
                                <strong>隐藏标题栏</strong>
                                <span>使用无边框窗口，切换后主窗口会重建</span>
                            </div>
                            <el-switch :value="settings.hideTitleBar" @change="updateSetting('hideTitleBar', $event)" />
                        </div>
                    </div>
                </section>

                <section id="settings-chat" class="settings-section">
                    <div class="section-heading">
                        <div>
                            <span class="section-kicker">03 / CHAT SPACE</span>
                            <h2>聊天</h2>
                            <p>让消息列表、媒体和会话侧栏更符合你的使用习惯。</p>
                        </div>
                    </div>

                    <div class="settings-card">
                        <div class="card-heading">
                            <span class="card-icon orange"><i class="el-icon-chat-line-round"></i></span>
                            <div>
                                <h3>内容显示</h3>
                                <p>控制聊天内容的默认呈现方式</p>
                            </div>
                        </div>
                        <div class="setting-row">
                            <div class="setting-copy">
                                <strong>默认隐藏聊天图片</strong>
                                <span>需要查看时仍可在消息中展开</span>
                            </div>
                            <el-switch
                                :value="settings.hideChatImageByDefault"
                                @change="updateSetting('hideChatImageByDefault', $event)"
                            />
                        </div>
                        <div class="setting-row">
                            <div class="setting-copy">
                                <strong>默认隐藏聊天视频</strong>
                                <span>减少媒体较多的会话的流量消耗</span>
                            </div>
                            <el-switch
                                :value="settings.hideChatVideoByDefault"
                                @change="updateSetting('hideChatVideoByDefault', $event)"
                            />
                        </div>
                        <div class="setting-row">
                            <div class="setting-copy">
                                <strong>启用 URL 高亮</strong>
                                <span>将聊天中的链接识别为可点击内容，重新加载后生效</span>
                            </div>
                            <el-switch :value="settings.linkify" @change="updateSetting('linkify', $event)" />
                        </div>
                        <div class="setting-row">
                            <div class="setting-copy">
                                <strong>使用本地图片查看器</strong>
                                <span>优先用系统图片查看器打开图片</span>
                            </div>
                            <el-switch
                                :value="settings.localImageViewerByDefault"
                                @change="updateSetting('localImageViewerByDefault', $event)"
                            />
                        </div>
                        <div class="setting-row">
                            <div class="setting-copy">
                                <strong>启用超级表情</strong>
                                <span>关闭后可减少表情动画和资源占用</span>
                            </div>
                            <el-switch
                                :value="!settings.disableQLottie"
                                @change="updateSetting('disableQLottie', !$event)"
                            />
                        </div>
                        <div class="setting-row">
                            <div class="setting-copy">
                                <strong>同会话多图切换</strong>
                                <span>允许在图片消息间快速切换查看</span>
                            </div>
                            <el-switch
                                :value="!settings.singleImageMode"
                                @change="updateSetting('singleImageMode', !$event)"
                            />
                        </div>
                        <div class="setting-row">
                            <div class="setting-copy">
                                <strong>启用图片查看器触摸板手势</strong>
                                <span>在图片查看器中支持使用触摸板缩放和切换</span>
                            </div>
                            <el-switch
                                :value="!settings.disableImgViewTouchPad"
                                @change="updateSetting('disableImgViewTouchPad', !$event)"
                            />
                        </div>
                        <div class="setting-row">
                            <div class="setting-copy">
                                <strong>禁用文件类型选择框</strong>
                                <span>拖拽文件时不要求选择文件类型</span>
                            </div>
                            <el-switch
                                :value="settings.disableChooseFileType"
                                @change="updateSetting('disableChooseFileType', $event)"
                            />
                        </div>
                    </div>

                    <div class="settings-card">
                        <div class="card-heading">
                            <span class="card-icon pink"><i class="el-icon-menu"></i></span>
                            <div>
                                <h3>会话列表与表情面板</h3>
                                <p>整理侧栏信息和表情面板的行为</p>
                            </div>
                        </div>
                        <div class="setting-row">
                            <div class="setting-copy">
                                <strong>启用聊天分组</strong>
                                <span>开启分组整理好友和群聊的功能</span>
                            </div>
                            <el-switch
                                :value="!settings.disableChatGroups"
                                @change="updateSetting('disableChatGroups', !$event)"
                            />
                        </div>
                        <div class="setting-row">
                            <div class="setting-copy">
                                <strong>显示分组未读红点</strong>
                                <span>在聊天分组入口显示未读提示</span>
                            </div>
                            <el-switch
                                :value="!settings.disableChatGroupsRedPoint"
                                :disabled="settings.disableChatGroups"
                                @change="updateSetting('disableChatGroupsRedPoint', !$event)"
                            />
                        </div>
                        <div class="setting-row">
                            <div class="setting-copy">
                                <strong>统计分组中的 @全体</strong>
                                <span>将 @全体 的消息计入分组未读数</span>
                            </div>
                            <el-switch
                                :value="settings.countAtAllInChatGroups"
                                :disabled="settings.disableChatGroups"
                                @change="updateSetting('countAtAllInChatGroups', $event)"
                            />
                        </div>
                        <div class="setting-row">
                            <div class="setting-copy">
                                <strong>启用自适应单面板模式</strong>
                                <span>窗口较窄时自动切换到单面板布局</span>
                            </div>
                            <el-switch
                                :value="settings.useSinglePanel"
                                @change="updateSetting('useSinglePanel', $event)"
                            />
                        </div>
                        <div class="setting-row">
                            <div class="setting-copy">
                                <strong>移除群名中的表情</strong>
                                <span>去掉那些乱码的表情代码</span>
                            </div>
                            <el-switch
                                :value="settings.removeGroupNameEmotes"
                                @change="updateSetting('removeGroupNameEmotes', $event)"
                            />
                        </div>
                        <div class="setting-row">
                            <div class="setting-copy">
                                <strong>底部固定表情面板</strong>
                                <span>将表情面板横向放在聊天区下方</span>
                            </div>
                            <el-switch
                                :value="settings.stickerPanelBottom"
                                @change="updateSetting('stickerPanelBottom', $event)"
                            />
                        </div>
                        <div class="setting-row">
                            <div class="setting-copy">
                                <strong>时间倒序排列 Stickers</strong>
                                <span>按照添加时间倒序显示 Stickers</span>
                            </div>
                            <el-switch
                                :value="settings.descSortStickersByTime"
                                @change="updateSetting('descSortStickersByTime', $event)"
                            />
                        </div>
                    </div>

                    <div class="action-grid">
                        <button class="action-card" type="button" @click="openIgnoreManage">
                            <span class="action-icon pink"><i class="el-icon-minus"></i></span>
                            <span class="action-copy">
                                <strong>屏蔽的会话</strong>
                                <small>管理不想出现在列表中的会话</small>
                            </span>
                            <i class="el-icon-arrow-right"></i>
                        </button>
                    </div>
                </section>

                <section id="settings-messages" class="settings-section">
                    <div class="section-heading">
                        <div>
                            <span class="section-kicker">04 / MESSAGE FLOW</span>
                            <h2>消息</h2>
                            <p>发送方式、媒体质量和文字排版偏好。</p>
                        </div>
                    </div>

                    <div class="settings-card">
                        <div class="card-heading">
                            <span class="card-icon green"><i class="el-icon-edit"></i></span>
                            <div>
                                <h3>发送与阅读</h3>
                                <p>让输入和消息呈现更顺手</p>
                            </div>
                        </div>
                        <div class="setting-row">
                            <div class="setting-copy">
                                <strong>发送消息快捷键</strong>
                                <span>Enter 发送，或用组合键发送</span>
                            </div>
                            <el-select
                                :value="settings.keyToSendMessage"
                                class="compact-select key-select"
                                size="small"
                                @change="updateSetting('keyToSendMessage', $event)"
                            >
                                <el-option label="Enter" value="Enter" />
                                <el-option label="Ctrl + Enter" value="CtrlEnter" />
                                <el-option label="Shift + Enter" value="ShiftEnter" />
                            </el-select>
                        </div>
                        <div class="setting-row">
                            <div class="setting-copy">
                                <strong>匿名发送群消息</strong>
                                <span>仅在当前协议支持时生效</span>
                            </div>
                            <el-switch
                                :value="settings.anonymous"
                                :disabled="settings.sendRawMessage"
                                @change="updateSetting('anonymous', $event)"
                            />
                        </div>
                        <div class="setting-row">
                            <div class="setting-copy">
                                <strong>发送高清语音</strong>
                                <span>优先发送更高质量的语音消息</span>
                            </div>
                            <el-switch
                                :value="settings.sendSilkAudio"
                                @change="updateSetting('sendSilkAudio', $event)"
                            />
                        </div>
                        <div class="setting-row">
                            <div class="setting-copy">
                                <strong>压缩发送图片</strong>
                                <span>使用 JPG 75% 质量压缩，减少发送体积</span>
                            </div>
                            <el-switch
                                :value="settings.compressImages"
                                @change="updateSetting('compressImages', $event)"
                            />
                        </div>
                        <div class="setting-row">
                            <div class="setting-copy">
                                <strong>查看消息时使用 Pangu.js</strong>
                                <span>在中英文、数字之间自动添加空格</span>
                            </div>
                            <el-switch
                                :value="settings.usePanguJsRecv"
                                @change="updateSetting('usePanguJsRecv', $event)"
                            />
                        </div>
                        <div class="setting-row">
                            <div class="setting-copy">
                                <strong>发送消息时使用 Pangu.js</strong>
                                <span>发送前整理中英文间距，不包括 +1</span>
                            </div>
                            <el-switch
                                :value="settings.usePanguJsSend"
                                @change="updateSetting('usePanguJsSend', $event)"
                            />
                        </div>
                    </div>
                </section>

                <section id="settings-notifications" class="settings-section">
                    <div class="section-heading">
                        <div>
                            <span class="section-kicker">05 / NOTIFICATIONS</span>
                            <h2>通知</h2>
                            <p>决定哪些消息值得打断你，以及会话如何排序。</p>
                        </div>
                    </div>

                    <div class="settings-card">
                        <div class="card-heading">
                            <span class="card-icon red"><i class="el-icon-bell"></i></span>
                            <div>
                                <h3>通知策略</h3>
                                <p>优先级越高，越容易被及时注意到</p>
                            </div>
                        </div>
                        <div class="setting-row priority-row">
                            <div class="setting-copy">
                                <strong>通知优先级</strong>
                                <span>大等于本优先级的会话会弹出消息通知</span>
                            </div>
                            <el-radio-group
                                :value="settings.priority"
                                size="small"
                                @input="updateSetting('priority', $event)"
                            >
                                <el-radio-button v-for="priority in priorities" :key="priority" :label="priority">
                                    {{ priority }}
                                </el-radio-button>
                            </el-radio-group>
                        </div>
                        <div class="setting-row">
                            <div class="setting-copy">
                                <strong>按通知优先级排序会话</strong>
                                <span>让高优先级的会话更容易被看到</span>
                            </div>
                            <el-switch
                                :value="settings.sortRoomsByPriority"
                                @change="updateSetting('sortRoomsByPriority', $event)"
                            />
                        </div>
                        <div class="setting-row">
                            <div class="setting-copy">
                                <strong>启用桌面通知</strong>
                                <span>关闭后将不再弹出新消息通知</span>
                            </div>
                            <el-switch
                                :value="!settings.disableNotification"
                                @change="updateSetting('disableNotification', !$event)"
                            />
                        </div>
                        <div class="setting-row">
                            <div class="setting-copy">
                                <strong>接收 @全体通知</strong>
                                <span>关闭桌面通知后，此项不会单独生效</span>
                            </div>
                            <el-switch
                                :value="!settings.disableAtAll"
                                :disabled="settings.disableNotification"
                                @change="updateSetting('disableAtAll', !$event)"
                            />
                        </div>
                        <div class="setting-row">
                            <div class="setting-copy">
                                <strong>通知优先级说明</strong>
                                <span>查看通知优先级和提醒行为的说明图</span>
                            </div>
                            <el-button size="mini" plain @click="openNotificationHelp">查看说明</el-button>
                        </div>
                    </div>
                </section>

                <section id="settings-history" class="settings-section">
                    <div class="section-heading">
                        <div>
                            <span class="section-kicker">06 / HISTORY & PERFORMANCE</span>
                            <h2>历史与性能</h2>
                            <p>平衡历史消息加载速度、稳定性和本地数据同步。</p>
                        </div>
                    </div>

                    <div class="settings-card">
                        <div class="card-heading">
                            <span class="card-icon indigo"><i class="el-icon-time"></i></span>
                            <div>
                                <h3>历史消息</h3>
                                <p>控制历史消息何时加载，以及会话清理策略</p>
                            </div>
                        </div>
                        <div class="setting-row">
                            <div class="setting-copy">
                                <strong>切换会话时自动获取历史消息</strong>
                                <span>打开会话后自动从服务器拉取最近的历史消息</span>
                            </div>
                            <el-switch
                                :value="settings.fetchHistoryOnChatOpen"
                                @change="updateSetting('fetchHistoryOnChatOpen', $event)"
                            />
                        </div>
                        <div class="setting-row" v-if="settings.adapter === 'oicq'">
                            <div class="setting-copy">
                                <strong>启动时自动获取历史消息</strong>
                                <span>登录后为最近一周有消息的会话拉取历史消息</span>
                            </div>
                            <el-switch
                                :value="settings.fetchHistoryOnStart"
                                @change="updateSetting('fetchHistoryOnStart', $event)"
                            />
                        </div>
                        <div class="setting-row">
                            <div class="setting-copy">
                                <strong>静默获取历史消息</strong>
                                <span>隐藏拉取历史消息时的提示，减少打扰</span>
                            </div>
                            <el-switch
                                :value="settings.silentFetchHistory"
                                @change="updateSetting('silentFetchHistory', $event)"
                            />
                        </div>
                        <div class="setting-row">
                            <div class="setting-copy">
                                <strong>清理会话按钮</strong>
                                <span>决定会话列表中的清理按钮会移除哪些会话</span>
                            </div>
                            <el-select
                                :value="settings.clearRoomsBehavior"
                                class="compact-select clear-select"
                                size="small"
                                @change="updateSetting('clearRoomsBehavior', $event)"
                            >
                                <el-option label="禁用" value="disabled" />
                                <el-option label="一小时前" value="1HourAgo" />
                                <el-option label="一天前" value="1DayAgo" />
                                <el-option label="一周前" value="1WeekAgo" />
                                <el-option label="所有未置顶" value="AllUnpined" />
                            </el-select>
                        </div>
                        <div class="setting-row" v-if="settings.adapter === 'socketIo'">
                            <div class="setting-copy">
                                <strong>将 Bridge 数据同步到本地数据库</strong>
                                <span>将 Bridge 传递的数据同步到本地的 SQLite 数据库，便于离线搜索</span>
                            </div>
                            <el-switch
                                :value="settings.bridgeLocalDatabaseSync"
                                @change="updateSetting('bridgeLocalDatabaseSync', $event)"
                            />
                        </div>
                    </div>

                    <div class="settings-card">
                        <div class="card-heading">
                            <span class="card-icon cyan"><i class="el-icon-data-analysis"></i></span>
                            <div>
                                <h3>性能优化</h3>
                                <p>建议优先使用默认方案，其他选项可能存在兼容性问题</p>
                            </div>
                        </div>
                        <div class="setting-row performance-row">
                            <div class="setting-copy">
                                <strong>消息列表加载方式</strong>
                                <span v-if="settings.optimizeMethod === 'infinite-loading'"
                                    >稳定的分页加载，适合长时间运行</span
                                >
                                <span v-else-if="settings.optimizeMethod === 'scroll'"
                                    >滚动预加载，可能存在兼容性问题</span
                                >
                                <span v-else>关闭优化，长时间运行可能造成前端卡顿</span>
                            </div>
                            <el-select
                                :value="settings.optimizeMethod"
                                class="compact-select performance-select"
                                size="small"
                                @change="updateOptimizeMethod"
                            >
                                <el-option label="分页加载（默认）" value="infinite-loading" />
                                <el-option label="滚动预加载（实验性）" value="scroll" />
                                <el-option label="关闭（不推荐）" value="none" />
                            </el-select>
                        </div>
                    </div>
                </section>

                <section id="settings-services" class="settings-section">
                    <div class="section-heading">
                        <div>
                            <span class="section-kicker">07 / DOWNLOADS & SERVICES</span>
                            <h2>下载与服务</h2>
                            <p>文件保存位置和远程下载管理。</p>
                        </div>
                    </div>

                    <div class="settings-card">
                        <div class="card-heading">
                            <span class="card-icon yellow"><i class="el-icon-folder-opened"></i></span>
                            <div>
                                <h3>文件下载目录</h3>
                                <p>设置文件默认下载目录</p>
                            </div>
                        </div>
                        <div class="path-row">
                            <div class="path-copy">
                                <strong>默认下载目录</strong>
                                <span>{{ downloadPathLabel }}</span>
                            </div>
                            <div class="path-actions">
                                <el-button size="mini" plain @click="chooseDownloadPath">选择目录</el-button>
                                <el-button
                                    size="mini"
                                    plain
                                    :disabled="!settings.downloadPath"
                                    @click="resetDownloadPath"
                                >
                                    恢复默认
                                </el-button>
                            </div>
                        </div>
                    </div>

                    <div class="action-grid">
                        <button class="action-card" type="button" @click="openAria2Settings">
                            <span class="action-icon blue"><i class="el-icon-download"></i></span>
                            <span class="action-copy">
                                <strong>Aria2 下载管理</strong>
                                <small>{{
                                    settings.aria2.enabled ? '已启用 · 管理连接设置' : '未启用 · 配置远程下载'
                                }}</small>
                            </span>
                            <i class="el-icon-arrow-right"></i>
                        </button>
                    </div>
                </section>

                <section id="settings-advanced" class="settings-section last-section">
                    <div class="section-heading">
                        <div>
                            <span class="section-kicker">08 / ADVANCED</span>
                            <h2>高级</h2>
                            <p>面向熟悉 Icalingua++ 行为的用户。</p>
                        </div>
                    </div>

                    <div class="settings-card">
                        <div class="card-heading">
                            <span class="card-icon slate"><i class="el-icon-connection"></i></span>
                            <div>
                                <h3>扩展与运行</h3>
                                <p>这些选项可能会影响协议能力或行为</p>
                            </div>
                        </div>
                        <div class="setting-row" v-if="settings.adapter === 'oicq'">
                            <div class="setting-copy">
                                <strong>启用插件</strong>
                                <span>加载用户目录中的插件</span>
                            </div>
                            <el-switch :value="settings.custom" @change="updateSetting('custom', $event)" />
                        </div>
                        <div class="setting-row" v-if="!isProduction">
                            <div class="setting-copy">
                                <strong>调试模式</strong>
                                <span>开启调试能力，仅开发构建可用</span>
                            </div>
                            <el-switch
                                :value="settings.debugmode"
                                :disabled="!settings.debugmode"
                                @change="updateSetting('debugmode', $event)"
                            />
                        </div>
                        <div class="setting-row" v-if="!isProduction">
                            <div class="setting-copy">
                                <strong>发送原始 OICQ 消息</strong>
                                <span>允许发送原始 OICQ 消息，仅在调试模式下可用</span>
                            </div>
                            <el-switch
                                :value="settings.sendRawMessage"
                                :disabled="!settings.debugmode"
                                @change="updateSetting('sendRawMessage', $event)"
                            />
                        </div>
                        <div class="info-grid">
                            <div class="info-item wide">
                                <span>数据目录</span>
                                <strong>{{ storePath || '—' }}</strong>
                            </div>
                            <div class="info-item">
                                <span>当前适配器</span>
                                <strong>{{ adapterLabel }}</strong>
                            </div>
                            <div class="info-item">
                                <span>版本</span>
                                <button
                                    class="version-trigger"
                                    type="button"
                                    :disabled="isProduction || settings.debugmode || !version"
                                    @click="handleVersionClick"
                                >
                                    {{ version || '—' }}
                                </button>
                            </div>
                            <div class="info-item">
                                <span>构建模式</span>
                                <strong>{{ isProduction ? '生产构建' : '开发/调试构建' }}</strong>
                            </div>
                        </div>
                    </div>

                    <div class="action-grid" v-if="!isProduction">
                        <button
                            class="action-card"
                            type="button"
                            :disabled="!settings.debugmode"
                            @click="openMakeForwardDebug"
                        >
                            <span class="action-icon purple"><i class="el-icon-share"></i></span>
                            <span class="action-copy">
                                <strong>合并转发调试</strong>
                                <small>测试协议合并转发构建能力</small>
                            </span>
                            <i class="el-icon-arrow-right"></i>
                        </button>
                    </div>

                    <div class="settings-note">
                        <i class="el-icon-info"></i>
                        <span>设置会即时保存到配置文件；带有“重新加载后生效”提示的选项，将在重新加载后生效。</span>
                    </div>
                </section>
            </main>
        </div>
    </div>
</template>

<script>
import ipc from '../utils/ipc'
import * as themes from '../utils/themes'
import { createRendererLifecycleScope } from '../utils/rendererLifecycleScope'

export default {
    name: 'SettingsView',
    data() {
        return {
            settings: {
                account: {},
                aria2: {},
            },
            version: '',
            isProduction: true,
            storePath: '',
            themeOptions: ['auto', 'light', 'dark'],
            activeSection: 'general',
            navigationTarget: '',
            navigationTimer: null,
            versionClickTimes: 0,
            versionClickTimer: null,
            debugModeEnabling: false,
            navigation: [
                { id: 'general', label: '通用', description: '启动与操作', icon: 'el-icon-setting' },
                { id: 'appearance', label: '界面', description: '主题与窗口', icon: 'el-icon-monitor' },
                { id: 'chat', label: '聊天', description: '显示与侧栏', icon: 'el-icon-chat-line-round' },
                { id: 'messages', label: '消息', description: '发送与阅读', icon: 'el-icon-edit' },
                { id: 'notifications', label: '通知', description: '提醒与排序', icon: 'el-icon-bell' },
                { id: 'history', label: '历史与性能', description: '加载与优化', icon: 'el-icon-time' },
                { id: 'services', label: '下载与服务', description: '目录与管理', icon: 'el-icon-download' },
                { id: 'advanced', label: '高级', description: '扩展与运行', icon: 'el-icon-connection' },
            ],
            priorities: [1, 2, 3, 4, 5],
        }
    },
    computed: {
        zoomOptions() {
            const options = [80, 90, 100, 110, 125, 150, 175, 200]
            const current = Number(this.settings.zoomFactor)
            if (Number.isFinite(current) && !options.includes(current)) options.push(current)
            return options.sort((a, b) => a - b)
        },
        adapterLabel() {
            const labels = {
                oicq: '本地 OICQ',
                socketIo: 'Bridge / Socket.IO',
                readOnly: '只读模式',
            }
            return labels[this.settings.adapter] || this.settings.adapter || '—'
        },
        downloadPathLabel() {
            return this.settings.downloadPath || '跟随系统 Downloads 文件夹'
        },
    },
    async created() {
        this.lifecycleScope = createRendererLifecycleScope()
        document.title = '设置中心'
        const [settings, buildInfo, storePath] = await Promise.all([
            ipc.getSettings(),
            ipc.getBuildInfo(),
            ipc.getStorePath(),
        ])
        this.settings = settings
        this.version = buildInfo.version
        this.isProduction = buildInfo.isProduction
        this.storePath = storePath
        themes.$$DON_CALL$$fetchThemes(storePath)
        this.themeOptions = ['auto', ...themes.getThemeList()]
    },
    mounted() {
        const content = this.$refs.content
        this.lifecycleScope.onEvent(content, 'scroll', this.updateActiveSection, { passive: true })
        this.lifecycleScope.onEvent(content, 'scrollend', this.finishSectionNavigation, { passive: true })
        this.lifecycleScope.onIpc('settings:aria2-updated', (_, aria2) => {
            if (aria2 && typeof aria2 === 'object') this.$set(this.settings, 'aria2', aria2)
        })
        this.lifecycleScope.onIpc('settings:lock-password-updated', (_, hasLockPassword) => {
            if (typeof hasLockPassword === 'boolean')
                this.$set(this.settings, 'lockPassword', hasLockPassword ? 'configured' : '')
        })
    },
    beforeDestroy() {
        if (this.navigationTimer) this.lifecycleScope?.cancelTimeout(this.navigationTimer)
        if (this.versionClickTimer) this.lifecycleScope?.cancelTimeout(this.versionClickTimer)
        this.lifecycleScope?.dispose()
    },
    methods: {
        themeLabel(theme) {
            if (theme === 'auto') return '跟随系统'
            if (theme === 'light') return '浅色'
            if (theme === 'dark') return '深色'
            return theme
        },
        themePreviewStyle(theme) {
            const previews = {
                auto: 'linear-gradient(135deg, #ffffff 0 50%, #202223 50% 100%)',
                light: 'linear-gradient(135deg, #ffffff, #e5effa)',
                dark: 'linear-gradient(135deg, #181a1b, #2a2c33)',
            }
            return { background: previews[theme] || 'linear-gradient(135deg, #1976d2, #dd5e89)' }
        },
        async updateSetting(key, value) {
            const previous = this.settings[key]
            this.settings[key] = value
            try {
                await ipc.updateSettings({ [key]: value })
            } catch (error) {
                this.settings[key] = previous
                this.$message.error('设置保存失败：' + (error.message || error))
            }
        },
        async handleVersionClick() {
            if (this.isProduction || this.settings.debugmode || this.debugModeEnabling) return

            this.versionClickTimes += 1
            if (this.versionClickTimer) this.lifecycleScope.cancelTimeout(this.versionClickTimer)
            this.versionClickTimer = this.lifecycleScope.timeout(() => {
                this.versionClickTimes = 0
                this.versionClickTimer = null
            }, 10000)
            if (this.versionClickTimes < 3) return

            this.versionClickTimes = 0
            this.lifecycleScope.cancelTimeout(this.versionClickTimer)
            this.versionClickTimer = null
            this.debugModeEnabling = true
            try {
                const updatedSettings = await ipc.updateSettings({ debugmode: true })
                if (updatedSettings.debugmode) {
                    this.$set(this.settings, 'debugmode', true)
                    this.$message.success('调试模式已开启')
                }
            } catch (error) {
                this.$message.error('调试模式开启失败：' + (error.message || error))
            } finally {
                this.debugModeEnabling = false
            }
        },
        async updateAccountSetting(key, value) {
            const previous = this.settings.account[key]
            this.settings.account[key] = value
            try {
                await ipc.updateSettings({ account: { [key]: value } })
            } catch (error) {
                this.settings.account[key] = previous
                this.$message.error('设置保存失败：' + (error.message || error))
            }
        },
        async selectTheme(theme) {
            const previous = this.settings.theme
            this.settings.theme = theme
            themes.useTheme(
                theme === 'auto' && window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : theme,
            )
            try {
                await ipc.updateSettings({ theme })
            } catch (error) {
                this.settings.theme = previous
                themes.useTheme(
                    previous === 'auto' && window.matchMedia('(prefers-color-scheme: dark)').matches
                        ? 'dark'
                        : previous,
                )
                this.$message.error('主题保存失败：' + (error.message || error))
            }
        },
        async chooseDownloadPath() {
            const selectedPath = await ipc.chooseDownloadPath()
            if (selectedPath) this.settings.downloadPath = selectedPath
        },
        async resetDownloadPath() {
            this.settings.downloadPath = ''
            await ipc.resetDownloadPath()
        },
        async updateOptimizeMethod(method) {
            if (method === 'none') {
                try {
                    await this.$confirm(
                        '关闭性能优化后，长时间挂机或浏览历史记录可能导致前端卡顿。确定要关闭吗？',
                        '性能提示',
                        {
                            confirmButtonText: '继续关闭',
                            cancelButtonText: '保持默认',
                            type: 'warning',
                        },
                    )
                } catch {
                    return
                }
            }
            this.updateSetting('optimizeMethod', method)
        },
        openAria2Settings() {
            ipc.openAria2Settings()
        },
        openIgnoreManage() {
            ipc.openIgnoreManage()
        },
        openSetLockPassword() {
            ipc.openSetLockPassword()
        },
        openMakeForwardDebug() {
            ipc.openMakeForwardDebug()
        },
        openNotificationHelp() {
            ipc.openNotificationHelp()
        },
        finishSectionNavigation() {
            if (!this.navigationTarget) return
            this.navigationTarget = ''
            if (this.navigationTimer) {
                this.lifecycleScope.cancelTimeout(this.navigationTimer)
                this.navigationTimer = null
            }
            this.updateActiveSection()
        },
        scrollToSection(id, event) {
            const target = this.$refs.content.querySelector('#settings-' + id)
            if (!target) return

            // Keep the clicked item active while the smooth scroll is running. Otherwise the
            // scroll listener briefly switches it back to the section currently at the top.
            this.navigationTarget = id
            if (this.navigationTimer) this.lifecycleScope.cancelTimeout(this.navigationTimer)
            this.navigationTimer = this.lifecycleScope.timeout(() => {
                this.navigationTimer = null
                this.finishSectionNavigation()
            }, 1500)

            target.scrollIntoView({ behavior: 'smooth', block: 'start' })
            this.activeSection = id

            // A pointer click should not leave a native button focus state behind. Keyboard
            // activation has detail === 0 and keeps its focus ring for accessibility.
            if (event && event.detail > 0 && event.currentTarget) event.currentTarget.blur()
        },
        updateActiveSection() {
            const content = this.$refs.content
            if (!content || this.navigationTarget) return
            const contentTop = content.getBoundingClientRect().top
            let current = this.navigation[0].id
            for (const item of this.navigation) {
                const section = document.getElementById('settings-' + item.id)
                if (section && section.getBoundingClientRect().top - contentTop <= 120) current = item.id
            }
            this.activeSection = current
        },
    },
}
</script>

<style scoped>
.settings-page {
    --settings-bg: var(--chat-content-bg-color, #f8f9fa);
    --settings-panel: var(--panel-background, #ffffff);
    --settings-text: var(--chat-color, #303133);
    --settings-muted: var(--panel-color-desc, #606266);
    --settings-border: rgba(127, 127, 127, 0.18);
    --settings-accent: #1976d2;
    width: 100%;
    height: 100vh;
    min-height: 0;
    box-sizing: border-box;
    display: flex;
    flex-direction: column;
    overflow: hidden;
    background: var(--settings-bg);
    color: var(--settings-text);
}

.setting-row,
.path-row,
.action-card,
.card-heading,
.section-heading,
.settings-note {
    display: flex;
    align-items: center;
}

.section-kicker {
    color: var(--settings-accent);
    font-size: 10px;
    font-weight: 700;
    letter-spacing: 0.16em;
}

.section-heading h2,
.section-heading p,
.card-heading h3,
.card-heading p,
.setting-copy strong,
.setting-copy span,
.action-copy strong,
.action-copy small,
.path-copy strong,
.path-copy span,
.info-item span,
.info-item strong {
    display: block;
}

.settings-layout {
    display: flex;
    flex: 1;
    min-height: 0;
}

.settings-nav {
    width: 220px;
    box-sizing: border-box;
    flex: 0 0 220px;
    min-height: 0;
    padding: 24px 14px 18px;
    overflow-y: auto;
    border-right: 1px solid var(--settings-border);
    background: var(--settings-panel);
}

.nav-item {
    width: 100%;
    display: flex;
    align-items: center;
    gap: 10px;
    margin: 2px 0;
    padding: 10px 9px;
    border: 0;
    border-radius: 11px;
    text-align: left;
    color: var(--settings-muted);
    background: transparent;
    -webkit-appearance: none;
    appearance: none;
    -webkit-tap-highlight-color: transparent;
    cursor: pointer;
    transition:
        color 0.16s ease,
        background 0.16s ease,
        transform 0.16s ease;
}

.nav-item:focus {
    outline: none;
}

.nav-item:active {
    transform: none;
}

.nav-item:focus-visible {
    box-shadow: 0 0 0 2px rgba(25, 118, 210, 0.3);
}

.nav-item:hover {
    color: var(--settings-text);
    background: rgba(25, 118, 210, 0.06);
}

.nav-item.active {
    color: var(--settings-accent);
    background: rgba(25, 118, 210, 0.11);
}

.nav-item.active .nav-icon {
    color: #ffffff;
    background: var(--settings-accent);
    box-shadow: 0 5px 12px rgba(25, 118, 210, 0.22);
}

.nav-icon {
    width: 30px;
    height: 30px;
    display: grid;
    place-items: center;
    flex: 0 0 auto;
    border-radius: 9px;
    color: var(--settings-muted);
    background: rgba(127, 127, 127, 0.1);
    font-size: 15px;
    transition:
        color 0.16s ease,
        background 0.16s ease;
}

.nav-copy {
    min-width: 0;
    flex: 1;
}

.nav-copy strong {
    display: block;
    font-size: 12px;
    line-height: 1.35;
}

.nav-copy small {
    display: block;
    margin-top: 2px;
    opacity: 0.72;
    font-size: 10px;
    line-height: 1.3;
}

.nav-arrow {
    opacity: 0;
    font-size: 12px;
    transform: translateX(-3px);
    transition:
        opacity 0.16s ease,
        transform 0.16s ease;
}

.nav-item.active .nav-arrow,
.nav-item:hover .nav-arrow {
    opacity: 0.8;
    transform: translateX(0);
}

.settings-content {
    min-width: 0;
    min-height: 0;
    flex: 1;
    height: 100%;
    box-sizing: border-box;
    padding: 28px 40px 56px;
    overflow-y: auto;
    scroll-behavior: smooth;
}

.settings-section {
    max-width: 920px;
    margin: 0 auto 46px;
    scroll-margin-top: 22px;
}

.last-section {
    margin-bottom: 0;
}

.section-heading {
    justify-content: space-between;
    margin-bottom: 16px;
}

.section-heading h2 {
    margin: 5px 0 4px;
    font-size: 22px;
    line-height: 1.15;
}

.section-heading p {
    margin: 0;
    color: var(--settings-muted);
    font-size: 12px;
}

.settings-card {
    margin-bottom: 14px;
    padding: 4px 22px;
    border: 1px solid var(--settings-border);
    border-radius: 15px;
    background: var(--settings-panel);
    box-shadow: var(--chat-container-box-shadow, 0 7px 18px rgba(0, 0, 0, 0.05));
}

.card-heading {
    gap: 11px;
    min-height: 64px;
    padding: 5px 0 2px;
}

.card-icon,
.action-icon {
    display: grid;
    place-items: center;
    flex: 0 0 auto;
    border-radius: 10px;
}

.card-icon {
    width: 32px;
    height: 32px;
    font-size: 15px;
}

.card-icon.blue,
.action-icon.blue {
    color: #1976d2;
    background: rgba(25, 118, 210, 0.13);
}

.card-icon.purple,
.action-icon.purple {
    color: #8e5bd9;
    background: rgba(142, 91, 217, 0.14);
}

.card-icon.teal {
    color: #008f87;
    background: rgba(0, 143, 135, 0.13);
}

.card-icon.orange {
    color: #db7a18;
    background: rgba(219, 122, 24, 0.14);
}

.card-icon.pink,
.action-icon.pink {
    color: #d4537d;
    background: rgba(212, 83, 125, 0.14);
}

.card-icon.green {
    color: #32965a;
    background: rgba(50, 150, 90, 0.14);
}

.card-icon.red {
    color: #d9534f;
    background: rgba(217, 83, 79, 0.14);
}

.card-icon.indigo {
    color: #536dce;
    background: rgba(83, 109, 206, 0.14);
}

.card-icon.cyan {
    color: #168ca2;
    background: rgba(22, 140, 162, 0.14);
}

.card-icon.yellow {
    color: #b17a0b;
    background: rgba(177, 122, 11, 0.15);
}

.card-icon.slate {
    color: #708090;
    background: rgba(112, 128, 144, 0.16);
}

.card-heading h3 {
    margin: 0 0 2px;
    font-size: 14px;
}

.card-heading p {
    margin: 0;
    color: var(--settings-muted);
    font-size: 11px;
}

.setting-row {
    min-height: 61px;
    justify-content: space-between;
    gap: 18px;
    border-top: 1px solid var(--settings-border);
}

.setting-copy {
    min-width: 0;
    flex: 1 1 auto;
    padding: 10px 0;
}

.setting-copy strong {
    font-size: 12px;
    font-weight: 600;
    line-height: 1.45;
}

.setting-copy span {
    margin-top: 3px;
    color: var(--settings-muted);
    font-size: 11px;
    line-height: 1.45;
}

.compact-select {
    width: 154px;
    flex: 0 0 auto;
}

.key-select {
    width: 142px;
}

.clear-select {
    width: 132px;
}

.performance-select {
    width: 178px;
}

.theme-grid {
    display: grid;
    grid-template-columns: repeat(auto-fit, minmax(116px, 1fr));
    gap: 10px;
    padding: 7px 0 18px 43px;
}

.theme-option {
    position: relative;
    min-height: 76px;
    display: flex;
    flex-direction: column;
    gap: 7px;
    align-items: flex-start;
    padding: 7px;
    border: 1px solid var(--settings-border);
    border-radius: 10px;
    color: var(--settings-muted);
    background: transparent;
    cursor: pointer;
    font-size: 11px;
    text-align: left;
    transition:
        border-color 0.16s ease,
        box-shadow 0.16s ease,
        transform 0.16s ease;
}

.theme-option:hover {
    transform: translateY(-1px);
    border-color: rgba(25, 118, 210, 0.5);
}

.theme-option.active {
    border-color: var(--settings-accent);
    color: var(--settings-text);
    box-shadow: 0 0 0 2px rgba(25, 118, 210, 0.13);
}

.theme-preview {
    width: 100%;
    height: 38px;
    display: grid;
    place-items: center;
    border-radius: 6px;
    color: #ffffff;
    font-size: 18px;
    box-shadow: inset 0 0 0 1px rgba(127, 127, 127, 0.2);
}

.priority-row {
    min-height: 72px;
}

.priority-row :deep(.el-radio-group) {
    display: flex;
    flex: 0 0 auto;
}

.priority-row :deep(.el-radio-button__inner) {
    min-width: 27px;
    padding: 7px 8px;
}

.path-row {
    min-height: 72px;
    gap: 12px;
    border-top: 1px solid var(--settings-border);
}

.path-icon {
    width: 34px;
    height: 34px;
    display: grid;
    place-items: center;
    flex: 0 0 auto;
    border-radius: 9px;
    color: #b17a0b;
    background: rgba(177, 122, 11, 0.14);
}

.path-copy {
    min-width: 0;
    flex: 1;
}

.path-copy strong {
    font-size: 12px;
}

.path-copy span {
    max-width: 100%;
    margin-top: 3px;
    overflow: hidden;
    color: var(--settings-muted);
    font-size: 11px;
    text-overflow: ellipsis;
    white-space: nowrap;
}

.path-actions {
    display: flex;
    flex: 0 0 auto;
    gap: 5px;
}

.action-grid {
    display: grid;
    grid-template-columns: minmax(0, 1fr);
    gap: 12px;
}

.action-card {
    min-width: 0;
    gap: 10px;
    padding: 15px 22px;
    border: 1px solid var(--settings-border);
    border-radius: 13px;
    color: var(--settings-text);
    background: var(--settings-panel);
    cursor: pointer;
    text-align: left;
    box-shadow: var(--chat-container-box-shadow, 0 7px 18px rgba(0, 0, 0, 0.04));
    transition:
        transform 0.16s ease,
        border-color 0.16s ease,
        background 0.16s ease;
}

.action-card:hover {
    transform: translateY(-2px);
    border-color: rgba(25, 118, 210, 0.42);
    background: rgba(25, 118, 210, 0.04);
}

.action-card:disabled,
.action-card:disabled:hover {
    cursor: not-allowed;
    opacity: 0.58;
    transform: none;
    border-color: var(--settings-border);
    background: var(--settings-panel);
}

.action-icon {
    width: 32px;
    height: 32px;
    font-size: 15px;
}

.action-copy {
    min-width: 0;
    flex: 1;
}

.action-copy strong {
    overflow: hidden;
    font-size: 12px;
    text-overflow: ellipsis;
    white-space: nowrap;
}

.action-copy small {
    margin-top: 4px;
    overflow: hidden;
    color: var(--settings-muted);
    font-size: 10px;
    line-height: 1.4;
    text-overflow: ellipsis;
    white-space: nowrap;
}

.action-card > .el-icon-arrow-right {
    flex: 0 0 auto;
    color: var(--settings-muted);
    font-size: 12px;
}

.info-grid {
    display: grid;
    grid-template-columns: 1fr 1fr;
    gap: 9px;
    padding: 16px 0 18px;
}

.info-item {
    min-width: 0;
    padding: 11px 12px;
    border-radius: 9px;
    background: rgba(127, 127, 127, 0.07);
}

.info-item.wide {
    grid-column: 1 / -1;
}

.info-item span {
    color: var(--settings-muted);
    font-size: 10px;
}

.info-item strong {
    margin-top: 5px;
    overflow: hidden;
    font-size: 11px;
    font-weight: 500;
    text-overflow: ellipsis;
    white-space: nowrap;
}

.version-trigger {
    width: 100%;
    margin-top: 5px;
    padding: 0;
    overflow: hidden;
    border: 0;
    color: var(--settings-text);
    background: transparent;
    cursor: pointer;
    font: inherit;
    font-size: 11px;
    font-weight: 500;
    line-height: 1.4;
    text-align: left;
    text-overflow: ellipsis;
    white-space: nowrap;
}

.version-trigger:not(:disabled):hover {
    color: var(--settings-accent);
}

.version-trigger:disabled {
    cursor: default;
}

.settings-note {
    gap: 8px;
    margin: 14px 0 0;
    padding: 11px 13px;
    border-radius: 9px;
    color: var(--settings-muted);
    background: rgba(25, 118, 210, 0.07);
    font-size: 11px;
    line-height: 1.5;
}

.settings-note i {
    color: var(--settings-accent);
    font-size: 14px;
}

.settings-page :deep(.setting-row > .el-switch) {
    width: 40px;
    height: 20px;
    flex: 0 0 40px;
}

.settings-page :deep(.setting-row > .el-switch .el-switch__core) {
    width: 40px !important;
    height: 20px;
    border-color: var(--settings-border);
    background-color: rgba(127, 127, 127, 0.22);
}

.settings-page :deep(.setting-row > .el-switch .el-switch__core::after) {
    width: 16px;
    height: 16px;
    background-color: var(--settings-panel);
}

.settings-page :deep(.el-switch.is-checked .el-switch__core) {
    border-color: var(--settings-accent);
    background-color: var(--settings-accent);
}

.settings-page :deep(.el-select .el-input__inner),
.settings-page :deep(.el-input__inner),
.settings-page :deep(.el-textarea__inner) {
    border-color: var(--settings-border);
    color: var(--settings-text);
    background: var(--settings-panel);
}

.settings-page :deep(.el-radio-button__inner) {
    border-color: var(--settings-border);
    color: var(--settings-muted);
    background: var(--settings-panel);
}

.settings-page :deep(.el-radio-button:first-child .el-radio-button__inner) {
    border-left-color: var(--settings-border);
}

.settings-page :deep(.el-radio-button__orig-radio:checked + .el-radio-button__inner) {
    border-color: var(--settings-accent);
    color: #ffffff;
    background: var(--settings-accent);
    box-shadow: -1px 0 0 0 var(--settings-accent);
}

.settings-page :deep(.el-button--mini) {
    padding: 7px 10px;
}
</style>
