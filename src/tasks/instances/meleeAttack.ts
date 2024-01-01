import { Zerg } from "zerg/Zerg";
import { profile } from "../../profiler/decorator";
import { Task } from "../Task";
import { TaskOptions } from "tasks/types";

export type meleeAttackTargetType = Creep | Structure;
export const meleeAttackTaskName = "meleeAttack";

@profile
export class TaskMeleeAttack extends Task<Zerg, meleeAttackTargetType> {
	constructor(target: meleeAttackTargetType, options: TaskOptions = {}) {
		super(meleeAttackTaskName, target, options);
		// Settings
		this.settings.targetRange = 1;
	}

	isValidTask() {
		return this.creep.getActiveBodyparts(ATTACK) > 0;
	}

	isValidTarget() {
		const target = this.target;
		return target && target.hits > 0; // && target.my == false);
	}

	work() {
		return this.creep.attack(this.target);
	}
}
