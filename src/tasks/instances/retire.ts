import { log } from "console/log";
import { profile } from "../../profiler/decorator";
import { Task } from "../Task";
import { Zerg } from "zerg/Zerg";
import { TaskOptions } from "tasks/types";

export type retireTargetType = StructureSpawn;
export const retireTaskName = "retire";

@profile
export class TaskRetire extends Task<Zerg, retireTargetType> {
	constructor(target: retireTargetType, options: TaskOptions = {}) {
		super(retireTaskName, target, options);
		// Settings
		this.settings.timeout = Infinity;
		this.settings.targetRange = 1;
	}

	isValidTask() {
		return true;
	}

	isValidTarget() {
		return !!this.target;
	}

	work() {
		const result = this.target.recycleCreep(this.creep.creep);
		if (result === OK) {
			log.info(
				`${this.creep.print} successfully <s>recycled</s> retired with ${this.creep.ticksToLive} ticks remaining`
			);
			this.finish();
		}
		return result;
	}
}
