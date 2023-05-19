export default (groupName: string): string => {
    return groupName.replace(/<[$%&][\u0000-\u01ff]{1,4}>/g, '')
}
