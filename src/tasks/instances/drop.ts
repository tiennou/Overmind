import { AnyZerg } from "zerg/AnyZerg";
import { profile } from "../../profiler/decorator";
import { Task } from "../Task";
import { TaskData, TaskOptions } from "tasks/types";

export type dropTargetType = (HasRef & _HasRoomPosition) | RoomPosition;
export const dropTaskName = "drop";

interface TaskDropData extends TaskData {
	resourceType: ResourceConstant;
	amount: number | undefined;
}

@profile
export class TaskDrop extends Task<AnyZerg, dropTargetType> {
	static taskName = "drop";

	data: TaskDropData;

	constructor(
		target: dropTargetType,
		resourceType: ResourceConstant = RESOURCE_ENERGY,
		amount?: number,
		options: TaskOptions = {}
	) {
		if (target instanceof RoomPosition) {
			super(TaskDrop.taskName, { ref: "", _pos: target }, options);
		} else {
			super(
				TaskDrop.taskName,
				{ ref: target.ref, _pos: target.pos },
				options
			);
		}
		// Settings
		this.settings.targetRange = 0;
		this.settings.oneShot = true;
		// Data
		this.data.resourceType = resourceType;
		this.data.amount = amount;
	}

	isValidTask() {
		const amount = this.data.amount || 1;
		const resourcesInCarry = this.creep.store[this.data.resourceType] || 0;
		return resourcesInCarry >= amount;
	}

	isValidTarget() {
		return true;
	}

	isValid(): boolean {
		// It's necessary to override task.isValid() for tasks which do not have a RoomObject target
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
		return this.creep.drop(this.data.resourceType, this.data.amount);
	}
}
