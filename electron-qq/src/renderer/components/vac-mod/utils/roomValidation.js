export function roomsValid(obj) {
	const roomsValidate = [
		{ key: 'roomId', type: ['string', 'number'] },
		{ key: 'roomName', type: ['string'] },
		{ key: 'users', type: ['array'] }
	]

	const validate = (obj, props) => {
		return props.every(prop => {
			let validType = false

			if (prop.type[0] === 'array' && Array.isArray(obj[prop.key])) {
				validType = true
			} else if (prop.type.find(t => t === typeof obj[prop.key])) {
				validType = true
			}

			return validType && checkObjectValid(obj, prop.key)
		})
	}

	return validate(obj, roomsValidate)
}

export function partcipantsValid(obj) {
	const participantsValidate = [
		{ key: '_id', type: ['string', 'number'] },
		{ key: 'username', type: ['string'] }
	]

	const validate = (obj, props) => {
		return props.every(prop => {
			const validType = prop.type.find(t => t === typeof obj[prop.key])
			return validType && checkObjectValid(obj, prop.key)
		})
	}

	return validate(obj, participantsValidate)
}

export function messagesValid(obj) {
	const participantsValidate = [
		{ key: '_id', type: ['string', 'number'] },
		{ key: 'content', type: ['string', 'number'] },
		{ key: 'senderId', type: ['string', 'number'] }
	]

	const validate = (obj, props) => {
		return props.every(prop => {
			const validType = prop.type.find(t => t === typeof obj[prop.key])
			return validType && checkObjectValid(obj, prop.key)
		})
	}

	return validate(obj, participantsValidate)
}

function checkObjectValid(obj, key) {
	return (
		Object.prototype.hasOwnProperty.call(obj, key) &&
		obj[key] !== null &&
		obj[key] !== undefined
	)
}
