import { Zerg } from "zerg/Zerg";
import { profile } from "../../profiler/decorator";
import { Task } from "../Task";
import { TaskData, TaskOptions } from "tasks/types";

export type fortifyTargetType = StructureWall | StructureRampart;
export const fortifyTaskName = "fortify";

interface TaskFortifyData extends TaskData {
	hitsMax: number | undefined;
}

@profile
export class TaskFortify extends Task<Zerg, fortifyTargetType> {
	data: TaskFortifyData;

	constructor(
		target: fortifyTargetType,
		hitsMax?: number,
		options: TaskOptions = {}
	) {
		super(fortifyTaskName, target, options);
		// Settings
		this.settings.timeout = 100; // Don't want workers to fortify indefinitely
		this.settings.targetRange = 3;
		this.settings.workOffRoad = true;
		this.data.hitsMax = hitsMax;
	}

	isValidTask() {
		return this.creep.store.energy > 0; // Times out once creep is out of energy
	}

	isValidTarget() {
		return (
			this.target &&
			this.target.hits < (this.data.hitsMax || this.target.hitsMax)
		);
	}

	work() {
		return this.creep.repair(this.target);
	}
}
