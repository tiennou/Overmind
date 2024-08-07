import { AnyZerg } from "zerg/AnyZerg";
import { profile } from "../../profiler/decorator";
import { Task } from "../Task";
import { TaskOptions } from "tasks/types";

export type goToRoomTargetType = string;
export const goToRoomTaskName = "goToRoom";

@profile
export class TaskGoToRoom extends Task<AnyZerg, RoomPosition> {
	constructor(roomName: goToRoomTargetType, options: TaskOptions = {}) {
		super(
			goToRoomTaskName,
			{ ref: "", _pos: new RoomPosition(25, 25, roomName) },
			options
		);
		// Settings
		this.settings.targetRange = 23; // Target is almost always controller flag, so range of 2 is acceptable
	}

	isValidTask() {
		return !this.creep.pos.inRangeTo(
			this.targetPos,
			this.settings.targetRange
		);
	}

	isValidTarget() {
		return this.creep.room.name !== this.targetPos.roomName;
	}

	isValid(): boolean {
		let validTask = false;
		if (this.creep) {
			validTask = this.isValidTask();
		}
		// Return if the task is valid; if not, finalize/delete the task and return false
		if (validTask) {
			return true;
		} else {
			// Switch to parent task if there is one
			let isValid = false;
			if (this.parent) {
				isValid = this.parent.isValid();
			}
			this.finish();
			return isValid;
		}
	}

	work() {
		return OK;
	}
}
