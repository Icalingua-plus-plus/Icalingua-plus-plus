export default interface DatabaseUpgradeProgress {
    active: boolean
    step: number
    total: number
    message: string
}
