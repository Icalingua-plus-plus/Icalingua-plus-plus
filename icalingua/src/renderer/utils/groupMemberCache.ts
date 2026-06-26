import { MemberInfo } from 'oicq-icalingua-plus-plus'
import ipc from './ipc'
import sleep from '../../utils/sleep'

/**
 * 群成员缓存管理器
 * 用于缓存所有群的成员列表，以便快速查找共同群聊
 */
class GroupMemberCache {
    // 缓存结构: { groupId: MemberInfo[] }
    private cache: Map<number, MemberInfo[]> = new Map()
    // 记录每个群的最后更新时间
    private lastUpdate: Map<number, number> = new Map()
    // 缓存有效期（60分钟）
    private readonly CACHE_EXPIRY = 60 * 60 * 1000
    // preloadAllGroups 正在执行时复用同一个 Promise
    private preloadingPromise: Promise<void> | null = null

    /**
     * 获取指定群的成员列表（带缓存）
     */
    async getGroupMembers(groupId: number, forceRefresh: boolean = false): Promise<MemberInfo[]> {
        const now = Date.now()
        groupId = Math.abs(groupId)
        const lastUpdateTime = this.lastUpdate.get(groupId) || 0
        const isExpired = now - lastUpdateTime > this.CACHE_EXPIRY

        if (!forceRefresh && !isExpired && this.cache.has(groupId)) {
            return this.cache.get(groupId)!
        }

        try {
            const members = await ipc.getGroupMembers(groupId)
            this.cache.set(groupId, members)
            this.lastUpdate.set(groupId, now)
            return members
        } catch (error) {
            console.error(`Failed to fetch group members for ${groupId}:`, error)
            // 返回缓存的旧数据（如果有）
            return this.cache.get(groupId) || []
        }
    }

    /**
     * 批量预加载所有群的成员列表（串行执行，避免并发请求过多）
     */
    async preloadAllGroups(): Promise<void> {
        if (this.preloadingPromise) {
            return this.preloadingPromise
        }

        this.preloadingPromise = (async () => {
            try {
                const groups = await ipc.getGroups()
                const groupIds = groups.map((g) => g.group_id)

                for (const groupId of groupIds) {
                    await this.getGroupMembers(Math.abs(groupId)).catch(() => [])
                    await sleep(500)
                }
                console.log(`Preloaded ${groupIds.length} groups' member lists`)
            } finally {
                this.preloadingPromise = null
            }
        })()

        return this.preloadingPromise
    }

    /**
     * 查找与指定用户的共同群聊
     * @param userId 用户QQ号
     * @param currentGroupId 当前群ID（可选，用于在结果中标注）
     * @returns 共同群聊列表，包含群ID、群名和成员信息
     */
    async findCommonGroups(
        userId: number,
        currentGroupId?: number,
    ): Promise<Array<{ groupId: number; groupName: string; memberInfo: MemberInfo }>> {
        const commonGroups: Array<{ groupId: number; groupName: string; memberInfo: MemberInfo }> = []

        // 使用 forEach 避免迭代器兼容性问题
        this.cache.forEach((members, groupId) => {
            const memberInfo = members.find((m) => m.user_id === userId)
            if (memberInfo) {
                commonGroups.push({
                    groupId,
                    groupName: '', // 临时占位，稍后异步获取
                    memberInfo,
                })
            }
        })

        // 异步获取群名
        const promises = commonGroups.map(async (group) => {
            try {
                const groupInfo = await ipc.getGroup(group.groupId)
                group.groupName = groupInfo?.group_name || `群${group.groupId}`
            } catch (error) {
                console.error(`Failed to get group info for ${group.groupId}:`, error)
                group.groupName = `群${group.groupId}`
            }
        })

        await Promise.all(promises)

        // 按群ID排序
        commonGroups.sort((a, b) => a.groupId - b.groupId)

        return commonGroups
    }

    /**
     * 更新指定群的成员缓存
     */
    async updateGroupCache(groupId: number): Promise<void> {
        await this.getGroupMembers(Math.abs(groupId), true)
    }

    /**
     * 清除所有缓存
     */
    clearAll(): void {
        this.cache.clear()
        this.lastUpdate.clear()
    }

    /**
     * 清除指定群的缓存
     */
    clearGroup(groupId: number): void {
        this.cache.delete(groupId)
        this.lastUpdate.delete(groupId)
    }

    /**
     * 获取缓存统计信息
     */
    getStats(): { cachedGroups: number; totalMembers: number } {
        let totalMembers = 0
        // 使用 forEach 避免迭代器兼容性问题
        this.cache.forEach((members) => {
            totalMembers += members.length
        })
        return {
            cachedGroups: this.cache.size,
            totalMembers,
        }
    }
}

// 导出单例
export default new GroupMemberCache()
