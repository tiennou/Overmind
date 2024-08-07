import { AnyZerg } from "zerg/AnyZerg";
import { hasPos } from "../../declarations/typeGuards";
import { profile } from "../../profiler/decorator";
import { Task } from "../Task";
import { TaskOptions } from "tasks/types";

export type goToTargetType = _HasRoomPosition | RoomPosition;
export const goToTaskName = "goTo";

@profile
export class TaskGoTo extends Task<AnyZerg, goToTargetType> {
	constructor(target: goToTargetType, options: TaskOptions = {}) {
		if (hasPos(target)) {
			super(goToTaskName, { ref: "", pos: target.pos }, options);
		} else {
			super(goToTaskName, { ref: "", pos: target }, options);
		}
		// Settings
		this.settings.targetRange = 1;
	}

	isValidTask() {
		return !this.creep.pos.inRangeTo(
			this.targetPos,
			this.settings.targetRange
		);
	}

	isValidTarget() {
		return true;
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
