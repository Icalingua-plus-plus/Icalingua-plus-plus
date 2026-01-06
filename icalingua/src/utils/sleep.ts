export default (ms: number) => new Promise<void>((resolve) => setTimeout(resolve, ms))
