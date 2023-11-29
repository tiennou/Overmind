// Modifications to Game-level functions

// eslint-disable-next-line @typescript-eslint/unbound-method
const _marketDeal = Game.market.deal;
Game.market.deal = function (
	this: Market,
	orderId: string,
	amount: number,
	targetRoomName?: string
): ScreepsReturnCode {
	const response = _marketDeal(orderId, amount, targetRoomName);
	if (response == OK) {
		if (
			targetRoomName &&
			Game.rooms[targetRoomName] &&
			Game.rooms[targetRoomName].terminal &&
			Game.rooms[targetRoomName].terminal!.my
		) {
			// Mark the terminal as being blocked
			Game.rooms[targetRoomName].terminal!._notReady = true;
		}
	}
	return response;
};
