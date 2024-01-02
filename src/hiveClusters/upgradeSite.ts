import { Visualizer } from "visuals/Visualizer";
import { $ } from "../caching/GlobalCache";
import { Colony } from "../Colony";
import { log } from "../console/log";
import { Mem } from "../memory/Memory";
import { UpgradingOverlord } from "../overlords/core/upgrader";
import { profile } from "../profiler/decorator";
import { Stats } from "../stats/stats";
import { hasMinerals } from "../utilities/utils";
import { HiveCluster } from "./_HiveCluster";
import { errorForCode } from "utilities/errors";
import { insideBunkerBounds } from "roomPlanner/layouts/bunker";

interface UpgradeSiteMemory {
	stats: { downtime: number };
	speedFactor?: number; // Multiplier on upgrade parts for fast growth
}

const getDefaultUpgradeSiteMemory: () => UpgradeSiteMemory = () => ({
	stats: { downtime: 0 },
	speedFactor: undefined,
});

/**
 * Upgrade sites group upgrade-related structures around a controller, such as an input link and energy container
 */
@profile
export class UpgradeSite extends HiveCluster {
	memory: UpgradeSiteMemory;
	controller: StructureController; // The controller for the site
	upgradePowerNeeded: number;
	link: StructureLink | undefined; // The primary object receiving energy for the site
	battery: StructureContainer | undefined; // The container to provide an energy buffer
	batteryPos: RoomPosition | undefined;
	overlord: UpgradingOverlord;
	// energyPerTick: number;

	static settings = {
		/** Number of upgrader parts scales with energy minus this value */
		energyBuffer: 100000,
		/**
		 * Scaling factor: this much excess energy adds one extra body repetition
		 * TODO: scaling needs to increase with new storage/terminal system
		 */
		energyPerBodyUnit: 20000,
		/** Required distance to build link */
		minLinkDistance: 10,
		/** Links request energy when less than this amount */
		linksRequestBelow: 200,
	};

	constructor(colony: Colony, controller: StructureController) {
		super(colony, controller, "upgradeSite");
		this.controller = controller;
		this.memory = Mem.wrap(
			this.colony.memory,
			"upgradeSite",
			getDefaultUpgradeSiteMemory
		);
		this.upgradePowerNeeded = this.getUpgradePowerNeeded();
		// Register bettery
		$.set(this, "battery", () => {
			// only count containers that aren't near sources
			const allowableContainers = _.filter(
				this.room.containers,
				(container) =>
					container.pos.findInRange(FIND_SOURCES, 1).length == 0
			);
			return this.pos.findClosestByLimitedRange(allowableContainers, 3);
		});
		this.batteryPos = $.pos(this, "batteryPos", () => {
			if (this.battery) {
				return this.battery.pos;
			}
			const inputSite = this.findInputConstructionSite();
			if (inputSite) {
				return inputSite.pos;
			}
			return (
				this.calculateBatteryPos() ||
				log.alert(`Upgrade site at ${this.pos.print}: no batteryPos!`)
			);
		});
		if (this.batteryPos) {
			this.colony.markDestination(this.pos, 0);
		}
		// Register link
		$.set(this, "link", () =>
			this.pos.findClosestByLimitedRange(colony.availableLinks, 3)
		);
		this.colony.linkNetwork.claimLink(this.link);
		// // Energy per tick is sum of upgrader body parts and nearby worker body parts
		// this.energyPerTick = $.number(this, 'energyPerTick', () =>
		// 	_.sum(this.overlord.upgraders, upgrader => upgrader.getActiveBodyparts(WORK)) +
		// 	_.sum(_.filter(this.colony.getCreepsByRole(WorkerSetup.role), worker =>
		// 			  worker.pos.inRangeTo((this.link || this.battery || this).pos, 2)),
		// 		  worker => worker.getActiveBodyparts(WORK)));
		// Compute stats
		this.stats();
	}

	refresh() {
		this.memory = Mem.wrap(this.colony.memory, "upgradeSite");
		$.refreshRoom(this);
		$.refresh(this, "controller", "battery", "link");
	}

	spawnMoarOverlords() {
		// Register overlord
		this.overlord = new UpgradingOverlord(this);
	}

	findInputConstructionSite(): ConstructionSite | undefined {
		const nearbyInputSites = this.pos.findInRange(
			this.room.constructionSites,
			4,
			{
				filter: (s: ConstructionSite) =>
					s.structureType == STRUCTURE_CONTAINER ||
					s.structureType == STRUCTURE_LINK,
			}
		);
		return _.first(nearbyInputSites);
	}

	private getUpgradePowerNeeded(): number {
		return $.number(this, "upgradePowerNeeded", () => {
			// Workers perform upgrading until storage is set up
			if (!this.room.storage) {
				return 0;
			}

			const amountOver = Math.max(
				this.colony.assets.energy - UpgradeSite.settings.energyBuffer,
				0
			);
			let upgradePower =
				1 +
				Math.floor(amountOver / UpgradeSite.settings.energyPerBodyUnit);
			if (this.memory.speedFactor !== undefined) {
				upgradePower *= this.memory.speedFactor;
			} else if (amountOver > 800000) {
				upgradePower *= 4; // double upgrade power if we have lots of surplus energy
			} else if (amountOver > 500000) {
				upgradePower *= 2;
			}
			return upgradePower;
		});
	}

	init(): void {
		// Register energy requests
		if (
			this.link &&
			this.link.store[RESOURCE_ENERGY] <
				UpgradeSite.settings.linksRequestBelow
		) {
			this.colony.linkNetwork.requestReceive(this.link);
		}
		const inThreshold = this.colony.storage ? 0.5 : 0.75;
		if (this.battery) {
			if (
				this.battery.energy <
				inThreshold * this.battery.store.getCapacity()
			) {
				const energyPerTick =
					UPGRADE_CONTROLLER_POWER * this.upgradePowerNeeded;
				this.colony.logisticsNetwork.requestInput(this.battery, {
					dAmountdt: energyPerTick,
				});
			}
			if (hasMinerals(this.battery.store)) {
				// get rid of any minerals in the container if present
				this.colony.logisticsNetwork.requestOutputMinerals(
					this.battery
				);
			}
		}
	}

	/**
	 * Calculate where the input will be built for this site
	 */
	private calculateBatteryPos(): RoomPosition | undefined {
		let originPos: RoomPosition | undefined;
		if (this.colony.storage) {
			originPos = this.colony.storage.pos;
		} else if (this.colony.roomPlanner.storagePos) {
			originPos = this.colony.roomPlanner.storagePos;
		} else {
			return;
		}
		// Find all positions at range 2 from controller
		let inputLocations: RoomPosition[] = [];
		for (const pos of this.pos.getPositionsAtRange(2)) {
			if (pos.isWalkable(true) && !insideBunkerBounds(pos, this.colony)) {
				inputLocations.push(pos);
			}
		}
		// Try to find locations where there is maximal standing room
		const maxNeighbors = _.max(
			_.map(inputLocations, (pos) => pos.availableNeighbors(true).length)
		);
		inputLocations = _.filter(
			inputLocations,
			(pos) => pos.availableNeighbors(true).length >= maxNeighbors
		);
		// Return location closest to storage by path
		const inputPos = originPos.findClosestByPath(inputLocations);
		if (inputPos) {
			return inputPos;
		}
	}

	/**
	 * Build a container output at the optimal location
	 */
	private buildBatteryIfMissing(): void {
		if (!this.battery && !this.findInputConstructionSite()) {
			const buildHere = this.batteryPos;
			if (buildHere) {
				const result =
					buildHere.createConstructionSite(STRUCTURE_CONTAINER);
				if (result !== OK) {
					log.warning(
						`${this.print}: cannot build battery at ${
							buildHere.print
						}: ${errorForCode(result)}`
					);
				}
			}
		}
	}

	private stats() {
		// Compute downtime
		this.memory.stats.downtime =
			(this.memory.stats.downtime * (CREEP_LIFE_TIME - 1) +
				(this.battery ? +this.battery.isEmpty : 0)) /
			CREEP_LIFE_TIME;
		Stats.log(
			`colonies.${this.colony.name}.upgradeSite.downtime`,
			this.memory.stats.downtime
		);
	}

	run(): void {
		if (Game.time % 25 == 7 && this.colony.level >= 2) {
			this.buildBatteryIfMissing();
		}
	}

	private drawUpgradeReport(coord: Coord) {
		let { x, y } = coord;
		let height = 1;
		if (this.controller.level !== 8) {
			height += 1;
		}
		if (this.memory.speedFactor !== undefined) {
			height += 1;
		}
		const titleCoords = Visualizer.section(
			`${this.colony.name} Upgrade Site (${this.controller.level})`,
			{ x, y, roomName: this.room.name },
			9.5,
			height + 0.1
		);

		const boxX = titleCoords.x;
		y = titleCoords.y + 0.25;

		if (this.controller.level != 8) {
			Visualizer.text(`Progress`, {
				x: boxX,
				y: y,
				roomName: this.room.name,
			});
			const fmt = (num: number) => `${Math.floor(num / 1000)}K`;
			Visualizer.barGraph(
				[this.controller.progress, this.controller.progressTotal],
				{ x: boxX + 4, y: y, roomName: this.room.name },
				5,
				1,
				fmt
			);
			y += 1;
		}

		if (this.memory.speedFactor !== undefined) {
			Visualizer.text(`Rate`, {
				x: boxX,
				y: y,
				roomName: this.room.name,
			});
			Visualizer.text(this.memory.speedFactor.toString(), {
				x: boxX + 4,
				y: y,
				roomName: this.room.name,
			});
			y += 1;
		}

		Visualizer.text(`Downtime`, {
			x: boxX,
			y: y,
			roomName: this.room.name,
		});
		Visualizer.barGraph(
			this.memory.stats.downtime,
			{ x: boxX + 4, y: y, roomName: this.room.name },
			5
		);

		y += 1;

		return { x, y };
	}

	visuals(coord: Coord): Coord {
		return this.drawUpgradeReport(coord);
	}
}
