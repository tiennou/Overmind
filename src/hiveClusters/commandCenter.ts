import { Roles } from "creepSetups/setups";
import { $ } from "../caching/GlobalCache";
import { Colony, EnergyUse } from "../Colony";
import { log } from "../console/log";
import { TraderJoe } from "../logistics/TradeNetwork";
import { TransportRequestGroup } from "../logistics/TransportRequestGroup";
import { Mem } from "../memory/Memory";
import { CommandCenterOverlord } from "../overlords/core/manager";
import { Priority } from "../priorities/priorities";
import { profile } from "../profiler/decorator";
import { Cartographer } from "../utilities/Cartographer";
import { Visualizer } from "../visuals/Visualizer";
import { HiveCluster } from "./_HiveCluster";
import { TRANSPORT_MEM } from "overlords/core/transporter";
import { derefRoomPosition, entries } from "utilities/utils";
import { ResourceManager } from "logistics/ResourceManager";
import { errorForCode } from "utilities/errors";

export const MAX_OBSERVE_DISTANCE = 4;

export interface CommandCenterMemory {
	debug?: boolean;
	idlePos?: ProtoPos;
}

/**
 * The command center groups the high-level structures at the core of the bunker together, including storage, terminal,
 * link, power spawn, observer, and nuker.
 */
@profile
export class CommandCenter extends HiveCluster {
	memory: CommandCenterMemory;
	storage: StructureStorage; // The colony storage, also the instantiation object
	link: StructureLink | undefined; // Link closest to storage
	terminal: StructureTerminal | undefined; // The colony terminal
	towers: StructureTower[]; // Towers within range 3 of storage are part of cmdCenter
	powerSpawn: StructurePowerSpawn | undefined; // Colony Power Spawn
	nuker: StructureNuker | undefined; // Colony nuker
	observer: StructureObserver | undefined; // Colony observer
	transportRequests: TransportRequestGroup; // Box for energy requests

	private observeRoom: string | undefined;
	private _idlePos: RoomPosition; // Cached idle position

	static settings = {
		enableIdleObservation: true,
		linksTransmitAt: LINK_CAPACITY - 100,
		refillTowersBelow: 750,
	};

	constructor(colony: Colony, storage: StructureStorage) {
		super(colony, storage, "commandCenter");
		this.memory = Mem.wrap(this.colony.memory, "commandCenter");
		// Register physical components
		this.storage = storage;
		this.terminal = colony.terminal;
		this.powerSpawn = colony.powerSpawn;
		this.nuker = colony.nuker;
		this.observer = colony.observer;
		if (this.colony.bunker) {
			this.link = this.colony.bunker.anchor.findClosestByLimitedRange(
				colony.availableLinks,
				1
			);
			this.colony.linkNetwork.claimLink(this.link);
			this.towers = this.colony.bunker.anchor.findInRange(
				colony.towers,
				1
			);
		} else {
			this.link = this.pos.findClosestByLimitedRange(
				colony.availableLinks,
				2
			);
			this.colony.linkNetwork.claimLink(this.link);
			this.towers = this.pos.findInRange(colony.towers, 3);
		}
		this.transportRequests = new TransportRequestGroup("commandCenter"); // commandCenter always gets its own request group
	}

	refresh() {
		this.memory = Mem.wrap(this.colony.memory, "commandCenter");
		$.refreshRoom(this);
		$.refresh(
			this,
			"storage",
			"terminal",
			"powerSpawn",
			"nuker",
			"observer",
			"link",
			"towers"
		);
		this.transportRequests.refresh();
	}

	spawnMoarOverlords() {
		if (this.link || this.terminal) {
			this.overlord = new CommandCenterOverlord(this);
		}
	}

	// Idle position
	get idlePos(): RoomPosition {
		if (this.colony.bunker) {
			return this.colony.bunker.anchor;
		}
		if (!this.memory.idlePos || Game.time % 25 == 0) {
			this.memory.idlePos = this.findIdlePos();
		}
		return derefRoomPosition(this.memory.idlePos);
	}

	/* Find the best idle position */
	private findIdlePos(): RoomPosition {
		// Try to match as many other structures as possible
		const proximateStructures: Structure[] = _.compact([
			this.link!,
			this.terminal!,
			this.powerSpawn!,
			this.nuker!,
			...this.towers,
		]);
		const numNearbyStructures = (pos: RoomPosition) =>
			_.filter(
				proximateStructures,
				(s) => s.pos.isNearTo(pos) && !s.pos.isEqualTo(pos)
			).length;
		return _.last(
			_.sortBy(this.storage.pos.neighbors, (pos) =>
				numNearbyStructures(pos)
			)
		);
	}

	/* Register a link transfer store if the link is sufficiently full */
	private registerLinkTransferRequests(): void {
		if (this.link) {
			if (this.link.energy > CommandCenter.settings.linksTransmitAt) {
				this.colony.linkNetwork.requestTransmit(this.link);
			}
		}
	}

	private registerRequests(): void {
		// Refill core spawn (only applicable to bunker layouts)
		if (this.colony.bunker && this.colony.bunker.coreSpawn) {
			if (
				this.colony.bunker.coreSpawn.store[RESOURCE_ENERGY] <
				this.colony.bunker.coreSpawn.store.getCapacity(RESOURCE_ENERGY)
			) {
				this.transportRequests.requestInput(
					this.colony.bunker.coreSpawn,
					Priority.Normal
				);
			}
		}

		// If the link has energy and nothing needs it, empty it
		if (this.link && this.link.store[RESOURCE_ENERGY] > 0) {
			if (
				this.colony.linkNetwork.receive.length == 0 ||
				this.link.cooldown > 3
			) {
				this.transportRequests.requestOutput(this.link, Priority.High);
			}
		}

		this.balanceStorageAndTerminal();

		// Nothing else should request if you're trying to start a room back up again
		if (this.colony.state.bootstrapping) {
			return;
		}

		// Supply requests:

		// If the link is empty and can send energy and something needs energy, fill it up
		if (
			this.link &&
			this.link.store[RESOURCE_ENERGY] <
				0.9 * this.link.store.getCapacity(RESOURCE_ENERGY) &&
			this.link.cooldown <= 1
		) {
			if (this.colony.linkNetwork.receive.length > 0) {
				// If something wants energy
				this.transportRequests.requestInput(
					this.link,
					Priority.Critical
				);
			}
		}
		// Refill towers as needed with variable priority
		const refillTowers = _.filter(
			this.towers,
			(tower) => tower.energy < CommandCenter.settings.refillTowersBelow
		);
		_.forEach(refillTowers, (tower) =>
			this.transportRequests.requestInput(tower, Priority.High)
		);

		// Refill power spawn
		if (this.powerSpawn) {
			if (
				this.powerSpawn.store[RESOURCE_ENERGY] <
				this.powerSpawn.store.getCapacity(RESOURCE_ENERGY) * 0.5
			) {
				this.transportRequests.requestInput(
					this.powerSpawn,
					Priority.NormalLow
				);
			} else if (
				this.powerSpawn.store[RESOURCE_POWER] <
					this.powerSpawn.store.getCapacity(RESOURCE_POWER) * 0.5 &&
				this.terminal &&
				this.terminal.store[RESOURCE_POWER] >= 100
			) {
				this.transportRequests.requestInput(
					this.powerSpawn,
					Priority.NormalLow,
					{ resourceType: RESOURCE_POWER }
				);
			}
		}
		// Refill nuker with low priority
		if (this.nuker) {
			if (
				this.nuker.store[RESOURCE_ENERGY] <
					this.nuker.store.getCapacity(RESOURCE_ENERGY) &&
				((this.storage.energy > 200000 &&
					this.nuker.cooldown <= 1000) ||
					this.storage.energy > 800000)
			) {
				this.transportRequests.requestInput(this.nuker, Priority.Low);
			}
			if (
				this.nuker.store[RESOURCE_GHODIUM] <
					this.nuker.store.getCapacity(RESOURCE_GHODIUM) &&
				this.colony.assets[RESOURCE_GHODIUM] >= LAB_MINERAL_CAPACITY
			) {
				this.transportRequests.requestInput(this.nuker, Priority.Low, {
					resourceType: RESOURCE_GHODIUM,
				});
			}
		}

		if (this.storage && this.terminal) {
			if (
				this.storage.store[RESOURCE_OPS] < 3000 &&
				this.terminal.store[RESOURCE_OPS] > 100
			) {
				this.transportRequests.requestInput(
					this.storage,
					Priority.Normal,
					{ resourceType: RESOURCE_OPS }
				);
			}
		}
	}

	/**
	 * Move energy into terminal if storage is too full and into storage if storage is too empty
	 */
	private balanceStorageAndTerminal(): boolean {
		this.debug("balancing storage and terminal");
		if (!this.storage || !this.terminal) {
			return false;
		}

		const roomSellOrders = Overmind.tradeNetwork.getExistingOrders(
			ORDER_SELL,
			"any",
			this.colony.name
		);

		for (const [resource, amount] of entries(this.colony.assets)) {
			// Get target and tolerance for the resource and skip if you don't care about it or have none of it
			const thresholds = ResourceManager.getBalancedThresholdForResource(
				this.colony,
				resource
			);
			if (amount <= 0 || !thresholds) {
				this.debug(() =>
					this.colony.assets[resource] <= 0 ?
						`no storage of ${resource}, ignoring`
					:	`no threshold for ${resource}, ignoring`
				);
				continue;
			}

			let { target, tolerance } = thresholds;

			// If you're selling this resource from this room, keep a bunch of it in the terminal
			if (roomSellOrders.length > 0) {
				const sellOrderForResource = _.find(
					roomSellOrders,
					(order) => order.resourceType == resource
				);
				if (sellOrderForResource) {
					target = Math.max(
						target,
						sellOrderForResource.remainingAmount
					);
				}
			}

			// Special case when we're rebuilding the terminal: we want to safe-guard a lot of energy into the storage
			const isRebuildingTerminal =
				this.colony.state.isRebuilding && resource === RESOURCE_ENERGY;

			this.debug(
				`resource ${resource}, target: ${target}, tolerance: ${tolerance}, terminal: ${this.terminal.store[resource]}, storage: ${this.storage.store[resource]}`
			);

			// Move stuff from terminal into storage
			if (
				this.terminal.store[resource] > target + tolerance ||
				(isRebuildingTerminal &&
					this.storage.store[resource] >
						ResourceManager.settings
							.minimumEnergyTerminalRebuilding)
			) {
				const transferAmount = Math.min(
					this.terminal.store[resource] - target,
					this.storage.store.getFreeCapacity(resource)
				);
				this.debug(
					`Moving ${transferAmount} of ${resource} from terminal${
						isRebuildingTerminal ? " (rebuilding" : ""
					}`
				);
				const priority =
					isRebuildingTerminal ? Priority.Critical : Priority.Low;
				this.transportRequests.requestOutput(this.terminal, priority, {
					resourceType: resource,
					amount: transferAmount,
				});
				this.transportRequests.requestInput(this.storage, priority, {
					resourceType: resource,
					amount: transferAmount,
				});
			}

			// Move stuff from storage into terminal
			if (
				this.terminal.store[resource] < target - tolerance &&
				this.storage.store[resource] > 0 &&
				!isRebuildingTerminal
			) {
				const transferAmount = Math.min(
					target - this.terminal.store[resource],
					this.storage.store[resource]
				);
				this.debug(
					`Moving ${transferAmount} of ${resource} from storage`
				);
				this.transportRequests.requestOutput(
					this.storage,
					Priority.Low,
					{ resourceType: resource, amount: transferAmount }
				);
				this.transportRequests.requestInput(
					this.terminal,
					Priority.Low,
					{ resourceType: resource, amount: transferAmount }
				);
			}
		}

		// Nothing has happened
		return false;
	}

	requestRoomObservation(roomName: string) {
		log.info(`${this.print} request to observe ${roomName}`);
		this.observeRoom = roomName;
	}

	private runObserver(): void {
		if (this.observer) {
			if (this.observeRoom) {
				const result = this.observer.observeRoom(this.observeRoom);
				log.info(
					`${this.print} observing ${
						this.observeRoom
					}: ${errorForCode(result)}`
				);
				this.observeRoom = undefined;
			} else if (
				CommandCenter.settings.enableIdleObservation &&
				Game.time % 1000 < 100
			) {
				const axisLength = MAX_OBSERVE_DISTANCE * 2 + 1;
				const dx = (Game.time % axisLength) - MAX_OBSERVE_DISTANCE;
				const dy =
					Math.floor((Game.time % axisLength ** 2) / axisLength) -
					MAX_OBSERVE_DISTANCE;
				if (dx == 0 && dy == 0) {
					return;
				}
				const roomToObserve = Cartographer.findRelativeRoomName(
					this.pos.roomName,
					dx,
					dy
				);
				// // TODO OBSERVER FIX ONLY LOOK AT southwest corner
				// const dx = Game.time % MAX_OBSERVE_DISTANCE;
				// const dy = Game.time % (MAX_OBSERVE_DISTANCE ** 2);
				// const roomToObserve = Cartographer.findRelativeRoomName(this.pos.roomName, dx, dy);
				const result = this.observer.observeRoom(roomToObserve);
				log.info(
					`${
						this.print
					} observing ${roomToObserve} (idle): ${errorForCode(
						result
					)}`
				);
			}
		}
	}

	private runPowerSpawn() {
		if (
			this.powerSpawn &&
			this.storage &&
			this.colony.assets.energy > 300000 &&
			this.powerSpawn.store.energy >= 50 &&
			this.powerSpawn.store.power > 0
		) {
			if (
				Game.market.credits <
				TraderJoe.settings.market.credits.canBuyAbove
			) {
				// We need to get enough credits that we can start to buy things. Since mineral prices have plunged
				// recently, often the only way to do this without net losing credits (after factoring in the
				// energy -> credits of transaction costs) is to sell excess energy. Power processing eats up a
				// huge amount of energy, so we're going to disable it below a certain threshold.
				return;
			}
			if (Game.time % 20 == 0) {
				log.info(`Processing power in ${this.room.print}`);
			}
			const res = this.powerSpawn.processPower();
			if (res === OK) {
				this.colony.trackEnergyUse(EnergyUse.POWER_SPAWN, -50);
			}
		}
	}

	// Initialization and operation ====================================================================================

	init(): void {
		this.registerLinkTransferRequests();
		this.registerRequests();
	}

	run(): void {
		if (this.memory.debug) {
			this.transportRequests.summarize();
		}
		this.runObserver();
		this.runPowerSpawn();
	}

	visuals(coord: Coord): Coord {
		let { x, y } = coord;
		const height = this.storage && this.terminal ? 5 : 4;
		const titleCoords = Visualizer.section(
			`${this.colony.name} Command Center`,
			{ x, y, roomName: this.room.name },
			9.5,
			height + 0.1
		);
		const boxX = titleCoords.x;
		y = titleCoords.y + 0.25;

		const c = this.colony;
		const assetStructures = _.compact([
			c.storage,
			c.terminal,
			c.factory,
			...c.labs,
		]);
		const assetCreeps = [
			...c.getCreepsByRole(Roles.queen),
			...c.getCreepsByRole(Roles.manager),
		];
		const assetStores = _.map(
			[...assetStructures, ...assetCreeps],
			(thing) => thing!.store
		);

		const used = _.sum(assetStores, (s) =>
			s.getUsedCapacity(RESOURCE_ENERGY)
		);
		const capacity = _.sum(assetStores, (s) =>
			s.getCapacity(RESOURCE_ENERGY)
		);

		const fmt = (num: number) => `${Math.floor(num / 1000)}K`;
		Visualizer.text("Energy", { x: boxX, y: y, roomName: this.room.name });
		Visualizer.barGraph(
			[used, capacity],
			{ x: boxX + 4, y: y, roomName: this.room.name },
			5,
			undefined,
			fmt
		);
		y += 1;

		Visualizer.text("Mined", {
			x: boxX,
			y: y,
			roomName: this.room.name,
		});
		const energyPerTick = this.colony.energyMinedPerTick.toFixed(3);
		Visualizer.text(`${energyPerTick} e/t`, {
			x: boxX + 4,
			y,
			roomName: this.room.name,
		});
		y += 1;

		if (this.storage) {
			Visualizer.text("Storage", {
				x: boxX,
				y: y,
				roomName: this.room.name,
			});
			Visualizer.barGraph(
				this.storage.store.getUsedCapacity() /
					this.storage.store.getCapacity(),
				{ x: boxX + 4, y: y, roomName: this.room.name },
				5
			);
			y += 1;
		}
		if (this.terminal) {
			Visualizer.text("Terminal", {
				x: boxX,
				y: y,
				roomName: this.room.name,
			});
			Visualizer.barGraph(
				this.terminal.store.getUsedCapacity() /
					this.terminal.store.getCapacity(),
				{ x: boxX + 4, y: y, roomName: this.room.name },
				5
			);
			y += 1;
		}

		Visualizer.text("Logistics", {
			x: boxX,
			y: y,
			roomName: this.room.name,
		});
		Visualizer.barGraph(
			this.colony.overlords.logistics.memory[TRANSPORT_MEM.DOWNTIME],
			{ x: boxX + 4, y: y, roomName: this.room.name },
			5
		);
		y += 1;

		return { x: x, y: y + 0.25 };
	}
}
