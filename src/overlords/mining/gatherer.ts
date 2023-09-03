import { errorForCode } from 'utilities/errors';
import {$} from '../../caching/GlobalCache';
import {log} from '../../console/log';
import {bodyCost, CreepSetup} from '../../creepSetups/CreepSetup';
import {Roles, Setups} from '../../creepSetups/setups';
import {Pathing} from '../../movement/Pathing';
import {OverlordPriority} from '../../priorities/priorities_overlords';
import {profile} from '../../profiler/decorator';
import {getCacheExpiration, minBy} from '../../utilities/utils';
import {Zerg} from '../../zerg/Zerg';
import {Overlord, OverlordMemory} from '../Overlord';
import { DirectiveGather } from 'directives/resource/gather';

export const StandardMinerSetupCost = bodyCost(Setups.drones.miners.standard.generateBody(Infinity));

export const DoubleMinerSetupCost = bodyCost(Setups.drones.miners.double.generateBody(Infinity));


const BUILD_OUTPUT_FREQUENCY = 15;
const SUICIDE_CHECK_FREQUENCY = 3;
const MINER_SUICIDE_THRESHOLD = 200;
const DISMANTLE_CHECK_FREQUENCY = 1500;

const DISMANTLE_CHECK = 'dc';

interface GatheringOverlordMemory extends OverlordMemory {
	[DISMANTLE_CHECK]?: number;
	dismantleNeeded?: boolean;
}

/**
 * Spawns miners to harvest from remote, owned, or sourcekeeper energy deposits. Standard mining actions have been
 * heavily CPU-optimized
 */
@profile
export class GatheringOverlord extends Overlord {

	memory: GatheringOverlordMemory;

	room: Room | undefined;
	distance: number;
	deposit: Deposit | undefined;
	isDisabled: boolean;
	container: StructureContainer | undefined;
	// link: StructureLink | undefined;
	constructionSite: ConstructionSite | undefined;
	harvestPos: RoomPosition | undefined;
	miners: Zerg[];
	energyPerTick: number;
	miningPowerNeeded: number;
	setup: CreepSetup;
	minersNeeded: number;
	// allowDropMining: boolean;
	// earlyMode: boolean;

	private dismantlePositions: RoomPosition[] | undefined;

	static settings = {
		minLinkDistance : 10,
		dropMineUntilRCL: 3,
	};

	constructor(directive: DirectiveGather, priority: number) {
		super(directive, 'mine', priority);
		this.distance = directive.distance;

		this.priority += this.outpostIndex * OverlordPriority.remoteRoom.roomIncrement;
		this.miners = this.zerg(Roles.drone);

		// Populate structures
		this.populateStructures();

		// Check if dismantling is needed
		if (this.memory.dismantleNeeded || Game.time > (this.memory[DISMANTLE_CHECK] || 0)) {
			if (this.room) {
				const positions = this.getDismantlePositions();
				if (positions.length > 0) {
					this.memory.dismantleNeeded = true;
					this.dismantlePositions = positions;
				} else {
					this.memory[DISMANTLE_CHECK] = getCacheExpiration(DISMANTLE_CHECK_FREQUENCY,
																	  DISMANTLE_CHECK_FREQUENCY / 5);
				}
			}
		}

		// Compute energy output
		// if (Cartographer.roomType(this.pos.roomName) == ROOMTYPE_SOURCEKEEPER) {
		// 	this.energyPerTick = SOURCE_ENERGY_KEEPER_CAPACITY / ENERGY_REGEN_TIME;
		// } else if (this.colony.level >= DirectiveOutpost.settings.canSpawnReserversAtRCL) {
		// 	this.energyPerTick = SOURCE_ENERGY_CAPACITY / ENERGY_REGEN_TIME;
		// } else {
		// 	this.energyPerTick = SOURCE_ENERGY_NEUTRAL_CAPACITY / ENERGY_REGEN_TIME;
		// }
		// this.miningPowerNeeded = Math.ceil(this.energyPerTick / HARVEST_POWER) + 1;
		this.miningPowerNeeded = 0;

		this.setup = Setups.drones.miners.deposit;

		const miningPowerEach = this.setup.getBodyPotential(WORK, this.colony);
		this.minersNeeded = Math.min(Math.ceil(this.miningPowerNeeded / miningPowerEach),
									 this.pos.availableNeighbors(true).length);
		this.minersNeeded = this.isDisabled ? 0 : this.minersNeeded;

		// Calculate optimal location for mining
		this.harvestPos = this.container ? this.container.pos : this.calculateContainerPos();
	}

	/**
	 * Checks if dismantling is needed in the operating room
	 */
	private getDismantlePositions(): RoomPosition[] {
		const dismantleStructures: Structure[] = [];
		if (this.room) {
			const targets = _.compact([this.deposit, this.container]) as RoomObject[];
			for (const target of targets) {
				// Add blocking structures
				const blockingStructure = this.findBlockingStructure(target);
				if (blockingStructure) {
					dismantleStructures.push(blockingStructure);
				}
				// Add unwalkable structures with low hits in 2 range
				for (const pos of target.pos.getPositionsInRange(2, false, false)) {
					const unwalkableStructure = _.find(pos.lookFor(LOOK_STRUCTURES), s => !s.isWalkable);
					if (unwalkableStructure && !(<OwnedStructure>unwalkableStructure).my) {
						dismantleStructures.push(unwalkableStructure);
					}
				}
			}
			this.debug(`structures to dismantle: ${dismantleStructures.map(s => `${s.structureType} ${s.pos.print}`)}`);
		} else {
			log.error(`MiningOverlord.getDismantleStructures() called with no vision in room ${this.pos.roomName}!`);
		}
		return _.unique(_.map(dismantleStructures, s => s.pos));
	}

	/**
	 * Finds the structure which is blocking access to a source or controller
	 */
	private findBlockingStructure(target: RoomObject): Structure | undefined {
		if (!this.room) return;
		const pos = Pathing.findBlockingPos(this.colony.pos, target.pos,
											_.filter(this.room.structures, s => !s.isWalkable));
		if (pos) {
			const structure = _.find(pos.lookFor(LOOK_STRUCTURES), s => !s.isWalkable);
			return structure || log.error(`${this.print}: no structure at blocking pos ${pos.print}!`);
		}
	}

	private populateStructures() {
		if (Game.rooms[this.pos.roomName]) {
			this.deposit = this.pos.lookFor(LOOK_DEPOSITS)[0];
			this.constructionSite = _.first(_.filter(this.pos.findInRange(FIND_MY_CONSTRUCTION_SITES, 2),
													 site => site.structureType == STRUCTURE_CONTAINER ||
															 site.structureType == STRUCTURE_LINK));
			this.container = this.pos.findClosestByLimitedRange(Game.rooms[this.pos.roomName].containers, 1);
		}
	}

	refresh() {
		if (!this.room && Game.rooms[this.pos.roomName]) { // if you just gained vision of this room
			this.populateStructures();
		}
		super.refresh();
		// Refresh your references to the objects
		$.refresh(this, 'deposit', 'container', 'constructionSite');
	}

	static calculateContainerPos(source: RoomPosition, dropoffLocation?: RoomPosition): RoomPosition {
		// log.debug(`Computing container position for mining overlord at ${source.print}...`);

		if (dropoffLocation && source.isVisible) {
			const neighbors = source.neighbors;

			// We calculate positions that would conflict with our own preferred position
			const obstacles: RoomPosition[] = [];
			for (const pos of neighbors) {
				const structures = pos.lookFor(LOOK_STRUCTURES).filter(s => !s.isWalkable);
				for (const struct of structures) {
					const structNeighbors = struct.pos.availableNeighbors(true);

					const sharedNeighbors = structNeighbors.filter(structNeighbor => {
						return neighbors.some(neighporPos => neighporPos.isEqualTo(structNeighbor))
					});

					// Only consider the neighboring structure if it would have that one path out
					if (sharedNeighbors.length === structNeighbors.length) {
						obstacles.push(...sharedNeighbors);
					}
				}
			}

			const path = Pathing.findShortestPath(source, dropoffLocation, { obstacles: obstacles }).path;
			const pos = _.find(path, pos => pos.getRangeTo(source) == 1);
			if (pos) return pos;
		}

		log.warning(`Last resort container position calculation for ${source.print}!`);
		// A source always have at least one neighbor, force the type
		// eslint-disable-next-line @typescript-eslint/no-unnecessary-type-assertion
		return <RoomPosition>_.first(source.availableNeighbors(true));
	}

	/**
	 * Calculate where the container output will be built for this site
	 */
	private calculateContainerPos(): RoomPosition {
		let dropoff: RoomPosition | undefined;
		if (this.colony.storage) {
			dropoff = this.colony.storage.pos;
		} else if (this.colony.roomPlanner.storagePos) {
			dropoff = this.colony.roomPlanner.storagePos;
		}
		return GatheringOverlord.calculateContainerPos(this.pos, dropoff);
	}

	/**
	 * Add or remove containers as needed to keep exactly one of container | link
	 */
	private addRemoveContainer(): void {
		// Create container if there is not already one being built and no link
		if (!this.container && !this.constructionSite) {
			const containerPos = this.calculateContainerPos();
			if (!containerPos) {
				log.error(`${this.print}: can't build container at ${this.room}`);
				return;
			}
			const container = containerPos ? containerPos.lookForStructure(STRUCTURE_CONTAINER) : undefined;
			if (container) {
				log.warning(`${this.print}: this.container out of sync at ${containerPos.print}`);
				this.container = container;
				return;
			}
			log.info(`${this.print}: building container at ${containerPos.print}`);
			const result = containerPos.createConstructionSite(STRUCTURE_CONTAINER);
			if (result != OK) {
				log.error(`${this.print}: cannot build container at ${containerPos.print}: ${errorForCode(result)}`);
			}
			return;
		}
	}

	private registerEnergyRequests(): void {
		if (this.container) {
			const threshold = this.colony.storage ? 0.8 : 0.5;

			const filled = this.container.store.getUsedCapacity();

			const readyForPickup = filled > threshold * 200 * this.colony.level;

			// this.debug(`${this.print} registerEnergyRequests: capacity ${overallCapacity}, `
			// 	+ `actual: ${filled}/${capacity}, ${ratio}%, threshold: ${threshold} `
			// 	+ `=> ${ratio > threshold} (old: ${filled > threshold * 200 * this.colony.level})`)
			if (readyForPickup) {
				this.colony.logisticsNetwork.requestOutput(this.container, {
					resourceType: 'all',
					dAmountdt   : this.energyPerTick,
				});
			}
		}
		if (!this.container && this.miners.length > 0) {
			// We're dropping on the ground
			const drops = this.miners[0].pos.lookFor(LOOK_RESOURCES);
			for (const drop of drops) {
				this.colony.logisticsNetwork.requestOutput(drop, { resourceType: drop.resourceType });
			}
		}
	}

	get isActive() {
		return super.isActive && !this.isDisabled;
	}

	init() {
		this.wishlist(this.minersNeeded, this.setup);
		this.registerEnergyRequests();
	}

	/**
	 * Suicide outdated miners when their replacements arrive
	 */
	private suicideOldMiners(): boolean {
		if (this.miners.length > this.minersNeeded && this.deposit) {
			// if you have multiple miners and the source is visible
			const targetPos = this.harvestPos || this.deposit.pos;
			const minersNearSource = _.filter(this.miners,
											  miner => miner.pos.getRangeTo(targetPos) <= SUICIDE_CHECK_FREQUENCY);
			if (minersNearSource.length > this.minersNeeded) {
				// if you have more miners by the source than you need
				const oldestMiner = minBy(minersNearSource, miner => miner.ticksToLive || 9999);
				if (oldestMiner && (oldestMiner.ticksToLive || 9999) < MINER_SUICIDE_THRESHOLD) {
					// if the oldest miner will die sufficiently soon
					oldestMiner.retire();
					return true;
				}
			}
		}
		return false;
	}

	/**
	 * Preliminary actions performed before going into the harvest-transfer loop
	 *
	 * This check for anything to dismantle, repair or build, then ensure the creep
	 * is at least in the correct room to harvest.
	 */
	private prepareActions(miner: Zerg) {
		if (this.memory.dismantleNeeded) {
			this.dismantleActions(miner);
			return true;
		} else if (this.container
				&& this.container.hits < this.container.hitsMax
				&& miner.store.energy >= Math.min(miner.store.getCapacity(), REPAIR_POWER * miner.getActiveBodyparts(WORK))) {
			// Mining container hitpoints are low
			this.debug(`${miner.print} repairing ${this.container.print}`);
			miner.repair(this.container);
			return true;
		} else if (this.constructionSite
			&& miner.store.energy >= Math.min(miner.store.getCapacity(), BUILD_POWER * miner.getActiveBodyparts(WORK))) {
			// We have a construction to complete
			this.debug(`${miner.print} building ${this.constructionSite.print}`);
			miner.build(this.constructionSite);
			return true;
		} else if (!this.deposit) {
			// We likely don't have visibilty, just move to it
			if (!miner.pos.inRangeToPos(this.pos, 1) && miner.store.getFreeCapacity(RESOURCE_ENERGY) !== 0) {
				this.debug(`${miner.print} not in range, moving closer to ${this.pos}`);
				miner.goTo(this);
				return true;
			}
			log.error(`${miner.print} has no source??`);
			return true;
		}
		return false;
	}

	/**
	 * Actions for handling harvesting from the source(s)
	 *
	 * This will cause the miner to try and harvest from its mining site's source(s),
	 * potentially sending it to sleep after dropping off its last batch, or move it
	 * closer if it's still too far.
	 */
	private miningActions(miner: Zerg) {
		// Skip until we see the source, or the mined deposit has its container
		if (!this.deposit
			|| this.deposit instanceof Deposit && !this.container) return true;

		// We don't have space, and we're not allowed to drop
		if (miner.store.getFreeCapacity(RESOURCE_ENERGY) === 0) return false;

		// At this point the miner is in the room so we have vision of the source

		// Sleep until your source regens
		if (this.isSleeping(miner)) {
			this.debug(`${miner.print} sleeping for ${miner.memory.sleepUntil! - Game.time}`);
			return true;
		}

		// Handle harvesting and moving closer if that fails
		const result = miner.harvest(this.deposit);
		this.debug(`${miner.print} gathering from ${this.deposit.print}: ${result}`);

		// The insufficent resources takes precedence over the range check, so we have
		// to make sure we are in range before deciding what to do
		const inRange = miner.pos.inRangeTo(this.pos, 1);
		if (result === OK) {
			// All good!
		} else if (inRange && (result === ERR_NOT_ENOUGH_RESOURCES
				|| result === ERR_TIRED)) {
			// Do one last transfer before going to sleep so we're empty when resuming

			const ticksToRegen = this.deposit.cooldown;
			if (ticksToRegen > (miner.ticksToLive || Infinity)) {
				miner.retire();
			} else {
				this.debug(`${miner.print} sleeping for ${ticksToRegen}`);
				miner.memory.sleepUntil = Game.time + ticksToRegen;
			}

			this.debug(`${miner.print} doing a last transfer before going to sleep`);
			return this.handleTransfer(miner, true);
		} else if (result === ERR_NOT_IN_RANGE
			|| result === ERR_NOT_ENOUGH_RESOURCES && !miner.pos.inRangeTo(this.pos, 1)) {
			this.debug(`${miner.print} not actually in range, moving closer to ${this.deposit.print}`);
			return this.goToMiningSite(miner)
		} else if (result === ERR_NOT_OWNER && Game.time % 20 == 0) {
			log.alert(`${this.print} ${miner.print} room is reserved by hostiles!`);
		} else if (result === ERR_NO_BODYPART) {
			this.debug(`${miner.print} is not fit for duty, retiring`);
			miner.retire();
		} else {
			log.error(`${miner.print}: unhandled miner.harvest() exception: ${result}`);
		}
		// We return false here so that we attempt to transfer
		return false;
	}

	/**
	 * Handle post-harvest transfer actions
	 *
	 * This checks on the current storage of the miner (shortcircuiting if it's about to sleep
	 * so it doesn't keep energy around) and transfers it over to its preferred location.
	 */
	private handleTransfer(miner: Zerg, emptyOut?: boolean) {
		const overfilled = miner.store.energy > 0.9 * miner.store.getCapacity();
		if (!overfilled && !(emptyOut || miner.store.getUsedCapacity() === 0)) return false;
		// Check link first, then container, then drop-mining, so we favor better locations
		if (this.container && this.container.store.getFreeCapacity(RESOURCE_ENERGY) !== 0) {
			this.debug(`${miner.print} overfilled, dropping into ${this.container.print}`);
			miner.goTransfer(this.container);
			return true;
		}

		return false;
	}

	/**
	 * Actions for handling mining at RCL high enough to spawn ideal miner body to saturate source
	 */
	private dismantleActions(miner: Zerg): number {

		// Go to the room
		if (!miner.safelyInRoom(this.pos.roomName)) {
			return miner.goToRoom(this.pos.roomName);
		}

		// We're done if there are no dismantle positions left
		if (!this.dismantlePositions || this.dismantlePositions.length == 0) {
			log.info(`Miner dismantling completed in room ${miner.room.print}`);
			delete this.memory.dismantleNeeded;
			this.memory[DISMANTLE_CHECK] = getCacheExpiration(DISMANTLE_CHECK_FREQUENCY,
															  DISMANTLE_CHECK_FREQUENCY / 5);
			return OK;
		}

		// Find the first reachable position to dismantle stuff
		const dismantlePos = _.find(this.dismantlePositions,
									pos => Pathing.isReachable(miner.pos, pos,
															   _.filter(miner.room.structures, s => !s.isWalkable)));
		if (dismantlePos) {
			// Find the first blocking structure on the target position
			const dismantleTarget = _.find(dismantlePos.lookFor(LOOK_STRUCTURES),
										   s => !s.isWalkable && !(<OwnedStructure>s).my);
			// Dismantle it
			if (dismantleTarget) {
				if (dismantleTarget.hits > 1000 && Game.time % 10 == 0) {
					log.alert(`${miner.print} attempting to dismantle large structure!`);
				}
				return miner.goDismantle(dismantleTarget);
			} else {
				// Otherwise recalculate dismantle positions and call again to get next target
				this.dismantlePositions = this.getDismantlePositions();
				return this.dismantleActions(miner);
			}
		} else {
			log.warning(`No reachable dismantle positions for ${miner.print}!`);
		}
		return ERR_INVALID_TARGET;
	}

	/**
	 * Move onto harvesting position or near to source
	 */
	private goToMiningSite(miner: Zerg, avoidSK = true): boolean {
		let range = 1;
		let pos = this.pos;
		if (this.harvestPos && this.harvestPos.isWalkable()) {
			range = 0;
			pos = this.harvestPos;
		}
		if (!miner.pos.inRangeToPos(pos, range)) {
			miner.goTo(pos, {range: range, pathOpts: {avoidSK: avoidSK}});
			return true;
		}
		return false;
	}

	private isSleeping(miner: Zerg): boolean {
		if (miner.memory.sleepUntil) {
			if (Game.time >= miner.memory.sleepUntil) {
				delete miner.memory.sleepUntil;
				return false;
			}
			return true;
		}
		return false;
	}

	private handleMiner(miner: Zerg) {
		// Not ready for duty yet
		if (miner.spawning) {
			this.debug(`${miner.print} spawning`);
			return;
		}

		// Stay safe out there!
		if (miner.avoidDanger({timer: 10, dropEnergy: true})) {
			this.debug(`${miner.print} in danger!`);
			return;
		}

		// Mining site upgrade & repairs, or better positioning if out of room
		if (this.prepareActions(miner)) return;

		// Harvest and potentially sleep
		if (this.miningActions(miner)) return;

		// Transfer resources out to storage
		this.handleTransfer(miner);
	}

	run() {
		for (const miner of this.miners) {
			this.handleMiner(miner);
		}
		if (this.room && Game.time % BUILD_OUTPUT_FREQUENCY == 1) {
			this.addRemoveContainer();
		}
		if (Game.time % SUICIDE_CHECK_FREQUENCY == 0) {
			this.suicideOldMiners();
		}
	}
}
