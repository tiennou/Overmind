import { profile } from "../profiler/decorator";
import { attackTargetType, TaskAttack } from "./instances/attack";
import { buildTargetType, TaskBuild } from "./instances/build";
import { claimTargetType, TaskClaim } from "./instances/claim";
import { dismantleTargetType, TaskDismantle } from "./instances/dismantle";
import { dropTargetType, TaskDrop } from "./instances/drop";
// import {fleeTargetType, TaskFlee} from './instances/flee';
import { fortifyTargetType, TaskFortify } from "./instances/fortify";
import {
	generateSafeModeTargetType,
	TaskGenerateSafeMode,
} from "./instances/generateSafeMode";
import { getBoostedTargetType, TaskGetBoosted } from "./instances/getBoosted";
import { getRenewedTargetType, TaskGetRenewed } from "./instances/getRenewed";
import { goToTargetType, TaskGoTo } from "./instances/goTo";
import { goToRoomTargetType, TaskGoToRoom } from "./instances/goToRoom";
import { harvestTargetType, TaskHarvest } from "./instances/harvest";
import { healTargetType, TaskHeal } from "./instances/heal";
import {
	meleeAttackTargetType,
	TaskMeleeAttack,
} from "./instances/meleeAttack";
import { pickupTargetType, TaskPickup } from "./instances/pickup";
import {
	rangedAttackTargetType,
	TaskRangedAttack,
} from "./instances/rangedAttack";
import { TaskRecharge } from "./instances/recharge";
import { repairTargetType, TaskRepair } from "./instances/repair";
import { reserveTargetType, TaskReserve } from "./instances/reserve";
import { retireTargetType, TaskRetire } from "./instances/retire";
import {
	signControllerTargetType,
	TaskSignController,
} from "./instances/signController";
import { TaskTransfer, transferTargetType } from "./instances/transfer";
import {
	TaskTransferAll,
	transferAllTargetType,
} from "./instances/transferAll";
import { TaskUpgrade, upgradeTargetType } from "./instances/upgrade";
import { TaskWithdraw, withdrawTargetType } from "./instances/withdraw";
import {
	TaskWithdrawAll,
	withdrawAllTargetType,
} from "./instances/withdrawAll";
import { Task } from "./Task";

/**
 * Tasks class provides conveient wrappers for dispensing new Task instances
 */
@profile
export class Tasks {
	static chain(tasks: Task<any>[], setNextPos = true): Task<any> | null {
		if (tasks.length == 0) {
			// log.error(`Tasks.chain was passed an empty array of tasks!`);
			return null;
		}
		if (setNextPos) {
			for (let i = 0; i < tasks.length - 1; i++) {
				tasks[i].options.nextPos = tasks[i + 1].targetPos;
			}
		}
		// Make the accumulator task from the end and iteratively fork it
		let task = _.last(tasks); // start with last task
		tasks = _.dropRight(tasks); // remove it from the list
		for (let i = tasks.length - 1; i >= 0; i--) {
			// iterate over the remaining tasks
			task = task.fork(tasks[i]);
		}
		return task;
	}

	static attack(
		target: attackTargetType,
		options: TaskOptions = {}
	): TaskAttack {
		return new TaskAttack(target, options);
	}

	static build(
		target: buildTargetType,
		options: TaskOptions = {}
	): TaskBuild {
		return new TaskBuild(target, options);
	}

	static claim(
		target: claimTargetType,
		options: TaskOptions = {}
	): TaskClaim {
		return new TaskClaim(target, options);
	}

	static dismantle(
		target: dismantleTargetType,
		options: TaskOptions = {}
	): TaskDismantle {
		return new TaskDismantle(target, options);
	}

	static drop(
		target: dropTargetType,
		resourceType: ResourceConstant = RESOURCE_ENERGY,
		amount?: number,
		options: TaskOptions = {}
	): TaskDrop {
		return new TaskDrop(target, resourceType, amount, options);
	}

	// static flee(target: fleeTargetType, options: TaskOptions = {}) {
	// 	return new TaskFlee(target, options);
	// }

	static fortify(
		target: fortifyTargetType,
		hitsMax?: number,
		options: TaskOptions = {}
	): TaskFortify {
		return new TaskFortify(target, hitsMax, options);
	}

	static getBoosted(
		target: getBoostedTargetType,
		boostType: ResourceConstant,
		amount?: number,
		options: TaskOptions = {}
	): TaskGetBoosted {
		return new TaskGetBoosted(target, boostType, amount, options);
	}

	static getRenewed(
		target: getRenewedTargetType,
		options: TaskOptions = {}
	): TaskGetRenewed {
		return new TaskGetRenewed(target, options);
	}

	static goTo(target: goToTargetType, options: TaskOptions = {}): TaskGoTo {
		return new TaskGoTo(target, options);
	}

	static goToRoom(
		target: goToRoomTargetType,
		options: TaskOptions = {}
	): TaskGoToRoom {
		return new TaskGoToRoom(target, options);
	}

	static harvest(
		target: harvestTargetType,
		options: TaskOptions = {}
	): TaskHarvest {
		return new TaskHarvest(target, options);
	}

	static heal(target: healTargetType, options: TaskOptions = {}): TaskHeal {
		return new TaskHeal(target, options);
	}

	static meleeAttack(
		target: meleeAttackTargetType,
		options: TaskOptions = {}
	): TaskMeleeAttack {
		return new TaskMeleeAttack(target, options);
	}

	static pickup(
		target: pickupTargetType,
		options: TaskOptions = {}
	): TaskPickup {
		return new TaskPickup(target, options);
	}

	static rangedAttack(
		target: rangedAttackTargetType,
		options: TaskOptions = {}
	): TaskRangedAttack {
		return new TaskRangedAttack(target, options);
	}

	static recharge(minEnergy = 0, options: TaskOptions = {}): TaskRecharge {
		return new TaskRecharge(minEnergy, options);
	}

	static repair(
		target: repairTargetType,
		options: TaskOptions = {}
	): TaskRepair {
		return new TaskRepair(target, options);
	}

	static reserve(
		target: reserveTargetType,
		options: TaskOptions = {}
	): TaskReserve {
		return new TaskReserve(target, options);
	}

	static signController(
		target: signControllerTargetType,
		options: TaskOptions = {}
	): TaskSignController {
		return new TaskSignController(target, options);
	}

	static transfer(
		target: transferTargetType,
		resourceType: ResourceConstant = RESOURCE_ENERGY,
		amount?: number,
		options: TaskOptions = {}
	): TaskTransfer {
		return new TaskTransfer(target, resourceType, amount, options);
	}

	static transferAll(
		target: transferAllTargetType,
		skipEnergy = false,
		options: TaskOptions = {}
	): TaskTransferAll {
		return new TaskTransferAll(target, skipEnergy, options);
	}

	static upgrade(
		target: upgradeTargetType,
		options: TaskOptions = {}
	): TaskUpgrade {
		return new TaskUpgrade(target, options);
	}

	static withdraw(
		target: withdrawTargetType,
		resourceType: ResourceConstant = RESOURCE_ENERGY,
		amount?: number,
		options: TaskOptions = {}
	): TaskWithdraw {
		return new TaskWithdraw(target, resourceType, amount, options);
	}

	static withdrawAll(
		target: withdrawAllTargetType,
		options: TaskOptions = {}
	): TaskWithdrawAll {
		return new TaskWithdrawAll(target, options);
	}

	static generateSafeMode(
		target: generateSafeModeTargetType,
		options: TaskOptions = {}
	): TaskGenerateSafeMode {
		return new TaskGenerateSafeMode(target, options);
	}

	static retire(
		target: retireTargetType,
		options: TaskOptions = {}
	): TaskRetire {
		return new TaskRetire(target, options);
	}
}

global.Tasks = Tasks;
