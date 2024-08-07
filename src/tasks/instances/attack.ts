import { ZergMoveReturnCode } from "movement/types";
import { profile } from "../../profiler/decorator";
import { Task } from "../Task";
import { Zerg } from "zerg/Zerg";
import { TaskOptions } from "tasks/types";

// Attack task, includes attack and ranged attack if applicable.
// Use meleeAttack and rangedAttack for the exclusive variants.

// I included this task for completion sake, but I don't use or advise using the tasks system for combat code,
// since it's not very good at multi-tasking

// Known issue: creep is only approaching to range 3 (won't fix because I don't use for combat)

export type attackTargetType = Creep | Structure;
export const attackTaskName = "attack";

@profile
export class TaskAttack extends Task<Zerg, attackTargetType> {
	constructor(target: attackTargetType, options: TaskOptions = {}) {
		super(attackTaskName, { ref: target.ref, _pos: target.pos }, options);
		// Settings
		this.settings.targetRange = 3;
	}

	isValidTask() {
		return (
			this.creep.getActiveBodyparts(ATTACK) > 0 ||
			this.creep.getActiveBodyparts(RANGED_ATTACK) > 0
		);
	}

	isValidTarget(): boolean {
		return this.target && this.target.hits > 0;
	}

	work() {
		const creep = this.creep;
		const target = this.target;
		let attackReturn: CreepActionReturnCode | ZergMoveReturnCode = 0;
		let rangedAttackReturn: CreepActionReturnCode = 0;
		if (creep.getActiveBodyparts(ATTACK) > 0) {
			if (creep.pos.isNearTo(target)) {
				attackReturn = creep.attack(target);
			} else {
				attackReturn = this.moveToTarget(1); // approach target if you also have attack parts
			}
		}
		if (
			creep.pos.inRangeTo(target, 3) &&
			creep.getActiveBodyparts(RANGED_ATTACK) > 0
		) {
			rangedAttackReturn = creep.rangedAttack(target);
		}
		if (attackReturn == OK && rangedAttackReturn == OK) {
			return OK;
		} else {
			if (attackReturn != OK) {
				return rangedAttackReturn;
			} else {
				return attackReturn;
			}
		}
	}
}
