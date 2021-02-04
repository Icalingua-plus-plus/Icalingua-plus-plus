export default (room, currentUserId, textMessages) => {
	if (room.typingUsers && room.typingUsers.length) {
		const typingUsers = room.users.filter(user => {
			if (user._id === currentUserId) return
			if (room.typingUsers.indexOf(user._id) === -1) return
			if (user.status && user.status.state === 'offline') return
			return true
		})

		if (!typingUsers.length) return

		if (room.users.length === 2) {
			return textMessages.IS_TYPING
		} else {
			return (
				typingUsers.map(user => user.username).join(', ') +
				' ' +
				textMessages.IS_TYPING
			)
		}
	}
}
