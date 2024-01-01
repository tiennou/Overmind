import { Zerg } from "zerg/Zerg";
import { isSource } from "../../declarations/typeGuards";
import { profile } from "../../profiler/decorator";
import { Task } from "../Task";
import { TaskOptions } from "tasks/types";

export type harvestTargetType = Source | Mineral;
export const harvestTaskName = "harvest";

@profile
export class TaskHarvest extends Task<Zerg, harvestTargetType> {
	constructor(target: harvestTargetType, options: TaskOptions = {}) {
		super(harvestTaskName, target, options);
	}

	isValidTask() {
		return (
			this.creep.store.getUsedCapacity() < this.creep.store.getCapacity()
		);
	}

	isValidTarget() {
		if (isSource(this.target)) {
			return this.target.energy > 0;
		} else {
			return this.target.mineralAmount > 0;
		}
	}

	work() {
		return this.creep.harvest(this.target);
	}
}
