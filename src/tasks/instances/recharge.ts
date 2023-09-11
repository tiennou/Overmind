import columnify from "columnify";
import { log } from "../../console/log";
import { isResource, isStandardZerg } from "../../declarations/typeGuards";
import { profile } from "../../profiler/decorator";
import { maxBy, minMax } from "../../utilities/utils";
import { GenericTask, Task } from "../Task";
import { TaskHarvest } from "./harvest";
import { pickupTaskName, TaskPickup } from "./pickup";
import { TaskWithdraw, withdrawTaskName } from "./withdraw";
import { Roles } from "creepSetups/setups";
import { AnyZerg } from "zerg/AnyZerg";

export type rechargeTargetType = null;
export const rechargeTaskName = "recharge";

const RECHARGE_MAX_DISTANCE = 40;

// This is a "dispenser task" which is not itself a valid task, but dispenses a task when assigned to a creep.

@profile
export class TaskRecharge extends Task<AnyZerg, rechargeTargetType> {
	data: {
		minEnergy: number;
		sourcesIDs?: Id<Source>[];
	};
	_sources: Source[];

	constructor(minEnergy = 0, options: TaskOptions = {}) {
		super(rechargeTaskName, null, options);
		this.data.minEnergy = minEnergy;
	}

	get sources() {
		if (!this._sources) {
			if (this.data.sourcesIDs) {
				this._sources = <Source[]>(
					this.data.sourcesIDs
						.map((id) => Game.getObjectById(id))
						.filter((s) => s)
				);
			}
			if (this._sources && this._sources.length === 0) {
				this._sources = this.creep.room.sources;
			}
		}
		return this._sources;
	}

	private rechargeRateForCreep(
		creep: AnyZerg,
		obj: rechargeObjectType
	): number | false {
		log.debugCreep(
			creep,
			() =>
				`checking recharge rate of ${creep.print} against ${obj.print}`
		);
		if (
			creep.colony &&
			creep.colony.hatchery &&
			creep.colony.hatchery.batteries &&
			creep.colony.hatchery.batteries.some((b) => b.id === obj.id) &&
			creep.roleName != "queen"
		) {
			log.debugCreep(
				creep,
				`\t is not a queen, can't use hatchery battery`
			);
			return false; // only queens can use the hatchery battery
		}
		const amountAvailable =
			isResource(obj) ? obj.amount : obj.store[RESOURCE_ENERGY];
		if (amountAvailable < this.data.minEnergy) {
			return false;
		}
		const otherTargeters = _.filter(
			_.map(obj.targetedBy, (name) => Overmind.zerg[name]),
			(zerg) =>
				!!zerg &&
				zerg.task &&
				(zerg.task.name == withdrawTaskName ||
					zerg.task.name == pickupTaskName)
		);
		const resourceOutflux = _.sum(
			_.map(otherTargeters, (other) => other.store.getFreeCapacity())
		);
		const amountGrabbed = minMax(
			amountAvailable - resourceOutflux,
			0,
			creep.store.getCapacity()
		);
		const effectiveAmount =
			amountGrabbed / (creep.pos.getMultiRoomRangeTo(obj.pos) + 1);

		log.debugCreep(
			creep,
			() =>
				`\tother targeters are ${columnify(
					otherTargeters.map((creep) => {
						return {
							creep: creep.print,
							free: creep.store.getFreeCapacity(),
							task: creep.task?.name,
						};
					})
				)}`
		);
		log.debugCreep(
			creep,
			() =>
				`\tavailable: ${amountAvailable} resourceOutFlux: ${resourceOutflux}, ` +
				`grabbed: ${amountGrabbed}, effective: ${effectiveAmount}`
		);
		if (effectiveAmount <= 0) {
			return false;
		} else {
			return effectiveAmount;
		}
	}

	// Override creep setter to dispense a valid recharge task
	set creep(creep: AnyZerg) {
		this._creep.name = creep.name;
		if (this._parent) {
			this.parent!.creep = creep;
		}
		let task: GenericTask | undefined = this.goRecharge(creep);

		if (!task) {
			task = this.goHarvest(creep);
		}

		if (!task) {
			log.debugCreep(creep, `No valid recharge target!`);
			creep.task = null;
		}

		creep.task = task!;
	}

	goRecharge(creep: AnyZerg) {
		// Choose the target to maximize your energy gain subject to other targeting workers
		const possibleTargets =
			creep.colony && creep.inColonyRoom ?
				creep.colony.rechargeables
			:	creep.room.rechargeables;

		const target = maxBy(possibleTargets, (o) =>
			this.rechargeRateForCreep(creep, o)
		);

		log.debugCreep(
			creep,
			`selected ${target?.print} from targets ${possibleTargets
				.map((t) => t.print)
				.join(", ")}`
		);

		if (
			!target ||
			creep.pos.getMultiRoomRangeTo(target.pos) > RECHARGE_MAX_DISTANCE
		) {
			return undefined;
		}

		if (isResource(target)) {
			log.debugCreep(
				creep,
				`selected pickup target ${target.print} for ${creep.print}`
			);
			return new TaskPickup(target);
		} else {
			log.debugCreep(
				creep,
				`selected withdraw target ${target.print} for ${creep.print}`
			);
			return new TaskWithdraw(target);
		}
	}

	goHarvest(creep: AnyZerg) {
		// workers shouldn't harvest; let drones do it (disabling this check can destabilize early economy)
		const canHarvest =
			isStandardZerg(creep) &&
			creep.getActiveBodyparts(WORK) > 0 &&
			creep.roleName !== Roles.worker;
		if (!canHarvest) {
			return undefined;
		}

		// Harvest from a source if there is no recharge target available
		const availableSources = _.filter(this.sources, function (source) {
			const filledSource =
				source.energy > 0 || source.ticksToRegeneration < 20;
			// Only harvest from sources which aren't surrounded by creeps excluding yourself
			const isSurrounded =
				source.pos.availableNeighbors(false).length == 0;
			return (
				filledSource && (!isSurrounded || creep.pos.isNearTo(source))
			);
		});

		const availableSource =
			creep.pos.findClosestByMultiRoomRange(availableSources);
		if (!availableSource) {
			return undefined;
		}
		return new TaskHarvest(availableSource);
	}

	isValid(): boolean {
		return false;
	}

	isValidTask() {
		return false;
	}

	isValidTarget() {
		return false;
	}

	get isWorking(): boolean {
		return false;
	}

	work() {
		log.warning(`BAD RESULT: Should not get here...`);
		return ERR_INVALID_TARGET;
	}
}
