import { Zerg } from "zerg/Zerg";
import { profile } from "../../profiler/decorator";
import { Task } from "../Task";
import { TaskOptions } from "tasks/types";

export type claimTargetType = StructureController;
export const claimTaskName = "claim";

@profile
export class TaskClaim extends Task<Zerg, claimTargetType> {
	constructor(target: claimTargetType, options: TaskOptions = {}) {
		super(claimTaskName, target, options);
		// Settings
	}

	isValidTask() {
		return this.creep.getActiveBodyparts(CLAIM) > 0;
	}

	isValidTarget() {
		return this.target != null && (!this.target.room || !this.target.owner);
	}

	work() {
		return this.creep.claimController(this.target);
	}
}
