export default (groupName: string): string => {
    return groupName.replace(/<[$%&][\u0000-\u0200]{1,4}>/g, '')
}
