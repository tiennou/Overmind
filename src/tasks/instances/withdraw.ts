/* Withdraw a resource from a target */
import { AnyZerg } from "zerg/AnyZerg";
import { profile } from "../../profiler/decorator";
import { Task } from "../Task";

export type withdrawTargetType = AnyStoreStructure;

export const withdrawTaskName = "withdraw";

@profile
export class TaskWithdraw extends Task<AnyZerg, withdrawTargetType> {
	data: {
		resourceType: ResourceConstant;
		amount: number | undefined;
	};

	constructor(
		target: withdrawTargetType,
		resourceType: ResourceConstant = RESOURCE_ENERGY,
		amount?: number,
		options: TaskOptions = {}
	) {
		super(withdrawTaskName, target, options);
		// Settings
		this.settings.oneShot = true;
		this.data.resourceType = resourceType;
		this.data.amount = amount;
	}

	isValidTask() {
		const amount = this.data.amount || 1;
		return (
			this.creep.store.getUsedCapacity() <=
			this.creep.store.getCapacity() - amount
		);
	}

	isValidTarget() {
		if (!this.target.store) {
			return false;
		}
		const amount = this.data.amount || 1;
		const used =
			this.target.store.getUsedCapacity(this.data.resourceType) ?? 0;
		return used >= amount;
	}

	work() {
		return this.creep.withdraw(
			this.target,
			this.data.resourceType,
			this.data.amount
		);
	}
}
