export enum Priority {
	Critical = 0, // Emergency things that disrupt normal operation, like bootstrapping or recovering from a crash
	High = 1,
	NormalHigh = 2,
	Normal = 3, // Most operations go with Normal(*) priority
	NormalLow = 4,
	Low = 5, // Unimportant operations
}

const priorityLevels = {
	[Priority.Critical]: "critical",
	[Priority.High]: "high",
	[Priority.NormalHigh]: "normal-high",
	[Priority.Normal]: "normal",
	[Priority.NormalLow]: "normal-low",
	[Priority.Low]: "low",
};

export function priorityToString(priority: Priority): string {
	return priorityLevels[priority] ?? `unknown ${priority}`;
}

export function blankPriorityQueue() {
	const queue: { [priority: number]: any[] } = {};
	for (const priority in Priority) {
		queue[priority] = [];
	}
	return queue;
}
