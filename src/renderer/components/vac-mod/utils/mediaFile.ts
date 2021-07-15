export function isImageFile(file: { type: string }) {
	if (!file) return
	const { type } = file
	return type.toLowerCase().startsWith('image/')
}

export function isVideoFile(file: { type: string }) {
	if (!file) return
	const { type } = file
	return type.toLowerCase().startsWith('video/')
}
