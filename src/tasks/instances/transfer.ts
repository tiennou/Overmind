import { AnyZerg } from "zerg/AnyZerg";
import { profile } from "../../profiler/decorator";
import { Task } from "../Task";
import { TaskData, TaskOptions } from "tasks/types";

export type transferTargetType = TransferrableStoreStructure | Creep;

export const transferTaskName = "transfer";

interface TaskTransferData extends TaskData {
	resourceType: ResourceConstant;
	amount: number | undefined;
}

@profile
export class TaskTransfer extends Task<AnyZerg, transferTargetType> {
	data: TaskTransferData;
	constructor(
		target: transferTargetType,
		resourceType: ResourceConstant = RESOURCE_ENERGY,
		amount?: number,
		options: TaskOptions = {}
	) {
		super(transferTaskName, target, options);
		// Settings
		this.settings.oneShot = true;
		this.data.resourceType = resourceType;
		this.data.amount = amount;
	}

	isValidTask() {
		const amount = this.data.amount || 1;
		const resourcesInCarry = this.creep.store[this.data.resourceType] || 0;
		return resourcesInCarry >= amount;
	}

	isValidTarget() {
		const amount = this.data.amount || 1;
		return (
			(this.target.store.getFreeCapacity(this.data.resourceType) ?? 0) >=
			amount
		);
	}

	work() {
		return this.creep.transfer(
			this.target,
			this.data.resourceType,
			this.data.amount
		);
	}
}
