export default (ms: number) => new Promise<never>(resolve => setTimeout(resolve, ms))
