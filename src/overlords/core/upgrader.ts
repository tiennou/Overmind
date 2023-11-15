import { CreepSetup } from "creepSetups/CreepSetup";
import { Roles, Setups } from "../../creepSetups/setups";
import { UpgradeSite } from "../../hiveClusters/upgradeSite";
import { OverlordPriority } from "../../priorities/priorities_overlords";
import { profile } from "../../profiler/decorator";
import { Tasks } from "../../tasks/Tasks";
import { Zerg } from "../../zerg/Zerg";
import { Overlord } from "../Overlord";

/**
 * Spawns an upgrader to upgrade the room controller
 */
@profile
export class UpgradingOverlord extends Overlord {
	upgradersNeeded: number;
	upgraders: Zerg[];
	upgradeSite: UpgradeSite;
	settings: { [property: string]: number };
	room: Room; //  Operates in owned room

	constructor(
		upgradeSite: UpgradeSite,
		priority = OverlordPriority.upgrading.upgrade
	) {
		super(upgradeSite, "upgrade", priority);
		this.upgradeSite = upgradeSite;
		// If new colony or boosts overflowing to storage
		this.upgraders = this.zerg(Roles.upgrader);
	}

	init() {
		if (this.colony.level < 3) {
			// can't spawn upgraders at early levels
			return;
		}
		let setup = "default";
		let upgradersNeeded = 0;
		if (
			this.colony.assets.energy > UpgradeSite.settings.energyBuffer ||
			this.upgradeSite.controller.ticksToDowngrade < 500
		) {
			if (this.colony.level == 8) {
				upgradersNeeded = 1;
				setup = "rcl8";
				if (
					this.colony.labs.length == 10 &&
					this.colony.assets[RESOURCE_CATALYZED_GHODIUM_ACID] >=
						4 * LAB_BOOST_MINERAL
				) {
					setup = "rcl8_boosted";
				}
			} else {
				const upgradePowerEach = _.get<CreepSetup>(
					Setups.upgraders,
					setup
				).getBodyPotential(WORK, this.colony);
				upgradersNeeded = Math.ceil(
					this.upgradeSite.upgradePowerNeeded / upgradePowerEach
				);
			}
		} else {
			this.debug(`no upgraders needed`);
		}

		// Ask for one upgraded at normal priority, and the rest more lazily
		this.debug(`need ${upgradersNeeded} ${setup} upgraders total`);

		const creepSetup = _.get<CreepSetup>(Setups.upgraders, setup);
		const speedFactor = this.upgradeSite.memory.speedFactor ?? 1;
		if (this.upgraders.length < speedFactor && upgradersNeeded > 0) {
			this.debug(
				`wishlisting ${Math.min(speedFactor, upgradersNeeded)} quickly!`
			);
			this.wishlist(Math.min(speedFactor, upgradersNeeded), creepSetup);
		} else if (upgradersNeeded > 0) {
			this.debug(`wishlisting ${upgradersNeeded} later`);
			this.wishlist(upgradersNeeded, creepSetup, {
				priority: OverlordPriority.upgrading.additional,
			});
		}
	}

	private handleUpgrader(upgrader: Zerg): void {
		if (upgrader.store.energy > 0) {
			// Repair link
			if (
				this.upgradeSite.link &&
				this.upgradeSite.link.hits < this.upgradeSite.link.hitsMax
			) {
				this.debug(`${upgrader.print}: repairing link`);
				upgrader.task = Tasks.repair(this.upgradeSite.link);
				return;
			}
			// Repair container
			if (
				this.upgradeSite.battery &&
				this.upgradeSite.battery.hits < this.upgradeSite.battery.hitsMax
			) {
				this.debug(`${upgrader.print}: repairing battery`);
				upgrader.task = Tasks.repair(this.upgradeSite.battery);
				return;
			}
			// Build construction site
			const inputSite = this.upgradeSite.findInputConstructionSite();
			if (inputSite) {
				this.debug(`${upgrader.print}: building ${inputSite}`);
				upgrader.task = Tasks.build(inputSite);
				return;
			}
			// Sign controller if needed
			if (
				!this.upgradeSite.controller.signedByMe &&
				!this.upgradeSite.controller.signedByScreeps
			) {
				this.debug(`${upgrader.print}: signing controller`);
				upgrader.task = Tasks.signController(
					this.upgradeSite.controller
				);
				return;
			}
			this.debug(`${upgrader.print}: upgrading`);
			upgrader.task = Tasks.upgrade(this.upgradeSite.controller);
		} else {
			// Try recharging from link first; if the link has no energy,
			// either some will pop up soon, or there is no energy anywhere
			if (
				this.upgradeSite.link &&
				this.upgradeSite.link.store[RESOURCE_ENERGY] > 0
			) {
				this.debug(`${upgrader.print}: withdrawing from link`);
				upgrader.task = Tasks.withdraw(this.upgradeSite.link);
				return;
			}
			if (
				this.upgradeSite.battery &&
				this.upgradeSite.battery.energy > 0
			) {
				this.debug(`${upgrader.print}: withdrawing from battery`);
				upgrader.task = Tasks.withdraw(this.upgradeSite.battery);
				return;
			}

			// Find somewhere else to recharge from
			this.debug(`${upgrader.print}: heading off to recharge`);
			upgrader.task = Tasks.recharge();
			return;
		}
	}

	run() {
		this.autoRun(this.upgraders, (upgrader) =>
			this.handleUpgrader(upgrader)
		);
	}
}
