import { AnyZerg } from "zerg/AnyZerg";
import { profile } from "../../profiler/decorator";
import { Task } from "../Task";
import { TaskData, TaskOptions } from "tasks/types";

export type transferAllTargetType =
	| StructureStorage
	| StructureTerminal
	| StructureContainer;

export const transferAllTaskName = "transferAll";

interface TaskTransferAllData extends TaskData {
	skipEnergy?: boolean;
}

@profile
export class TaskTransferAll extends Task<AnyZerg, transferAllTargetType> {
	data: TaskTransferAllData;

	constructor(
		target: transferAllTargetType,
		skipEnergy = false,
		options: TaskOptions = {}
	) {
		super(transferAllTaskName, target, options);
		this.data.skipEnergy = skipEnergy;
	}

	isValidTask() {
		for (const [resourceType, amount] of Object.entries(this.creep.store)) {
			if (this.data.skipEnergy && resourceType == RESOURCE_ENERGY) {
				continue;
			}
			if (amount > 0) {
				return true;
			}
		}
		return false;
	}

	isValidTarget() {
		return (
			this.target.store.getUsedCapacity() <
			this.target.store.getCapacity()
		);
	}

	work() {
		for (const [resourceType, amount] of this.creep.store.contents) {
			if (this.data.skipEnergy && resourceType == RESOURCE_ENERGY) {
				continue;
			}
			if (amount > 0) {
				return this.creep.transfer(this.target, resourceType);
			}
		}
		return -1;
	}
}
