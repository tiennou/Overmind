/* Withdraw a resource from a target */

import { AnyZerg } from "zerg/AnyZerg";
import { profile } from "../../profiler/decorator";
import { Task } from "../Task";
import { TaskOptions } from "tasks/types";

export type withdrawAllTargetType = AnyStoreStructure;

export const withdrawAllTaskName = "withdrawAll";

@profile
export class TaskWithdrawAll extends Task<AnyZerg, withdrawAllTargetType> {
	constructor(target: withdrawAllTargetType, options: TaskOptions = {}) {
		super(withdrawAllTaskName, target, options);
	}

	isValidTask() {
		return (
			this.creep.store.getUsedCapacity() < this.creep.store.getCapacity()
		);
	}

	isValidTarget() {
		return (this.target.store.getUsedCapacity() || 0) > 0;
	}

	work() {
		let resourceTransferType;
		for (const [resourceType, amountInStore] of this.target.store
			.contents) {
			if (amountInStore > 0) {
				resourceTransferType = resourceType;
				// Prioritize non-energy
				if (resourceType != RESOURCE_ENERGY) {
					break;
				}
			}
		}
		if (!!resourceTransferType) {
			return this.creep.withdraw(this.target, resourceTransferType);
		}
		return -1;
	}
}
