import { Zerg } from "zerg/Zerg";
import { profile } from "../../profiler/decorator";
import { Task } from "../Task";
import { TaskOptions } from "tasks/types";

export type reserveTargetType = StructureController;
export const reserveTaskName = "colony";

const RESERVE_DEFAULT_AMOUNT = 4999;

interface TaskReserveOptions extends TaskOptions {
	reserveAmount?: number;
}

@profile
export class TaskReserve extends Task<Zerg, reserveTargetType> {
	options: TaskReserveOptions;
	constructor(target: reserveTargetType, options: TaskOptions = {}) {
		_.defaults(options, { reserveAmount: RESERVE_DEFAULT_AMOUNT });
		super(reserveTaskName, target, options);
	}

	isValidTask() {
		return this.creep.getActiveBodyparts(CLAIM) > 0;
	}

	isValidTarget() {
		const target = this.target;
		return (
			target != null &&
			(!target.reservation ||
				target.reservation.ticksToEnd <
					(this.options.reserveAmount ?? RESERVE_DEFAULT_AMOUNT))
		);
	}

	work() {
		let ret = this.creep.reserveController(this.target);
		if (ret == ERR_INVALID_TARGET) {
			ret = this.creep.attackController(this.target);
		}
		return ret;
	}
}
