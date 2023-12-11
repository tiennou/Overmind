import { errorForCode } from "utilities/errors";
import { $ } from "../../caching/GlobalCache";
import { log } from "../../console/log";
import { bodyCost, CreepSetup } from "../../creepSetups/CreepSetup";
import { Roles, Setups } from "../../creepSetups/setups";
import { DirectiveOutpost } from "../../directives/colony/outpost";
import { DirectiveHarvest } from "../../directives/resource/harvest";
import { Pathing } from "../../movement/Pathing";
import { OverlordPriority } from "../../priorities/priorities_overlords";
import { profile } from "../../profiler/decorator";
import {
	Cartographer,
	ROOMTYPE_SOURCEKEEPER,
} from "../../utilities/Cartographer";
import { getCacheExpiration, maxBy, minBy } from "../../utilities/utils";
import { Zerg } from "../../zerg/Zerg";
import { Overlord, OverlordMemory } from "../Overlord";
import {
	SUSPENSION_OVERFILL_DEFAULT_DURATION,
	SuspensionReason,
} from "utilities/suspension";
import { Colony } from "Colony";
import { insideBunkerBounds } from "roomPlanner/layouts/bunker";

export const StandardMinerSetupCost = bodyCost(
	Setups.drones.miners.standard.generateBody(Infinity)
);

export const DoubleMinerSetupCost = bodyCost(
	Setups.drones.miners.double.generateBody(Infinity)
);

const BUILD_OUTPUT_FREQUENCY = 15;
const SUICIDE_CHECK_FREQUENCY = 3;
const MINER_SUICIDE_THRESHOLD = 200;
const DISMANTLE_CHECK_FREQUENCY = 1500;

const DISMANTLE_CHECK = "dc";

interface MiningOverlordMemory extends OverlordMemory {
	[DISMANTLE_CHECK]?: number;
	dismantleNeeded?: boolean;
}

/**
 * Spawns miners to harvest from remote, owned, or sourcekeeper energy deposits. Standard mining actions have been
 * heavily CPU-optimized
 */
@profile
export class MiningOverlord extends Overlord {
	memory: MiningOverlordMemory;

	room: Room | undefined;
	distance: number;
	source: Source | undefined;
	secondSource: Source | undefined;
	/** Tracks whether we've lost to the second source miner */
	isDisabled: boolean;
	container: StructureContainer | undefined;
	link: StructureLink | undefined;
	constructionSite: ConstructionSite | undefined;
	harvestPos: RoomPosition | undefined;
	miners: Zerg[];
	energyPerTick: number;
	miningPowerNeeded: number;
	setup: CreepSetup;
	minersNeeded: number;
	allowDropMining: boolean;
	earlyMode: boolean;

	private dismantlePositions: RoomPosition[] | undefined;

	static settings = {
		minLinkDistance: 10,
		dropMineUntilRCL: 3,
	};

	constructor(directive: DirectiveHarvest, priority: number) {
		super(directive, "mine", priority);
		this.distance = directive.distanceFromPOI.terrainWeighted;

		this.priority +=
			this.outpostIndex * OverlordPriority.remoteRoom.roomIncrement;
		this.miners = this.zerg(Roles.drone);

		// Populate structures
		this.populateStructures();

		// Check if dismantling is needed
		if (
			this.memory.dismantleNeeded ||
			Game.time > (this.memory[DISMANTLE_CHECK] || 0)
		) {
			if (this.room) {
				const positions = this.getDismantlePositions();
				if (positions.length > 0) {
					this.memory.dismantleNeeded = true;
					this.dismantlePositions = positions;
				} else {
					this.memory[DISMANTLE_CHECK] = getCacheExpiration(
						DISMANTLE_CHECK_FREQUENCY,
						DISMANTLE_CHECK_FREQUENCY / 5
					);
				}
			}
		}

		// Compute energy output
		if (Cartographer.roomType(this.pos.roomName) == ROOMTYPE_SOURCEKEEPER) {
			this.energyPerTick =
				SOURCE_ENERGY_KEEPER_CAPACITY / ENERGY_REGEN_TIME;
		} else if (
			this.colony.level >=
			DirectiveOutpost.settings.canSpawnReserversAtRCL
		) {
			this.energyPerTick = SOURCE_ENERGY_CAPACITY / ENERGY_REGEN_TIME;
		} else {
			this.energyPerTick =
				SOURCE_ENERGY_NEUTRAL_CAPACITY / ENERGY_REGEN_TIME;
		}
		this.miningPowerNeeded =
			Math.ceil(this.energyPerTick / HARVEST_POWER) + 1;

		const canAffordStandardMiner =
			this.colony.room.energyCapacityAvailable >= StandardMinerSetupCost;
		const canAffordDoubleMiner =
			this.colony.room.energyCapacityAvailable >= DoubleMinerSetupCost;

		// Check if the colony is too small to support standard miners
		this.earlyMode = !canAffordStandardMiner;
		// Allow drop mining at low levels
		this.allowDropMining =
			this.colony.level < MiningOverlord.settings.dropMineUntilRCL;

		// Calculate optimal location for mining
		// We'll redisable below if there's a second source
		this.isDisabled = false;
		const secondSourcePos = this.canDoubleMine();
		if (!this.earlyMode && !this.allowDropMining) {
			if (canAffordDoubleMiner && secondSourcePos) {
				// Disable mining from the source with greater id
				if (this.source!.id > this.secondSource!.id) {
					this.isDisabled = true;
				}
				this.harvestPos = secondSourcePos;
			} else if (this.container) {
				this.harvestPos = this.container.pos;
			} else if (this.link) {
				this.harvestPos = _.find(
					this.link.pos.availableNeighbors(true),
					(pos) => pos.getRangeTo(this) == 1
				)!;
			} else {
				this.harvestPos = this.calculateContainerPos();
			}
		}

		this.debug(() => {
			return (
				`capacity: ${this.colony.room.energyCapacityAvailable}, standard: ${canAffordStandardMiner}, double: ${canAffordDoubleMiner}, ` +
				`early mode: ${this.earlyMode}, drop mining: ${this.allowDropMining}, ` +
				(this.canDoubleMine() ?
					`other source is mineable from ${
						this.canDoubleMine()!.print
					}, ${this.isDisabled ? "disabling" : "handling"}, `
				:	"") +
				`optimal harvest position: ${
					this.harvestPos ? this.harvestPos.print : undefined
				}`
			);
		});

		// Grab best miner setup
		if (Cartographer.roomType(this.pos.roomName) == ROOMTYPE_SOURCEKEEPER) {
			this.debug(`using sourceKeeper miner setup`);
			this.setup = Setups.drones.miners.sourceKeeper;
		} else if (this.earlyMode) {
			this.debug(`using early miner setup`);
			this.setup = Setups.drones.miners.default;
		} else if (this.secondSource && canAffordDoubleMiner) {
			this.debug(`using double miner setup`);
			this.setup = Setups.drones.miners.double;
		} else if (this.link) {
			if (this.colony.assets.energy >= 100000) {
				this.debug(`using link-optimized setup`);
				this.setup = Setups.drones.miners.linkOptimized;
			} else {
				this.debug(`using early miner (link?) setup`);
				this.setup = Setups.drones.miners.default;
			}
		} else {
			this.debug(`using standard miner setup`);
			// this.setup = Game.cpu.bucket < 9500 ? Setups.drones.miners.standardCPU : Setups.drones.miners.standard;
			this.setup = Setups.drones.miners.standard;
		}

		const miningPowerEach = this.setup.getBodyPotential(WORK, this.colony);
		this.minersNeeded = Math.min(
			Math.ceil(this.miningPowerNeeded / miningPowerEach),
			this.pos.availableNeighbors(true).length
		);
		this.minersNeeded = this.isDisabled ? 0 : this.minersNeeded;
	}

	/**
	 * Calculates if this source has another one very nearby that should be handled by the same miner
	 */
	private canDoubleMine() {
		if (this.secondSource) {
			return null;
		}
		const room = Game.rooms[this.pos.roomName];
		if (!room || !this.source) {
			return null;
		}

		const secondSource = _.find(
			this.source.pos.findInRange(FIND_SOURCES, 2),
			(source) => source.id != (this.source ? this.source.id : "")
		);
		if (!secondSource) {
			return null;
		}
		this.debug(
			`found other source 2 away from ${this.source.print}: ${secondSource?.print}`
		);
		// If its over 1 spot away, is there spot in between to mine?
		const myNeighbors = this.source.pos.availableNeighbors(true);
		const theirNeighbors = secondSource.pos.availableNeighbors(true);
		const miningPos = myNeighbors.find((pos) =>
			theirNeighbors.some((oPos) => pos.x === oPos.x && pos.y === oPos.y)
		);
		if (!miningPos) {
			this.debug(
				`Double mining found but there is no spot between ${this.source.print} and ${secondSource.print}`
			);
			return null;
		}

		// Grab the second source and store it
		this.secondSource = secondSource;
		return miningPos;
	}

	/**
	 * Checks if dismantling is needed in the operating room
	 */
	private getDismantlePositions(): RoomPosition[] {
		const dismantleStructures: Structure[] = [];
		if (this.room) {
			const targets = _.compact([
				this.source,
				this.secondSource,
				this.container,
				this.link,
			]) as RoomObject[];
			for (const target of targets) {
				// Add blocking structures
				const blockingStructure = this.findBlockingStructure(target);
				if (blockingStructure) {
					dismantleStructures.push(blockingStructure);
				}
				// Add unwalkable structures with low hits in 2 range
				for (const pos of target.pos.getPositionsInRange(
					2,
					false,
					false
				)) {
					const unwalkableStructure = _.find(
						pos.lookFor(LOOK_STRUCTURES),
						(s) => !s.isWalkable
					);
					if (
						unwalkableStructure &&
						!(<OwnedStructure>unwalkableStructure).my
					) {
						dismantleStructures.push(unwalkableStructure);
					}
				}
			}
			this.debug(
				`structures to dismantle: ${dismantleStructures.map(
					(s) => `${s.structureType} ${s.pos.print}`
				)}`
			);
		} else {
			log.error(
				`MiningOverlord.getDismantleStructures() called with no vision in room ${this.pos.roomName}!`
			);
		}
		return _.unique(_.map(dismantleStructures, (s) => s.pos));
	}

	/**
	 * Finds the structure which is blocking access to a source or controller
	 */
	private findBlockingStructure(target: RoomObject): Structure | undefined {
		if (!this.room) {
			return;
		}
		const pos = Pathing.findBlockingPos(
			this.colony.pos,
			target.pos,
			_.filter(this.room.structures, (s) => !s.isWalkable)
		);
		if (pos) {
			const structure = _.find(
				pos.lookFor(LOOK_STRUCTURES),
				(s) => !s.isWalkable
			);
			return (
				structure ||
				log.error(
					`${this.print}: no structure at blocking pos ${pos.print}!`
				)
			);
		}
	}

	private populateStructures() {
		if (Game.rooms[this.pos.roomName]) {
			this.source = _.first(this.pos.lookFor(LOOK_SOURCES));
			this.constructionSite = _.first(
				_.filter(
					this.pos.findInRange(FIND_MY_CONSTRUCTION_SITES, 2),
					(site) =>
						site.structureType == STRUCTURE_CONTAINER ||
						site.structureType == STRUCTURE_LINK
				)
			);
			this.container = this.pos.findClosestByLimitedRange(
				Game.rooms[this.pos.roomName].containers,
				1
			);
			this.link = this.pos.findClosestByLimitedRange(
				this.colony.availableLinks,
				2
			);
		}
	}

	get deactivationReasons(): Set<SuspensionReason> {
		const reasons = super.deactivationReasons;
		reasons.add(SuspensionReason.overfilled);
		return reasons;
	}

	refresh() {
		if (!this.room && Game.rooms[this.pos.roomName]) {
			// if you just gained vision of this room
			this.populateStructures();
		}
		super.refresh();
		// Refresh your references to the objects
		$.refresh(
			this,
			"source",
			"secondSource",
			"container",
			"link",
			"constructionSite"
		);

		if (this.colony.state.isOverfilled && !this.isSuspended) {
			log.alert(
				`${this.colony.print} overfilled, suspending ${this.print} for ${SUSPENSION_OVERFILL_DEFAULT_DURATION}`
			);
			this.suspend({
				reason: SuspensionReason.overfilled,
				duration: SUSPENSION_OVERFILL_DEFAULT_DURATION,
			});
		}
	}

	get isSuspended() {
		return super.isSuspended || this.isDisabled;
	}

	static calculateContainerPos(
		source: RoomPosition,
		dropoffLocation?: RoomPosition,
		colony?: Colony
	): RoomPosition {
		// log.debug(`Computing container position for mining overlord at ${source.print}...`);

		if (dropoffLocation && source.isVisible) {
			const neighbors = source.neighbors;

			// We calculate positions that would conflict with our own preferred position
			const obstacles: RoomPosition[] = [];
			for (const pos of neighbors) {
				if (
					colony &&
					colony.pos.roomName === pos.roomName &&
					insideBunkerBounds(pos, colony)
				) {
					continue;
				}

				const structures = pos
					.lookFor(LOOK_STRUCTURES)
					.filter((s) => !s.isWalkable);
				for (const struct of structures) {
					const structNeighbors = struct.pos.availableNeighbors(true);

					const sharedNeighbors = structNeighbors.filter(
						(structNeighbor) => {
							return neighbors.some((neighborPos) =>
								neighborPos.isEqualTo(structNeighbor)
							);
						}
					);

					// Only consider the neighboring structure if it would have that one path out
					if (sharedNeighbors.length === structNeighbors.length) {
						obstacles.push(...sharedNeighbors);
					}
				}
			}

			const path = Pathing.findShortestPath(source, dropoffLocation, {
				obstacles: obstacles,
			}).path;
			const pos = _.find(path, (pos) => pos.getRangeTo(source) == 1);
			if (pos) {
				return pos;
			}
		}

		log.warning(
			`Last resort container position calculation for ${source.print}!`
		);
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
		return MiningOverlord.calculateContainerPos(this.pos, dropoff);
	}

	/**
	 * Add or remove containers as needed to keep exactly one of container | link
	 */
	private addRemoveContainer(): void {
		if (this.allowDropMining) {
			return; // only build containers in reserved, owned, or SK rooms
		}
		// Create container if there is not already one being built and no link
		if (!this.container && !this.constructionSite && !this.link) {
			const containerPos = this.calculateContainerPos();
			if (!containerPos) {
				log.error(
					`${this.print}: can't build container at ${this.room}`
				);
				return;
			}
			const container =
				containerPos ?
					containerPos.lookForStructure(STRUCTURE_CONTAINER)
				:	undefined;
			if (container) {
				log.warning(
					`${this.print}: this.container out of sync at ${containerPos.print}`
				);
				this.container = container;
				return;
			}
			log.info(
				`${this.print}: building container at ${containerPos.print}`
			);
			const result =
				containerPos.createConstructionSite(STRUCTURE_CONTAINER);
			if (result != OK) {
				log.error(
					`${this.print}: cannot build container at ${
						containerPos.print
					}: ${errorForCode(result)}`
				);
			}
			return;
		}
		// Destroy container if link is nearby
		if (this.container && this.link) {
			// safety checks
			if (
				this.colony.hatchery &&
				this.container.pos.getRangeTo(this.colony.hatchery) > 2 &&
				this.container.pos.getRangeTo(this.colony.upgradeSite) > 3
			) {
				log.info(
					`${this.print}: container and link present; destroying container at ${this.container.pos.print}`
				);
				this.container.destroy();
			}
		}
	}

	private registerEnergyRequests(): void {
		if (this.container) {
			const transportCapacity = 200 * this.colony.level;
			const threshold = this.colony.storage ? 0.8 : 0.5;
			if (
				this.container.store.getUsedCapacity() >
				threshold * transportCapacity
			) {
				this.colony.logisticsNetwork.requestOutput(this.container, {
					resourceType: "all",
					dAmountdt: this.energyPerTick,
				});
			}
		}
		if (this.link) {
			// If the link will be full with next deposit from the miner
			const minerCapacity = Math.min(
				...this.miners.map((miner) => miner.store.getCapacity())
			);
			if (
				this.link.store.getUsedCapacity(RESOURCE_ENERGY) +
					minerCapacity >
				this.link.store.getCapacity(RESOURCE_ENERGY)
			) {
				this.colony.linkNetwork.requestTransmit(this.link);
			}
		}
	}

	init() {
		this.wishlist(this.minersNeeded, this.setup);
		this.registerEnergyRequests();
	}

	/**
	 * Suicide outdated miners when their replacements arrive
	 */
	private suicideOldMiners(): boolean {
		if (this.miners.length > this.minersNeeded && this.source) {
			// if you have multiple miners and the source is visible
			const targetPos = this.harvestPos || this.source.pos;
			const minersNearSource = _.filter(
				this.miners,
				(miner) =>
					miner.pos.getRangeTo(targetPos) <= SUICIDE_CHECK_FREQUENCY
			);
			if (minersNearSource.length > this.minersNeeded) {
				// if you have more miners by the source than you need
				const oldestMiner = minBy(
					minersNearSource,
					(miner) => miner.ticksToLive || 9999
				);
				if (
					oldestMiner &&
					(oldestMiner.ticksToLive || 9999) < MINER_SUICIDE_THRESHOLD
				) {
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
		} else if (
			this.container &&
			this.container.hits < this.container.hitsMax &&
			miner.store.energy >=
				Math.min(
					miner.store.getCapacity(),
					REPAIR_POWER * miner.getActiveBodyparts(WORK)
				)
		) {
			// Mining container hitpoints are low
			this.debug(`${miner.print} repairing ${this.container.print}`);
			miner.repair(this.container);
			return true;
		} else if (
			this.constructionSite &&
			miner.store.energy >=
				Math.min(
					miner.store.getCapacity(),
					BUILD_POWER * miner.getActiveBodyparts(WORK)
				)
		) {
			// We have a construction to complete
			this.debug(
				`${miner.print} building ${this.constructionSite.print}`
			);
			miner.build(this.constructionSite);
			return true;
		} else if (!this.source) {
			// We likely don't have visibilty, just move to it
			if (
				!miner.pos.inRangeToPos(this.pos, 1) &&
				miner.store.getFreeCapacity(RESOURCE_ENERGY) !== 0
			) {
				this.debug(
					`${miner.print} not in range, moving closer to ${this.pos}`
				);
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
		if (!this.source) {
			return true;
		}
		// At this point the miner is in the room so we have vision of the source

		// Sleep until your source regens
		if (this.isSleeping(miner)) {
			this.debug(
				`${miner.print} sleeping for ${
					miner.memory.sleepUntil! - Game.time
				}`
			);
			return true;
		}

		// Handle harvesting and moving closer if that fails
		let result: number = OK;
		if (this.secondSource) {
			// We're mining two sources
			if (this.source && this.source.energy > 0) {
				result = miner.harvest(this.source);
			} else if (this.secondSource.energy > 0) {
				result = miner.harvest(this.secondSource);
			}
		} else {
			result = miner.harvest(this.source);
		}
		this.debug(
			`${miner.print} harvesting from ${this.source.print}: ${result}`
		);

		// The insufficent resources takes precedence over the range check, so we have
		// to make sure we are in range before deciding what to do
		const inRange = miner.pos.inRangeTo(this.pos, 1);
		if (result === OK) {
			// All good!
		} else if (result === ERR_NOT_ENOUGH_RESOURCES && inRange) {
			// Do one last transfer before going to sleep so we're empty when resuming

			const ticksToRegen = Math.min(
				this.source.ticksToRegeneration,
				this.secondSource?.ticksToRegeneration ??
					this.source.ticksToRegeneration
			);
			if (ticksToRegen > (miner.ticksToLive || Infinity)) {
				miner.retire();
			} else {
				this.debug(`${miner.print} sleeping for ${ticksToRegen}`);
				miner.memory.sleepUntil = Game.time + ticksToRegen;
			}

			this.debug(
				`${miner.print} doing a last transfer before going to sleep`
			);
			return this.handleTransfer(miner, true);
		} else if (
			result === ERR_NOT_IN_RANGE ||
			(result === ERR_NOT_ENOUGH_RESOURCES &&
				!miner.pos.inRangeTo(this.pos, 1))
		) {
			this.debug(
				`${miner.print} not actually in range, moving closer to ${this.source.print}`
			);
			return this.goToMiningSite(miner);
		} else if (result === ERR_NOT_OWNER && Game.time % 20 == 0) {
			log.alert(
				`${this.print} ${miner.print} room is reserved by hostiles!`
			);
		} else if (result === ERR_NO_BODYPART) {
			this.debug(`${miner.print} is not fit for duty, retiring`);
			miner.retire();
		} else {
			log.error(
				`${miner.print}: unhandled miner.harvest() exception: ${result}`
			);
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
		if (!overfilled && !(emptyOut || miner.store.energy === 0)) {
			return false;
		}
		const commandCenterLink = this.colony.commandCenter?.link ?? undefined;
		// Check link first, then container, then drop-mining, so we favor better locations
		if (this.link && commandCenterLink) {
			this.debug(
				`${miner.print} overfilled, dropping into ${this.link.print}`
			);
			miner.goTransfer(this.link, RESOURCE_ENERGY);
			return true;
		} else if (
			this.container &&
			this.container.store.getFreeCapacity(RESOURCE_ENERGY) !== 0
		) {
			this.debug(
				`${miner.print} overfilled, dropping into ${this.container.print}`
			);
			miner.goTransfer(this.container);
			return true;
		} else if (this.allowDropMining) {
			// try to drop on top of largest drop if full, otherwise drop where we are
			const biggestDrop = maxBy(
				miner.pos.findInRange(miner.room.droppedEnergy, 1),
				(drop) => drop.amount
			);
			if (biggestDrop) {
				this.debug(
					`${miner.print} overfilled and allowed to drop-mine onto ${biggestDrop?.print}`
				);
				miner.goDrop(biggestDrop.pos, RESOURCE_ENERGY);
			} else {
				this.debug(
					`${miner.print} overfilled and allowed to drop-mine onto ${miner.pos.print}`
				);
				miner.drop(RESOURCE_ENERGY);
			}
			return true;
		}

		// Just drop it on the ground as a last resort
		this.debug(`${miner.print} overfilled but no drop location ready!`);
		miner.drop(RESOURCE_ENERGY);
		return true;
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
			this.memory[DISMANTLE_CHECK] = getCacheExpiration(
				DISMANTLE_CHECK_FREQUENCY,
				DISMANTLE_CHECK_FREQUENCY / 5
			);
			return OK;
		}

		// Find the first reachable position to dismantle stuff
		const dismantlePos = _.find(this.dismantlePositions, (pos) =>
			Pathing.isReachable(
				miner.pos,
				pos,
				_.filter(miner.room.structures, (s) => !s.isWalkable)
			)
		);
		if (dismantlePos) {
			// Find the first blocking structure on the target position
			const dismantleTarget = _.find(
				dismantlePos.lookFor(LOOK_STRUCTURES),
				(s) => !s.isWalkable && !(<OwnedStructure>s).my
			);
			// Dismantle it
			if (dismantleTarget) {
				if (dismantleTarget.hits > 1000 && Game.time % 10 == 0) {
					log.alert(
						`${miner.print} attempting to dismantle large structure!`
					);
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
		if (this.earlyMode) {
			if (!miner.pos.inRangeToPos(this.pos, 1)) {
				// We can't use harvestPos here because miners will push
				// each other around and waste CPU
				miner.goTo(this);
				return true;
			}
			return false;
		}

		let range = 1;
		let pos = this.pos;
		if (this.harvestPos && this.harvestPos.isWalkable()) {
			range = 0;
			pos = this.harvestPos;
		}
		if (!miner.pos.inRangeToPos(pos, range)) {
			miner.goTo(pos, { range: range, pathOpts: { avoidSK: avoidSK } });
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
		// Mining site upgrade & repairs, or better positioning if out of room
		if (this.prepareActions(miner)) {
			return;
		}

		// Harvest and potentially sleep
		if (this.miningActions(miner)) {
			return;
		}

		// Transfer resources out to storage
		this.handleTransfer(miner);
	}

	run() {
		this.autoRun(
			this.miners,
			(miner) => this.handleMiner(miner),
			(miner) => miner.avoidDanger({ timer: 10, dropEnergy: true })
		);

		if (this.room && Game.time % BUILD_OUTPUT_FREQUENCY == 1) {
			this.addRemoveContainer();
		}
		if (Game.time % SUICIDE_CHECK_FREQUENCY == 0) {
			this.suicideOldMiners();
		}
	}
}
