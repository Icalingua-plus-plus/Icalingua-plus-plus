export default (str: string, char: string | RegExp) => {
    let regex = new RegExp(char, 'g')
    let result = str.match(regex)
    return !result ? 0 : result.length
}
