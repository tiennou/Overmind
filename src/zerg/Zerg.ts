import { log } from "../console/log";
import {
	isCreep,
	isPowerCreep,
	isStandardZerg,
} from "../declarations/typeGuards";
import { CombatIntel } from "../intel/CombatIntel";
import { Overlord } from "../overlords/Overlord";
import { profile } from "../profiler/decorator";
import { BOOST_PARTS } from "../resources/map_resources";
import { initializeTask } from "../tasks/initializer";
import { MIN_LIFETIME_FOR_BOOST } from "../tasks/instances/getBoosted";
import { Task } from "../tasks/Task";
import { AnyZerg } from "./AnyZerg";
import { Visualizer } from "visuals/Visualizer";
import { Pathing } from "movement/Pathing";

export function normalizeStandardZerg(creep: Zerg | Creep): Zerg | Creep {
	return Overmind.zerg[creep.name] || creep;
}

export function toCreep(creep: Zerg | Creep): Creep {
	return isStandardZerg(creep) ? creep.creep : creep;
}

// Last pipeline is more complex because it depends on the energy a creep has; sidelining this for now
const ACTION_PIPELINES: string[][] = [
	[
		"harvest",
		"attack",
		"build",
		"repair",
		"dismantle",
		"attackController",
		"rangedHeal",
		"heal",
	],
	["rangedAttack", "rangedMassAttack", "build", "repair", "rangedHeal"],
	// ['upgradeController', 'build', 'repair', 'withdraw', 'transfer', 'drop'],
];

/**
 * The Zerg class is a wrapper for owned creeps and contains all wrapped creep methods and many additional methods for
 * direct control of a creep. As of April 2020, this class now extends the AnyZerg class to accommodate the introduction
 * of power creeps into the game.
 */
@profile
export class Zerg extends AnyZerg {
	isStandardZerg: true;
	/** The creep that this wrapper class will control */
	// These properties are all wrapped from this.creep.* to this.*
	creep: Creep;
	body: BodyPartDefinition[];
	store: StoreDefinition;
	fatigue: number;
	hits: number;
	hitsMax: number;
	id: string;
	memory: CreepMemory;
	name: string;
	pos: RoomPosition;
	/** The next position the creep will be in after registering a move intent */
	nextPos: RoomPosition;
	ref: string;
	roleName: string;
	room: Room;
	saying: string;
	spawning: boolean;
	ticksToLive: number | undefined;
	/** Tracks the actions that a creep has completed this tick */
	actionLog: { [actionName: string]: boolean };
	/** Whether the zerg is allowed to move or not */
	blockMovement: boolean;

	// Cached properties
	private _task: Task<any> | null;
	private _neededBoosts: { [boostResource: string]: number } | undefined;
	private _spawnInfo: Spawning | undefined;

	constructor(creep: Creep, notifyWhenAttacked = true) {
		super(creep, notifyWhenAttacked);
		this.isStandardZerg = true;
		// Copy over creep references
		this.body = creep.body;
		this.fatigue = creep.fatigue;
		this.roleName = creep.memory.role;
		this.spawning = creep.spawning;
		// Register global references
		Overmind.zerg[this.name] = this;
	}

	/**
	 * Refresh all changeable properties of the creep or delete from Overmind and global when dead
	 */
	refresh(): void {
		super.refresh();
		const creep = Game.creeps[this.name];
		if (creep) {
			this.body = creep.body;
			this.fatigue = creep.fatigue;
			this.roleName = creep.memory.role;
			this.spawning = creep.spawning;
			this._task = null; // todo
			this._neededBoosts = undefined;
		} else {
			delete Overmind.zerg[this.name];
		}
	}

	private get spawnInfo(): Spawning | undefined {
		if (!this.spawning) {
			return undefined;
		}
		if (!this._spawnInfo) {
			const spawner = this.pos.lookForStructure(STRUCTURE_SPAWN);
			if (!spawner) {
				// Shouldn't ever get here
				log.error(
					`Error determining ticks to spawn for ${this.name} @ ${this.pos.print}!`
				);
				return undefined;
			}
			this._spawnInfo = spawner.spawning ?? undefined;
		}
		return this._spawnInfo;
	}

	get spawner(): StructureSpawn | undefined {
		return this.spawnInfo?.spawn;
	}

	get ticksUntilSpawned(): number | undefined {
		return this.spawnInfo?.remainingTime;
	}

	get spawnPos(): RoomPosition | undefined {
		const info = this.spawnInfo;
		if (!info) {
			return undefined;
		}
		let directions = info.directions;
		if (!directions) {
			directions = [TOP];
		}
		// Go through the list of directions and rebuild the position
		let pos = info.spawn.pos;
		let dir;
		while ((dir = directions.shift())) {
			pos = pos.getPositionAtDirection(dir);
		}
		return pos;
	}

	// Wrapped creep methods ===========================================================================================

	attack(target: AnyCreep | Structure) {
		const result = this.creep.attack(target);
		if (result == OK) {
			this.actionLog.attack = true;
			if (isCreep(target) || isPowerCreep(target)) {
				target.hitsPredicted ??= target.hits;
				target.hitsPredicted -= CombatIntel.predictedDamageAmount(
					this.creep,
					target,
					"attack"
				);
			}
			if (isCreep(target)) {
				// account for hitback effects
				this.creep.hitsPredicted ??= this.creep.hits;
				this.creep.hitsPredicted -= CombatIntel.predictedDamageAmount(
					target,
					this.creep,
					"attack"
				);
			}
			if (this.memory.talkative) {
				this.say(`💥`);
			}
		}
		return result;
	}

	attackController(controller: StructureController) {
		const result = this.creep.attackController(controller);
		if (!this.actionLog.attackController) {
			this.actionLog.attackController = result == OK;
		}
		return result;
	}

	build(target: ConstructionSite) {
		const result = this.creep.build(target);
		this.actionLog.build ??= result == OK;
		return result;
	}

	goBuild(target: ConstructionSite) {
		if (this.build(target) == ERR_NOT_IN_RANGE) {
			this.goTo(target);
		}
	}

	claimController(controller: StructureController) {
		const result = this.creep.claimController(controller);
		if (!this.actionLog.claimController) {
			this.actionLog.claimController = result == OK;
		}
		if (result == OK) {
			Overmind.shouldBuild = true; // rebuild the overmind object on the next tick to account for new room
		}
		return result;
	}

	dismantle(target: Structure): CreepActionReturnCode {
		const result = this.creep.dismantle(target);
		this.actionLog.dismantle ??= result == OK;
		return result;
	}

	goDismantle(target: Structure) {
		const res = this.dismantle(target);
		if (res == ERR_NOT_IN_RANGE) {
			return this.goTo(target);
		}
		return res;
	}

	generateSafeMode(target: StructureController) {
		return this.creep.generateSafeMode(target);
	}

	harvest(source: Source | Deposit | Mineral) {
		const result = this.creep.harvest(source);
		this.actionLog.harvest ??= result == OK;
		return result;
	}

	goHarvest(source: Source | Deposit | Mineral): void {
		if (this.harvest(source) == ERR_NOT_IN_RANGE) {
			this.goTo(source);
		}
	}

	rangedAttack(target: Creep | Structure) {
		const result = this.creep.rangedAttack(target);
		if (result == OK) {
			this.actionLog.rangedAttack = true;
			if (isCreep(target)) {
				target.hitsPredicted ??= target.hits;
				target.hitsPredicted -= CombatIntel.predictedDamageAmount(
					this,
					target,
					"rangedAttack"
				);
			}
			if (this.memory.talkative) {
				this.say(`🔫`);
			}
		}
		return result;
	}

	rangedMassAttack() {
		const result = this.creep.rangedMassAttack();
		if (result == OK) {
			this.actionLog.rangedMassAttack = true;
			for (const target of this.pos.findInRange(this.room.hostiles, 3)) {
				target.hitsPredicted ??= target.hits;
				target.hitsPredicted -= CombatIntel.getMassAttackDamageTo(
					this,
					target
				);
			}
			if (this.memory.talkative) {
				this.say(`💣`);
			}
		}
		return result;
	}

	repair(target: Structure) {
		const result = this.creep.repair(target);
		this.actionLog.repair ??= result == OK;
		return result;
	}

	goRepair(target: Structure): void {
		if (this.repair(target) == ERR_NOT_IN_RANGE) {
			this.goTo(target);
		}
	}

	reserveController(controller: StructureController) {
		const result = this.creep.reserveController(controller);
		this.actionLog.reserveController ??= result == OK;
		return result;
	}

	signController(target: StructureController, text: string) {
		const result = this.creep.signController(target, text);
		this.actionLog.signController ??= result == OK;
		return result;
	}

	upgradeController(controller: StructureController) {
		const result = this.creep.upgradeController(controller);
		this.actionLog.upgradeController ??= result == OK;
		return result;
	}

	heal(target: Creep | Zerg, rangedHealInstead = false) {
		if (rangedHealInstead && !this.pos.isNearTo(target)) {
			return this.rangedHeal(target);
		}
		const creep = toCreep(target);
		const result = this.creep.heal(creep);
		if (result == OK) {
			this.actionLog.heal = true;
			creep.hitsPredicted ??= creep.hits;
			creep.hitsPredicted += CombatIntel.getHealAmount(this);
			if (this.memory.talkative) {
				this.say("🚑");
			}
		}
		return result;
	}

	rangedHeal(target: Creep | Zerg) {
		const creep = toCreep(target);
		const result = this.creep.rangedHeal(creep);
		if (result == OK) {
			this.actionLog.rangedHeal = true;
			creep.hitsPredicted ??= creep.hits;
			creep.hitsPredicted += CombatIntel.getRangedHealAmount(this);
			if (this.memory.talkative) {
				this.say(`💉`);
			}
		}
		return result;
	}

	// Simultaneous creep actions --------------------------------------------------------------------------------------

	/**
	 * Determine whether the given action will conflict with an action the creep has already taken.
	 * See http://docs.screeps.com/simultaneous-actions.html for more details.
	 */
	canExecute(actionName: string): boolean {
		// Only one action can be executed from within a single pipeline
		let conflictingActions: string[] = [actionName];
		for (const pipeline of ACTION_PIPELINES) {
			if (pipeline.includes(actionName)) {
				conflictingActions = conflictingActions.concat(pipeline);
			}
		}
		for (const action of conflictingActions) {
			if (this.actionLog[action]) {
				return false;
			}
		}
		return true;
	}

	// Body configuration and related data -----------------------------------------------------------------------------

	getActiveBodyparts(type: BodyPartConstant): number {
		return this.creep.getActiveBodyparts(type);
	}

	/**
	 * The same as creep.getActiveBodyparts, but just counts bodyparts regardless of condition.
	 */
	getBodyparts(partType: BodyPartConstant): number {
		return _.filter(
			this.body,
			(part: BodyPartDefinition) => part.type == partType
		).length;
	}

	// Custom creep methods ============================================================================================

	// Boosting logic --------------------------------------------------------------------------------------------------

	get boostCounts(): { [boostType: string]: number } {
		return _.countBy(this.body, (bodyPart) => bodyPart.boost);
	}

	get bodypartCounts(): { [bodypart in BodyPartConstant]: number } {
		return this.creep.bodypartCounts;
	}

	get needsBoosts(): boolean {
		if (!this.overlord) {
			return false;
		}
		if (
			(this.ticksToLive || this.lifetime) <
			MIN_LIFETIME_FOR_BOOST * this.lifetime
		) {
			return false;
		}
		return !_.isEmpty(this.getNeededBoosts());
	}

	/**
	 * Gets an object describing the amount of boosts (in minerals, not bodyparts) this Zerg needs. If the zerg is
	 * fully boosted for a given resource type, the entry is removed from memory.needBoosts.
	 */
	getNeededBoosts(): { [boostResource: string]: number } {
		if (!this._neededBoosts) {
			// this is cleared each tick
			if (this.memory.needBoosts && this.memory.needBoosts.length > 0) {
				const neededBoosts: { [boostResource: string]: number } = {};

				const boostCounts = this.boostCounts;
				const bodyCounts = this.bodypartCounts;

				for (const boost of _.cloneDeep(this.memory.needBoosts)) {
					const bodypartType = BOOST_PARTS[boost];
					if (!bodypartType) {
						log.error(`${boost} is not a valid boost!`);
					}
					const numParts = bodyCounts[bodypartType] || 0;
					const numBoostedParts = boostCounts[boost] || 0;
					if (numBoostedParts < numParts) {
						neededBoosts[boost] =
							LAB_BOOST_MINERAL * (numParts - numBoostedParts);
					} else {
						_.pull(this.memory.needBoosts, boost);
					}
				}

				this._neededBoosts = neededBoosts;
			} else {
				this._neededBoosts = {};
			}
		}

		return this._neededBoosts;
	}

	// Overlord logic --------------------------------------------------------------------------------------------------

	/**
	 * Reassigns the creep to work under a new overlord and as a new role.
	 */
	reassign(
		newOverlord: Overlord | null,
		newRole?: string,
		invalidateTask = true
	) {
		super.reassign(newOverlord);
		if (newRole) {
			this.roleName = newRole;
			this.memory.role = newRole;
		}
		if (invalidateTask) {
			this.task = null;
		}
	}

	// Task logic ------------------------------------------------------------------------------------------------------

	/**
	 * Wrapper for _task
	 */
	get task(): Task<any> | null {
		if (!this._task) {
			this._task =
				this.memory.task ? initializeTask(this.memory.task) : null;
		}
		return this._task;
	}

	/**
	 * Assign the creep a task with the setter, replacing creep.assign(Task)
	 */
	set task(task: Task<any> | null) {
		// Unregister target from old task if applicable
		const oldProtoTask = this.memory.task;
		if (oldProtoTask) {
			const oldRef = oldProtoTask._target.ref;
			if (Overmind.cache.targets[oldRef]) {
				_.remove(
					Overmind.cache.targets[oldRef],
					(name) => name == this.name
				);
			}
		}
		// Set the new task
		this.memory.task = task ? task.proto : null;
		if (task) {
			if (task.target) {
				// Register task target in cache if it is actively targeting something (excludes goTo and similar)
				if (!Overmind.cache.targets[task.target.ref]) {
					Overmind.cache.targets[task.target.ref] = [];
				}
				Overmind.cache.targets[task.target.ref].push(this.name);
			}
			// Register references to creep
			task.creep = this;
		}
		// Clear cache
		this._task = null;
	}

	/**
	 * Does the creep have a valid task at the moment?
	 */
	get hasValidTask(): boolean {
		return !!this.task && this.task.isValid();
	}

	/**
	 * Creeps are idle if they don't have a task.
	 */
	get isIdle(): boolean {
		return !this.task || !this.task.isValid();
	}

	/**
	 * Execute the task you currently have.
	 */
	run(): number | undefined {
		let res;
		if (this.task) {
			res = this.task.run();
		}

		if (this.memory.debug) {
			const data = [this.name];

			if (this.task) {
				data.push(`task: ${this.task.name}`);
				data.push(`pos: ${this.task.targetPos.printPlain}`);
			} else {
				data.push(`idle`);
			}

			new RoomVisual(this.room.name).infoBox(
				data,
				this.pos.x,
				this.pos.y,
				{
					opacity: 0.9,
				}
			);

			// Current path
			if (this.memory._go && this.memory._go?.path) {
				// log.debug(`${this.creep}: ${this.nextPos.print} ${this.pos.print}`);
				const serialPath = this.memory._go?.path.substring(1);
				const path = Pathing.deserializePath(this.nextPos, serialPath);
				// log.debug(`${this.print} has path: ${path.length}, ${path.map(p => p.print).join(" > ")}`);
				Visualizer.drawPath(path, { fill: "red", lineStyle: "dashed" });

				const lastStep = _.last(path);
				if (lastStep) {
					if (lastStep.roomName !== this.pos.roomName || true) {
						const lastData = [
							this.name,
							`eta: ${
								this.task?.eta ??
								this.memory._go.path.length ??
								NaN
							}`,
						];
						new RoomVisual(lastStep.roomName).infoBox(
							lastData,
							lastStep.x,
							lastStep.y,
							{
								color: "red",
								opacity: 0.6,
							}
						);
					}
				}
			}
		}
		return res;
	}
}
