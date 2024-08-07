// Reinstantiation of a task object from ProtoTask data
import { deref, derefRoomPosition } from "utilities/utils";
import { log } from "../console/log";
import profiler from "../profiler/screeps-profiler";
import {
	attackTargetType,
	attackTaskName,
	TaskAttack,
} from "./instances/attack";
import { buildTargetType, buildTaskName, TaskBuild } from "./instances/build";
import { claimTargetType, claimTaskName, TaskClaim } from "./instances/claim";
import {
	dismantleTargetType,
	dismantleTaskName,
	TaskDismantle,
} from "./instances/dismantle";
import { dropTargetType, dropTaskName, TaskDrop } from "./instances/drop";
import {
	fortifyTargetType,
	fortifyTaskName,
	TaskFortify,
} from "./instances/fortify";
import {
	generateSafeModeTargetType,
	generateSafeModeTaskName,
	TaskGenerateSafeMode,
} from "./instances/generateSafeMode";
import {
	getBoostedTargetType,
	getBoostedTaskName,
	TaskGetBoosted,
} from "./instances/getBoosted";
import {
	getRenewedTargetType,
	getRenewedTaskName,
	TaskGetRenewed,
} from "./instances/getRenewed";
import { goToTaskName } from "./instances/goTo";
import { goToRoomTaskName, TaskGoToRoom } from "./instances/goToRoom";
import {
	harvestTargetType,
	harvestTaskName,
	TaskHarvest,
} from "./instances/harvest";
import { healTargetType, healTaskName, TaskHeal } from "./instances/heal";
import { TaskInvalid } from "./instances/invalid";
import {
	meleeAttackTargetType,
	meleeAttackTaskName,
	TaskMeleeAttack,
} from "./instances/meleeAttack";
import {
	pickupTargetType,
	pickupTaskName,
	TaskPickup,
} from "./instances/pickup";
import {
	rangedAttackTargetType,
	rangedAttackTaskName,
	TaskRangedAttack,
} from "./instances/rangedAttack";
import { rechargeTaskName, TaskRecharge } from "./instances/recharge";
import {
	repairTargetType,
	repairTaskName,
	TaskRepair,
} from "./instances/repair";
import {
	reserveTargetType,
	reserveTaskName,
	TaskReserve,
} from "./instances/reserve";
import { retireTaskName, TaskRetire } from "./instances/retire";
import {
	signControllerTargetType,
	signControllerTaskName,
	TaskSignController,
} from "./instances/signController";
import {
	TaskTransfer,
	transferTargetType,
	transferTaskName,
} from "./instances/transfer";
// import {fleeTargetType, fleeTaskName, TaskFlee} from './instances/flee';
import {
	TaskTransferAll,
	transferAllTargetType,
	transferAllTaskName,
} from "./instances/transferAll";
import {
	TaskUpgrade,
	upgradeTargetType,
	upgradeTaskName,
} from "./instances/upgrade";
import {
	TaskWithdraw,
	withdrawTargetType,
	withdrawTaskName,
} from "./instances/withdraw";
import {
	TaskWithdrawAll,
	withdrawAllTargetType,
	withdrawAllTaskName,
} from "./instances/withdrawAll";
import { GenericTask } from "./Task";
import { ProtoTask } from "./types";

/**
 * The task initializer maps serialized prototasks to Task instances
 */
export function initializeTask(protoTask: ProtoTask): GenericTask {
	// Retrieve name and target data from the ProtoTask
	const taskName = protoTask.name;
	const target = deref(protoTask._target.ref);
	let task: GenericTask;
	// Create a task object of the correct type
	switch (taskName) {
		case attackTaskName:
			task = new TaskAttack(target as attackTargetType);
			break;
		case buildTaskName:
			task = new TaskBuild(target as buildTargetType);
			break;
		case claimTaskName:
			task = new TaskClaim(target as claimTargetType);
			break;
		case dismantleTaskName:
			task = new TaskDismantle(target as dismantleTargetType);
			break;
		case dropTaskName:
			task = new TaskDrop(
				derefRoomPosition(protoTask._target._pos) as dropTargetType
			);
			break;
		// case fleeTaskName:
		// 	task = new TaskFlee(derefRoomPosition(ProtoTask._target._pos) as fleeTargetType);
		// 	break;
		case fortifyTaskName:
			task = new TaskFortify(target as fortifyTargetType);
			break;
		case getBoostedTaskName:
			task = new TaskGetBoosted(
				target as getBoostedTargetType,
				// @ts-expect-error this is set in the constructor
				protoTask.data.resourceType as _ResourceConstantSansEnergy
			);
			break;
		case getRenewedTaskName:
			task = new TaskGetRenewed(target as getRenewedTargetType);
			break;
		case goToTaskName:
			// task = new TaskGoTo(derefRoomPosition(ProtoTask._target._pos) as goToTargetType);
			task = new TaskInvalid();
			break;
		case goToRoomTaskName:
			task = new TaskGoToRoom(protoTask._target._pos.roomName);
			break;
		case harvestTaskName:
			task = new TaskHarvest(target as harvestTargetType);
			break;
		case healTaskName:
			task = new TaskHeal(target as healTargetType);
			break;
		case meleeAttackTaskName:
			task = new TaskMeleeAttack(target as meleeAttackTargetType);
			break;
		case pickupTaskName:
			task = new TaskPickup(target as pickupTargetType);
			break;
		case rangedAttackTaskName:
			task = new TaskRangedAttack(target as rangedAttackTargetType);
			break;
		case rechargeTaskName:
			task = new TaskRecharge();
			break;
		case repairTaskName:
			task = new TaskRepair(target as repairTargetType);
			break;
		case reserveTaskName:
			task = new TaskReserve(target as reserveTargetType);
			break;
		case signControllerTaskName:
			task = new TaskSignController(target as signControllerTargetType);
			break;
		case transferTaskName:
			task = new TaskTransfer(target as transferTargetType);
			break;
		case transferAllTaskName:
			task = new TaskTransferAll(target as transferAllTargetType);
			break;
		case upgradeTaskName:
			task = new TaskUpgrade(target as upgradeTargetType);
			break;
		case withdrawTaskName:
			task = new TaskWithdraw(target as withdrawTargetType);
			break;
		case withdrawAllTaskName:
			task = new TaskWithdrawAll(target as withdrawAllTargetType);
			break;
		case generateSafeModeTaskName:
			task = new TaskGenerateSafeMode(
				target as generateSafeModeTargetType
			);
			break;
		case retireTaskName:
			task = new TaskRetire(target as StructureSpawn);
			break;
		default:
			log.error(
				`Invalid task name: ${taskName}! task.creep: ${protoTask._creep.name}. Deleting from memory!`
			);
			task = new TaskInvalid();
			break;
	}
	// Modify the task object to reflect any changed properties
	task.proto = protoTask;
	// Return it
	return task;
}

profiler.registerFN(initializeTask, "initializeTask");
