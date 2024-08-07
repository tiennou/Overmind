import { AnyZerg } from "zerg/AnyZerg";
import { profile } from "../../profiler/decorator";
import { Task } from "../Task";
import { TaskOptions } from "tasks/types";

export type pickupTargetType = Resource;
export const pickupTaskName = "pickup";

@profile
export class TaskPickup extends Task<AnyZerg, pickupTargetType> {
	constructor(target: pickupTargetType, options: TaskOptions = {}) {
		super("pickup", target, options);
		this.settings.oneShot = true;
	}

	isValidTask() {
		return (
			this.creep.store.getUsedCapacity() < this.creep.store.getCapacity()
		);
	}

	isValidTarget() {
		return this.target && this.target.amount > 0;
	}

	work() {
		return this.creep.pickup(this.target);
	}
}
