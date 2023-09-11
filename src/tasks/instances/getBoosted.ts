import { deref } from "utilities/utils";
import { Zerg } from "zerg/Zerg";
import { log } from "../../console/log";
import { profile } from "../../profiler/decorator";
import { BOOST_PARTS } from "../../resources/map_resources";
import { Task } from "../Task";
import type { EnergyUse } from "Colony";
import { errorForCode } from "utilities/errors";

export type getBoostedTargetType = StructureLab;
export const getBoostedTaskName = "getBoosted";

export const MIN_LIFETIME_FOR_BOOST = 0.85;

@profile
export class TaskGetBoosted extends Task<Zerg, getBoostedTargetType> {
	data: {
		resourceType: ResourceConstant;
		amount: number | undefined;
	};

	constructor(
		target: getBoostedTargetType,
		boostType: ResourceConstant,
		partCount?: number,
		options: TaskOptions = {}
	) {
		super(getBoostedTaskName, target, options);
		// Settings
		this.data.resourceType = boostType;
		this.data.amount = partCount;
	}

	isValidTask() {
		const lifetime =
			_.any(this.creep.body, (part) => part.type == CLAIM) ?
				CREEP_CLAIM_LIFE_TIME
			:	CREEP_LIFE_TIME;
		if (
			this.creep.ticksToLive &&
			this.creep.ticksToLive < MIN_LIFETIME_FOR_BOOST * lifetime
		) {
			// timeout after this amount of lifespan has passed
			return false;
		}
		// else if (BOOST_PARTS[this.data.resourceType] == MOVE &&
		// this.creep.getActiveBodyparts(BOOST_PARTS[this.data.resourceType]) >= this.creep.body.length / 2) {
		// 	Game.notify(`Bad boosting of move on creep ${this.creep}, invalid task.`);
		// 	return false;
		// }

		const { resourceType } = this.data;
		const partCount = this.partCount;
		return (this.creep.boostCounts[resourceType] ?? 0) < partCount;
	}

	get partCount() {
		const { amount, resourceType } = this.data;
		const partCount =
			amount ??
			this.creep.getActiveBodyparts(BOOST_PARTS[resourceType]) ??
			0;
		return partCount;
	}

	get targetHasEnoughMinerals() {
		const { resourceType } = this.data;
		const partCount = this.partCount;
		return (
			this.target &&
			this.target.mineralType === resourceType &&
			this.target.store[resourceType] >= LAB_BOOST_MINERAL * partCount &&
			this.target.store[RESOURCE_ENERGY] >= LAB_BOOST_ENERGY * partCount
		);
	}

	isValidTarget() {
		return this.targetHasEnoughMinerals;
	}

	work() {
		if (this.creep.spawning) {
			return ERR_INVALID_TARGET;
		}
		const { amount, resourceType } = this.data;
		const partCount = this.partCount;
		// amount || this.creep.getActiveBodyparts(BOOST_PARTS[resourceType]);
		// if (BOOST_PARTS[this.data.resourceType] == MOVE && partCount >= this.creep.body.length / 2){
		// 	Game.notify(`Bad boosting of move on creep ${this.creep}, exiting work.`);
		// 	return ERR_INVALID_TARGET;
		// }

		if (!this.targetHasEnoughMinerals) {
			return ERR_NOT_ENOUGH_RESOURCES;
		}

		const result = this.target.boostCreep(
			deref(this._creep.name) as Creep,
			amount
		);
		if (result === OK) {
			// We do not want tasks to depend on stuff like Colony, so hide that
			this.creep.colony?.trackEnergyUse(
				"lab" as EnergyUse,
				-LAB_BOOST_ENERGY
			);
		}
		log.info(
			`${this.target.print}@${this.target.pos.print}: boosting creep ${
				this.creep.print
			} with ${partCount} of ${resourceType} (${
				this.target.mineralType
			})! ${errorForCode(result)}`
		);
		return result;
	}
}
