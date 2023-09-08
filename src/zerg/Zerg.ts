import {log} from '../console/log';
import {isCreep, isPowerCreep, isStandardZerg} from '../declarations/typeGuards';
import {CombatIntel} from '../intel/CombatIntel';
import {Overlord} from '../overlords/Overlord';
import {profile} from '../profiler/decorator';
import {BOOST_PARTS} from '../resources/map_resources';
import {initializeTask} from '../tasks/initializer';
import {MIN_LIFETIME_FOR_BOOST} from '../tasks/instances/getBoosted';
import {Task} from '../tasks/Task';
import {AnyZerg} from './AnyZerg';
import {Visualizer} from 'visuals/Visualizer';
import {Pathing} from 'movement/Pathing';


export function normalizeStandardZerg(creep: Zerg | Creep): Zerg | Creep {
	return Overmind.zerg[creep.name] || creep;
}

export function toCreep(creep: Zerg | Creep): Creep {
	return isStandardZerg(creep) ? creep.creep : creep;
}

// Last pipeline is more complex because it depends on the energy a creep has; sidelining this for now
const ACTION_PIPELINES: string[][] = [
	['harvest', 'attack', 'build', 'repair', 'dismantle', 'attackController', 'rangedHeal', 'heal'],
	['rangedAttack', 'rangedMassAttack', 'build', 'repair', 'rangedHeal'],
	// ['upgradeController', 'build', 'repair', 'withdraw', 'transfer', 'drop'],
];

const _RANGES = {
	BUILD   : 3,
	REPAIR  : 3,
	TRANSFER: 1,
	WITHDRAW: 1,
	HARVEST : 1,
	DROP    : 0,
};

/**
 * The Zerg class is a wrapper for owned creeps and contains all wrapped creep methods and many additional methods for
 * direct control of a creep. As of April 2020, this class now extends the AnyZerg class to accommodate the introduction
 * of power creeps into the game.
 */
@profile
export class Zerg extends AnyZerg {

	isStandardZerg: true;
	creep: Creep; 						// The creep that this wrapper class will control
	body: BodyPartDefinition[];    	 	// These properties are all wrapped from this.creep.* to this.*
	store: StoreDefinition;				// |
	fatigue: number;					// |
	hits: number;						// |
	hitsMax: number;					// |
	id: string;							// |
	memory: CreepMemory;				// | See the ICreepMemory interface for structure
	name: string;						// |
	pos: RoomPosition;					// |
	nextPos: RoomPosition;				// | The next position the creep will be in after registering a move intent
	ref: string;						// |
	roleName: string;					// |
	room: Room;							// |
	saying: string;						// |
	spawning: boolean;					// |
	ticksToLive: number | undefined;	// |
	lifetime: number;
	actionLog: { [actionName: string]: boolean }; // Tracks the actions that a creep has completed this tick
	blockMovement: boolean; 			// Whether the zerg is allowed to move or not

	// Cached properties
	private _task: Task<any> | null;
	private _neededBoosts: { [boostResource: string]: number } | undefined;
	private _spawnInfo: Spawning | undefined;

	constructor(creep: Creep, notifyWhenAttacked = true) {
		super(creep, notifyWhenAttacked);
		this.isStandardZerg = true;
		// Copy over creep references
		// this.creep = creep;
		this.body = creep.body;
		// this.carry = creep.carry;
		// this.store = creep.store;
		// this.carryCapacity = creep.carryCapacity;
		this.fatigue = creep.fatigue;
		// this.hits = creep.hits;
		// this.hitsMax = creep.hitsMax;
		// this.id = creep.id;
		// this.memory = creep.memory;
		// this.name = creep.name;
		// this.pos = creep.pos;
		// this.nextPos = creep.pos;
		// this.ref = creep.ref;
		this.roleName = creep.memory.role;
		// this.room = creep.room;
		// this.saying = creep.saying;
		this.spawning = creep.spawning;
		// this.ticksToLive = creep.ticksToLive;
		// Extra properties
		// this.lifetime = this.getBodyparts(CLAIM) > 0 ? CREEP_CLAIM_LIFE_TIME : CREEP_LIFE_TIME;
		// this.actionLog = {};
		// this.blockMovement = false;
		// Register global references
		Overmind.zerg[this.name] = this;
		// global[this.name] = this;
		// Handle attack notification when at lifetime - 1
		// if (!notifyWhenAttacked && (this.ticksToLive || 0) >= this.lifetime - (NEW_OVERMIND_INTERVAL + 1)) {
		// 	// creep.notifyWhenAttacked only uses the 0.2CPU intent cost if it changes the intent value
		// 	this.notifyWhenAttacked(notifyWhenAttacked);
		// }
	}

	/**
	 * Refresh all changeable properties of the creep or delete from Overmind and global when dead
	 */
	refresh(): void {
		super.refresh();
		const creep = Game.creeps[this.name];
		if (creep) {
			// this.creep = creep;
			// this.pos = creep.pos;
			// this.nextPos = creep.pos;
			this.body = creep.body;
			// this.carry = creep.carry;
			// this.store = creep.store;
			// this.carryCapacity = creep.carryCapacity;
			this.fatigue = creep.fatigue;
			// this.hits = creep.hits;
			// this.memory = creep.memory;
			this.roleName = creep.memory.role;
			// this.room = creep.room;
			// this.saying = creep.saying;
			this.spawning = creep.spawning;
			// this.ticksToLive = creep.ticksToLive;
			// this.actionLog = {};
			// this.blockMovement = false;
			this._task = null; // todo
			this._neededBoosts = undefined;
		} else {
			// log.debug(`Deleting from global`);
			delete Overmind.zerg[this.name];
			// delete global[this.name];
		}
	}

	private get spawnInfo(): Spawning | undefined {
		if (!this.spawning) return undefined;
		if (!this._spawnInfo) {
			const spawner = this.pos.lookForStructure(STRUCTURE_SPAWN);
			if (!spawner) {
				// Shouldn't ever get here
				log.error(`Error determining ticks to spawn for ${this.name} @ ${this.pos.print}!`);
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
		if (!info) return undefined;
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
				if (target.hitsPredicted == undefined) target.hitsPredicted = target.hits;
				target.hitsPredicted -= CombatIntel.predictedDamageAmount(this.creep, target, 'attack');
			}
			if (isCreep(target)) {
				// account for hitback effects
				if (this.creep.hitsPredicted == undefined) this.creep.hitsPredicted = this.creep.hits;
				this.creep.hitsPredicted -= CombatIntel.predictedDamageAmount(target, this.creep, 'attack');
			}
			if (this.memory.talkative) this.say(`💥`);
		}
		return result;
	}

	attackController(controller: StructureController) {
		const result = this.creep.attackController(controller);
		if (!this.actionLog.attackController) this.actionLog.attackController = (result == OK);
		return result;
	}

	build(target: ConstructionSite) {
		const result = this.creep.build(target);
		if (!this.actionLog.build) this.actionLog.build = (result == OK);
		return result;
	}

	goBuild(target: ConstructionSite) {
		if (this.build(target) == ERR_NOT_IN_RANGE) {
			this.goTo(target);
		}
	}

	// cancelOrder(methodName: string): OK | ERR_NOT_OWNER | ERR_BUSY | ERR_NOT_FOUND {
	// 	const result = this.creep.cancelOrder(methodName);
	// 	if (result == OK) this.actionLog[methodName] = false;
	// 	return result;
	// }

	claimController(controller: StructureController) {
		const result = this.creep.claimController(controller);
		if (!this.actionLog.claimController) this.actionLog.claimController = (result == OK);
		if (result == OK) {
			Overmind.shouldBuild = true; // rebuild the overmind object on the next tick to account for new room
		}
		return result;
	}

	dismantle(target: Structure): CreepActionReturnCode {
		const result = this.creep.dismantle(target);
		if (!this.actionLog.dismantle) this.actionLog.dismantle = (result == OK);
		return result;
	}

	goDismantle(target: Structure) {
		const res = this.dismantle(target);
		if (res == ERR_NOT_IN_RANGE) {
			return this.goTo(target);
		}
		return res;
	}

	// drop(resourceType: ResourceConstant, amount?: number) {
	// 	const result = this.creep.drop(resourceType, amount);
	// 	if (!this.actionLog.drop) this.actionLog.drop = (result == OK);
	// 	return result;
	// }

	// goDrop(pos: RoomPosition, resourceType: ResourceConstant, amount?: number) {
	// 	if (this.pos.inRangeToPos(pos, RANGES.DROP)) {
	// 		return this.drop(resourceType, amount);
	// 	} else {
	// 		return this.goTo(pos);
	// 	}
	// }

	generateSafeMode(target: StructureController) {
		return this.creep.generateSafeMode(target);
	}

	harvest(source: Source | Deposit | Mineral) {
		const result = this.creep.harvest(source);
		if (!this.actionLog.harvest) this.actionLog.harvest = (result == OK);
		return result;
	}

	goHarvest(source: Source | Deposit | Mineral): void {
		if (this.harvest(source) == ERR_NOT_IN_RANGE) {
			this.goTo(source);
		}
	}

	// move(direction: DirectionConstant, force = false) {
	// 	if (!this.blockMovement && !force) {
	// 		const result = this.creep.move(direction);
	// 		if (result == OK) {
	// 			if (!this.actionLog.move) this.actionLog.move = true;
	// 			this.nextPos = this.pos.getPositionAtDirection(direction);
	// 		}
	// 		return result;
	// 	} else {
	// 		return ERR_BUSY;
	// 	}
	// }

	// notifyWhenAttacked(enabled: boolean) {
	// 	return this.creep.notifyWhenAttacked(enabled);
	// }

	// pickup(resource: Resource) {
	// 	const result = this.creep.pickup(resource);
	// 	if (!this.actionLog.pickup) this.actionLog.pickup = (result == OK);
	// 	return result;
	// }

	rangedAttack(target: Creep | Structure) {
		const result = this.creep.rangedAttack(target);
		if (result == OK) {
			this.actionLog.rangedAttack = true;
			if (isCreep(target)) {
				if (target.hitsPredicted == undefined) target.hitsPredicted = target.hits;
				target.hitsPredicted -= CombatIntel.predictedDamageAmount(this, target, 'rangedAttack');
			}
			if (this.memory.talkative) this.say(`🔫`);
		}
		return result;
	}

	rangedMassAttack() {
		const result = this.creep.rangedMassAttack();
		if (result == OK) {
			this.actionLog.rangedMassAttack = true;
			for (const target of this.pos.findInRange(this.room.hostiles, 3)) {
				if (target.hitsPredicted == undefined) target.hitsPredicted = target.hits;
				target.hitsPredicted -= CombatIntel.getMassAttackDamageTo(this, target);
			}
			if (this.memory.talkative) this.say(`💣`);
		}
		return result;
	}

	repair(target: Structure) {
		const result = this.creep.repair(target);
		if (!this.actionLog.repair) this.actionLog.repair = (result == OK);
		return result;
	}

	goRepair(target: Structure): void {
		if (this.repair(target) == ERR_NOT_IN_RANGE) {
			this.goTo(target);
		}
	}

	reserveController(controller: StructureController) {
		const result = this.creep.reserveController(controller);
		if (!this.actionLog.reserveController) this.actionLog.reserveController = (result == OK);
		return result;
	}

	// /* Say a message; maximum message length is 10 characters */
	// say(message: string, pub?: boolean) {
	// 	return this.creep.say(message, pub);
	// }

	signController(target: StructureController, text: string) {
		const result = this.creep.signController(target, text);
		if (!this.actionLog.signController) this.actionLog.signController = (result == OK);
		return result;
	}

	upgradeController(controller: StructureController) {
		const result = this.creep.upgradeController(controller);
		if (!this.actionLog.upgradeController) this.actionLog.upgradeController = (result == OK);
		// Determine amount of upgrade power
		// let weightedUpgraderParts = _.map(this.boostCounts, )
		// let upgradeAmount = this.getActiveBodyparts(WORK) * UPGRADE_CONTROLLER_POWER;
		// let upgrade

		// Stats.accumulate(`colonies.${this.colony.name}.rcl.progressTotal`, upgradeAmount);
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
			if (creep.hitsPredicted == undefined) creep.hitsPredicted = creep.hits;
			creep.hitsPredicted += CombatIntel.getHealAmount(this);
			if (this.memory.talkative) this.say('🚑');
		}
		return result;
	}

	rangedHeal(target: Creep | Zerg) {
		const creep = toCreep(target);
		const result = this.creep.rangedHeal(creep);
		if (result == OK) {
			this.actionLog.rangedHeal = true;
			if (creep.hitsPredicted == undefined) creep.hitsPredicted = creep.hits;
			creep.hitsPredicted += CombatIntel.getRangedHealAmount(this);
			if (this.memory.talkative) this.say(`💉`);
		}
		return result;
	}

	// transfer(target: Creep | Zerg | Structure, resourceType: ResourceConstant = RESOURCE_ENERGY, amount?: number) {
	// 	let result: ScreepsReturnCode;
	// 	if (target instanceof Zerg) {
	// 		result = this.creep.transfer(target.creep, resourceType, amount);
	// 	} else {
	// 		result = this.creep.transfer(target, resourceType, amount);
	// 	}
	// 	if (!this.actionLog.transfer) this.actionLog.transfer = (result == OK);
	// 	return result;
	// }

	// goTransfer(target: Creep | Zerg | Structure, resourceType: ResourceConstant = RESOURCE_ENERGY, amount?: number) {
	// 	if (this.pos.inRangeToPos(target.pos, RANGES.TRANSFER)) {
	// 		return this.transfer(target, resourceType, amount);
	// 	} else {
	// 		return this.goTo(target);
	// 	}
	// }

	// withdraw(target: Structure | Tombstone | Ruin, resourceType: ResourceConstant = RESOURCE_ENERGY, amount?: number) {
	// 	const result = this.creep.withdraw(target, resourceType, amount);
	// 	if (!this.actionLog.withdraw) this.actionLog.withdraw = (result == OK);
	// 	return result;
	// }

	// goWithdraw(target: Structure | Tombstone, resourceType: ResourceConstant = RESOURCE_ENERGY, amount?: number) {
	// 	if (this.pos.inRangeToPos(target.pos, RANGES.WITHDRAW)) {
	// 		return this.withdraw(target, resourceType, amount);
	// 	} else {
	// 		return this.goTo(target);
	// 	}
	// }

	// Simultaneous creep actions --------------------------------------------------------------------------------------

	/**
	 * Determine whether the given action will conflict with an action the creep has already taken.
	 * See http://docs.screeps.com/simultaneous-actions.html for more details.
	 */
	canExecute(actionName: string): boolean {
		// Only one action can be executed from within a single pipeline
		let conflictingActions: string[] = [actionName];
		for (const pipeline of ACTION_PIPELINES) {
			if (pipeline.includes(actionName)) conflictingActions = conflictingActions.concat(pipeline);
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
		return _.filter(this.body, (part: BodyPartDefinition) => part.type == partType).length;
	}

	// Custom creep methods ============================================================================================

	// Carry methods

	// get hasMineralsInCarry(): boolean {
	// 	for (const [resourceType, amount] of this.carry.contents) {
	// 		if (resourceType != RESOURCE_ENERGY && amount > 0) {
	// 			return true;
	// 		}
	// 	}
	// 	return false;
	// }

	// Boosting logic --------------------------------------------------------------------------------------------------

	get boostCounts(): { [boostType: string]: number } {
		return _.countBy(this.body, bodyPart => bodyPart.boost);
	}

	get bodypartCounts(): { [bodypart in BodyPartConstant]: number } {
		return this.creep.bodypartCounts;
	}

	get needsBoosts(): boolean {
		if (!this.overlord) {
			return false;
		}
		if ((this.ticksToLive || this.lifetime) < MIN_LIFETIME_FOR_BOOST * this.lifetime) {
			return false;
		}
		return !_.isEmpty(this.getNeededBoosts());
	}

	/**
	 * Gets an object describing the amount of boosts (in minerals, not bodyparts) this Zerg needs. If the zerg is
	 * fully boosted for a given resource type, the entry is removed from memory.needBoosts.
	 */
	getNeededBoosts(): { [boostResource: string]: number } {
		if (!this._neededBoosts) { // this is cleared each tick
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
						neededBoosts[boost] = LAB_BOOST_MINERAL * (numParts - numBoostedParts);
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
	reassign(newOverlord: Overlord | null, newRole?: string, invalidateTask = true) {
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
			this._task = this.memory.task ? initializeTask(this.memory.task) : null;
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
				_.remove(Overmind.cache.targets[oldRef], name => name == this.name);
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
			const data = [
				this.name,
			];

			if (this.task) {
				data.push(`task: ${this.task.name}`);
				data.push(`pos: ${this.task.targetPos.printPlain}`);
			} else {
				data.push(`idle`);
			}

			new RoomVisual(this.room.name).infoBox(data, this.pos.x, this.pos.y, {
				opacity: 0.9,
			});

			// Current path
			if (this.memory._go && this.memory._go?.path) {
				// log.debug(`${this.creep}: ${this.nextPos.print} ${this.pos.print}`);
				const serialPath = this.memory._go?.path.substring(1);
				const path = Pathing.deserializePath(this.nextPos, serialPath);
				// log.debug(`${this.print} has path: ${path.length}, ${path.map(p => p.print).join(" > ")}`);
				Visualizer.drawPath(path, { fill: 'red', lineStyle: 'dashed'});

				const lastStep = _.last(path);
				if (lastStep) {
					if (lastStep.roomName !== this.pos.roomName || true) {
						const lastData = [
							this.name,
							`eta: ${this.task?.eta ?? NaN}`,
						];
						new RoomVisual(lastStep.roomName).infoBox(lastData, lastStep.x, lastStep.y, {
							color: 'red',
							opacity: 0.6
						});
					}
				}
			}
		}
		return res;
	}

	// Colony association ----------------------------------------------------------------------------------------------

	// /**
	//  * Colony that the creep belongs to.
	//  */
	// get colony(): Colony | null {
	// 	if (this.memory[MEM.COLONY] != null) {
	// 		return Overmind.colonies[this.memory[MEM.COLONY] as string];
	// 	} else {
	// 		return null;
	// 	}
	// }
	//
	// set colony(newColony: Colony | null) {
	// 	if (newColony != null) {
	// 		this.memory[MEM.COLONY] = newColony.name;
	// 	} else {
	// 		this.memory[MEM.COLONY] = null;
	// 	}
	// }
	//
	// /**
	//  * If the creep is in a colony room or outpost
	//  */
	// get inColonyRoom(): boolean {
	// 	return Overmind.colonyMap[this.room.name] == this.memory[MEM.COLONY];
	// }

	// Movement and location -------------------------------------------------------------------------------------------

	// goTo(destination: RoomPosition | HasPos, options: MoveOptions = {}) {
	// 	return Movement.goTo(this, destination, options);
	// }
	//
	// goToRoom(roomName: string, options: MoveOptions = {}) {
	// 	return Movement.goToRoom(this, roomName, options);
	// }
	//
	// inSameRoomAs(target: HasPos): boolean {
	// 	return this.pos.roomName == target.pos.roomName;
	// }
	//
	// safelyInRoom(roomName: string): boolean {
	// 	return this.room.name == roomName && !this.pos.isEdge;
	// }
	//
	// get inRampart(): boolean {
	// 	return this.creep.inRampart;
	// }
	//
	// get isMoving(): boolean {
	// 	const moveData = this.memory._go as MoveData | undefined;
	// 	return !!moveData && !!moveData.path && moveData.path.length > 1;
	// }
	//
	// /**
	//  * Kite around hostiles in the room
	//  */
	// kite(avoidGoals: (RoomPosition | HasPos)[] = this.room.hostiles, options: MoveOptions = {}): number | undefined {
	// 	_.defaults(options, {
	// 		fleeRange: 5
	// 	});
	// 	return Movement.kite(this, avoidGoals, options);
	// }
	//
	// private defaultFleeGoals() {
	// 	let fleeGoals: (RoomPosition | HasPos)[] = [];
	// 	fleeGoals = fleeGoals.concat(this.room.hostiles)
	// 						 .concat(_.filter(this.room.keeperLairs, lair => (lair.ticksToSpawn || Infinity) < 10));
	// 	return fleeGoals;
	// }
	//
	// /**
	//  * Flee from hostiles in the room, while not repathing every tick
	//  */
	// flee(avoidGoals: (RoomPosition | HasPos)[] = this.room.fleeDefaults,
	// 	 fleeOptions: FleeOptions              = {},
	// 	 moveOptions: MoveOptions              = {}): boolean {
	// 	if (avoidGoals.length == 0 || this.room.dangerousHostiles.find(creep =>
	// 																	   creep.pos.getRangeToXY(this.pos.x, this.pos.y) < 6) == undefined) {
	// 		return false;
	// 	} else if (this.room.controller && this.room.controller.my && this.room.controller.safeMode) {
	// 		return false;
	// 	} else {
	// 		const fleeing = Movement.flee(this, avoidGoals, fleeOptions.dropEnergy, moveOptions) != undefined;
	// 		if (fleeing) {
	// 			// Drop energy if needed
	// 			if (fleeOptions.dropEnergy && this.carry.energy > 0) {
	// 				const nearbyContainers = this.pos.findInRange(this.room.storageUnits, 1);
	// 				if (nearbyContainers.length > 0) {
	// 					this.transfer(_.first(nearbyContainers), RESOURCE_ENERGY);
	// 				} else {
	// 					this.drop(RESOURCE_ENERGY);
	// 				}
	// 			}
	// 			// Invalidate task
	// 			if (fleeOptions.invalidateTask && !this.inRampart) {
	// 				this.task = null;
	// 			}
	// 		}
	// 		return fleeing;
	// 	}
	// }
	//
	// /**
	//  * Park the creep off-roads
	//  */
	// park(pos: RoomPosition = this.pos, maintainDistance = false): number {
	// 	return Movement.park(this, pos, maintainDistance);
	// }
	//
	// /**
	//  * Moves a creep off of the current tile to the first available neighbor
	//  */
	// moveOffCurrentPos(): number | undefined {
	// 	return Movement.moveOffCurrentPos(this);
	// }
	//
	// /**
	//  * Moves onto an exit tile
	//  */
	// moveOnExit(): ScreepsReturnCode | undefined {
	// 	return Movement.moveOnExit(this);
	// }
	//
	// /**
	//  * Moves off of an exit tile
	//  */
	// moveOffExit(avoidSwamp = true): ScreepsReturnCode {
	// 	return Movement.moveOffExit(this, avoidSwamp);
	// }
	//
	// moveOffExitToward(pos: RoomPosition, detour = true): number | undefined {
	// 	return Movement.moveOffExitToward(this, pos, detour);
	// }


	// Miscellaneous fun stuff -----------------------------------------------------------------------------------------

	// sayLoop(messageList: string[], pub?: boolean) {
	// 	return this.say(messageList[Game.time % messageList.length], pub);
	// }
	//
	// sayRandom(phrases: string[], pub?: boolean) {
	// 	return this.say(phrases[Math.floor(Math.random() * phrases.length)], pub);
	// }

}

