import { Zerg } from "zerg/Zerg";
import { profile } from "../../profiler/decorator";
import { Task } from "../Task";
import { TaskOptions } from "tasks/types";

export type signControllerTargetType = StructureController;
export const signControllerTaskName = "signController";

@profile
export class TaskSignController extends Task<Zerg, signControllerTargetType> {
	constructor(target: signControllerTargetType, options: TaskOptions = {}) {
		super(signControllerTaskName, target, options);
	}

	isValidTask() {
		return true;
	}

	isValidTarget() {
		const controller = this.target;
		return (
			(!controller.sign ||
				controller.sign.text != Memory.settings.signature) &&
			!controller.signedByScreeps
		);
	}

	work() {
		return this.creep.signController(
			this.target,
			Memory.settings.signature
		);
	}
}
