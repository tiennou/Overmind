import { CreepSetup } from 'creepSetups/CreepSetup';
import {Roles, Setups} from '../../creepSetups/setups';
import {UpgradeSite} from '../../hiveClusters/upgradeSite';
import {OverlordPriority} from '../../priorities/priorities_overlords';
import {profile} from '../../profiler/decorator';
import {Tasks} from '../../tasks/Tasks';
import {Zerg} from '../../zerg/Zerg';
import {Overlord} from '../Overlord';

/**
 * Spawns an upgrader to upgrade the room controller
 */
@profile
export class UpgradingOverlord extends Overlord {

	upgradersNeeded: number;
	upgraders: Zerg[];
	upgradeSite: UpgradeSite;
	settings: { [property: string]: number };
	room: Room;	//  Operates in owned room

	constructor(upgradeSite: UpgradeSite, priority = OverlordPriority.upgrading.upgrade) {
		super(upgradeSite, 'upgrade', priority);
		this.upgradeSite = upgradeSite;
		// If new colony or boosts overflowing to storage
		this.upgraders = this.zerg(Roles.upgrader);
	}

	init() {
		if (this.colony.level < 3) { // can't spawn upgraders at early levels
			return;
		}
		let setup = "default";
		let upgradersNeeded = 0;
		if (this.colony.assets.energy > UpgradeSite.settings.energyBuffer
			|| this.upgradeSite.controller.ticksToDowngrade < 500) {
			if (this.colony.level == 8) {
				upgradersNeeded = 1;
				setup = "rcl8";
				if (this.colony.labs.length == 10 &&
					this.colony.assets[RESOURCE_CATALYZED_GHODIUM_ACID] >= 4 * LAB_BOOST_MINERAL) {
					setup = "rcl8_boosted";
				}
			} else {
				const upgradePowerEach = _.get<CreepSetup>(Setups.upgraders, setup)
					.getBodyPotential(WORK, this.colony);
				upgradersNeeded = Math.ceil(this.upgradeSite.upgradePowerNeeded / upgradePowerEach);
			}
		} else {
			this.debug(`no upgraders needed`);
		}

		// Ask for one upgraded at normal priority, and the rest more lazily
		this.debug(`need ${upgradersNeeded} ${setup} upgraders total`);

		const creepSetup = _.get<CreepSetup>(Setups.upgraders, setup);
		const speedFactor = this.upgradeSite.memory.speedFactor ?? 1;
		if (this.upgraders.length < speedFactor && upgradersNeeded > 0) {
			this.debug(`wishlisting ${Math.min(speedFactor, upgradersNeeded)} quickly!`);
			this.wishlist(Math.min(speedFactor, upgradersNeeded), creepSetup);
		} else if (upgradersNeeded > 0) {
			this.debug(`wishlisting ${upgradersNeeded} later`);
			this.wishlist(upgradersNeeded, creepSetup, {
				priority: OverlordPriority.upgrading.additional
			});
		}
	}

	private handleUpgrader(upgrader: Zerg): void {
		if (upgrader.store.energy > 0) {
			// Repair link
			if (this.upgradeSite.link && this.upgradeSite.link.hits < this.upgradeSite.link.hitsMax) {
				upgrader.task = Tasks.repair(this.upgradeSite.link);
				return;
			}
			// Repair container
			if (this.upgradeSite.battery && this.upgradeSite.battery.hits < this.upgradeSite.battery.hitsMax) {
				upgrader.task = Tasks.repair(this.upgradeSite.battery);
				return;
			}
			// Build construction site
			const inputSite = this.upgradeSite.findInputConstructionSite();
			if (inputSite) {
				upgrader.task = Tasks.build(inputSite);
				return;
			}
			// Sign controller if needed
			if (!this.upgradeSite.controller.signedByMe &&
				!this.upgradeSite.controller.signedByScreeps) {
				upgrader.task = Tasks.signController(this.upgradeSite.controller);
				return;
			}
			upgrader.task = Tasks.upgrade(this.upgradeSite.controller);
		} else {
			// Recharge from link or battery
			if (this.upgradeSite.link && this.upgradeSite.link.energy > 0) {
				upgrader.task = Tasks.withdraw(this.upgradeSite.link);
			} else if (this.upgradeSite.battery && this.upgradeSite.battery.energy > 0) {
				upgrader.task = Tasks.withdraw(this.upgradeSite.battery);
			} else {
				// Find somewhere else to recharge from
				// TODO: BUG HERE IF NO UPGRADE CONTAINER
				if (this.upgradeSite.battery && this.upgradeSite.battery.targetedBy.length == 0) {
					upgrader.task = Tasks.recharge();
				}
			}
		}
	}

	run() {
		this.autoRun(this.upgraders, upgrader => this.handleUpgrader(upgrader));
	}
}
