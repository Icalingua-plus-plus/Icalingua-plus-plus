<template>
	<div class="vac-box-search">
		<div v-if="!loadingRooms && rooms.length" class="vac-icon-search">
			<slot name="search-icon">
				<svg-icon name="search" />
			</slot>
		</div>
		<input
			v-if="!loadingRooms && rooms.length"
			type="search"
			:placeholder="textMessages.SEARCH"
			autocomplete="off"
			class="vac-input"
			@input="$emit('search-room', $event)"
		/>
		<div
			v-if="showAddRoom"
			class="vac-svg-button vac-add-icon"
			@click="$emit('add-room')"
		>
			<slot name="add-icon">
				<svg-icon name="add" />
			</slot>
		</div>
	</div>
</template>

<script>
import SvgIcon from '../../components/SvgIcon'

export default {
	name: 'RoomsSearch',
	components: { SvgIcon },

	props: {
		textMessages: { type: Object, required: true },
		showAddRoom: { type: Boolean, required: true },
		rooms: { type: Array, required: true },
		loadingRooms: { type: Boolean, required: true }
	}
}
</script>

<style lang="scss" scoped>
.vac-box-search {
	position: sticky;
	display: flex;
	align-items: center;
	height: 64px;
	padding: 0 15px;
}

.vac-icon-search {
	display: flex;
	position: absolute;
	left: 30px;

	svg {
		width: 18px;
		height: 18px;
	}
}

.vac-input {
	height: 38px;
	width: 100%;
	background: var(--chat-bg-color-input);
	color: var(--chat-color);
	border-radius: 4px;
	font-size: 15px;
	outline: 0;
	caret-color: var(--chat-color-caret);
	padding: 10px 10px 10px 40px;
	border: 1px solid var(--chat-sidemenu-border-color-search);
	border-radius: 20px;

	&::placeholder {
		color: var(--chat-color-placeholder);
	}
}

.vac-add-icon {
	margin-left: auto;
	padding-left: 10px;
}

@media only screen and (max-width: 768px) {
	.vac-box-search {
		height: 58px;
	}
}
</style>
