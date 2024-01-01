export interface TaskSettings {
	targetRange: number;
	workOffRoad: boolean;
	oneShot: boolean;
	timeout: number;
	blind: boolean;
}

export interface TaskOptions {
	/** don't require vision of target unless in room */
	blind?: boolean;
	/** range at which you can perform action */
	targetRange?: number;
	/** whether work() should be performed off road */
	workOffRoad?: boolean;
	/** remove this task once work() returns OK, regardless of validity */
	oneShot?: boolean;
	/** task becomes invalid after this long */
	timeout?: number;
	/** full move options for the task */
	moveOptions?: import("movement/types").MoveOptions;
}

export interface TaskData {
	nextPos?: ProtoPos;
}

export interface ProtoTask {
	name: string;
	_creep: {
		name: string;
	};
	_target: {
		ref: string;
		_pos: ProtoPos;
	};
	_parent: ProtoTask | null;
	tick: number;
	options: TaskOptions;
	data: TaskData;
}
