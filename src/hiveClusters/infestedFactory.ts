import { $ } from "caching/GlobalCache";
import { profile } from "profiler/decorator";
import { Colony } from "Colony";
import { HiveCluster } from "./_HiveCluster";
import { Mem } from "memory/Memory";
import { TerminalNetwork } from "logistics/TerminalNetwork";
import { TransportRequestGroup } from "logistics/TransportRequestGroup";
import { log } from "console/log";
import { Priority } from "priorities/priorities";
import { Production } from "resources/Abathur";
import { entries, getCacheExpiration, minMax } from "utilities/utils";
import { errorForCode } from "utilities/errors";
import { rightArrow } from "utilities/stringConstants";

export interface InfestedFactoryMemory {
	status: number;
	statusTick: number;
	activeProduction: Production | undefined;
	/** How many batches have been produced already */
	produced: number;
	suspendProductionUntil?: number;
	stats: {
		totalProduction: { [resourceType: string]: number };
		avgUsage: number;
	};
}

export const FactoryStatus = {
	Idle: 0,
	AcquiringComponents: 1,
	LoadingFactory: 2,
	Producing: 3,
	UnloadingFactory: 4,
};

const FactoryStageTimeouts = {
	Idle: Infinity,
	AcquiringComponents: 50,
	LoadingFactory: 50,
	Producing: 10000,
	UnloadingFactory: 50,
};

const getDefaultFactoryMemory: () => InfestedFactoryMemory = () => ({
	status: FactoryStatus.Idle,
	statusTick: 0,
	activeProduction: undefined,
	produced: 0,
	suspendProductionUntil: 0,
	stats: {
		totalProduction: {},
		avgUsage: 1,
	},
});

@profile
export class InfestedFactory extends HiveCluster {
	static settings = {
		/** How many ticks to sleep when no production is requested */
		sleepDelay: 100,
		/** How many ticks to wait when idle before requesting to be completely unloaded */
		dumpDelay: 10,
		/** How much free space to keep when requesting inputs */
		buffer: 1000,
	};

	terminal: StructureTerminal;
	terminalNetwork: TerminalNetwork;
	factory: StructureFactory;
	transportRequests: TransportRequestGroup;
	memory: InfestedFactoryMemory;

	constructor(colony: Colony, factory: StructureFactory) {
		super(colony, factory, "infestedFactory");
		this.memory = Mem.wrap(
			this.colony.memory,
			"infestedFactory",
			getDefaultFactoryMemory
		);
		this.factory = factory;
		this.terminal = colony.terminal!;
		this.terminalNetwork = Overmind.terminalNetwork as TerminalNetwork;
		this.transportRequests = this.colony.commandCenter!.transportRequests;
	}

	refresh(): void {
		this.memory = Mem.wrap(
			this.colony.memory,
			"infestedFactory",
			getDefaultFactoryMemory
		);
		$.refreshRoom(this);
		$.refresh(this, "terminal", "factory");
	}

	spawnMoarOverlords(): void {
		// Infested Factory is attended by managers
	}

	getProductionRecipe(commodityType: CommodityConstant) {
		return entries(COMMODITIES[commodityType].components);
	}

	private initFactoryStatus() {
		const product = this.memory.activeProduction;
		if (!product && this.memory.status !== FactoryStatus.Idle) {
			log.warning(
				`Unexpected lack of active production at ${this.print}! Reverting to idle state.`
			);
			this.memory.status = FactoryStatus.Idle;
		}

		if (!product) {
			return;
		}

		const components = this.getProductionRecipe(product.commodityType);
		const produced = this.memory.produced;

		switch (this.memory.status) {
			case FactoryStatus.Idle:
				log.info(
					`${this.print}: starting production of ${components
						.map(
							([res, amount]) =>
								`${amount * product.requested} of ${res}`
						)
						.join(", ")} ` +
						`${rightArrow} ${product.requested} ${product.commodityType}`
				);
				this.memory.status = FactoryStatus.AcquiringComponents;
				this.memory.statusTick = Game.time;
				break;

			case FactoryStatus.AcquiringComponents:
				this.debug(
					() =>
						`aquiring components for ${product.requested} of ${product.commodityType}`
				);
				if (
					_.all(
						components,
						([component, amount]) =>
							this.colony.assets[component] >=
							amount * (product.requested - produced)
					)
				) {
					this.debug(() => `components acquired, loading`);
					this.memory.status = FactoryStatus.LoadingFactory;
					this.memory.statusTick = Game.time;
				}
				break;

			case FactoryStatus.LoadingFactory:
				this.debug(
					() =>
						`loading components for ${
							product.requested - produced
						} of ${product.commodityType}`
				);
				if (
					_.all(
						components,
						([component, amount]) =>
							this.factory.store[component] >= amount
					)
				) {
					this.debug(() => `loading complete, producing`);
					this.memory.status = FactoryStatus.Producing;
					this.memory.statusTick = Game.time;
				}
				break;

			case FactoryStatus.Producing:
				this.debug(
					() =>
						`producing ${product.requested} of ${
							product.commodityType
						}, ${product.requested - produced} remaining`
				);
				if (product.requested - this.memory.produced <= 0) {
					this.debug(() => `production complete, unloading`);
					this.memory.status = FactoryStatus.UnloadingFactory;
					this.memory.statusTick = Game.time;
				}
				break;

			case FactoryStatus.UnloadingFactory:
				this.debug(
					() =>
						`unloading components for ${product.requested} of ${product.commodityType}`
				);
				if (this.factory.store[product.commodityType] - produced <= 0) {
					this.debug(() => `unloading complete, idling`);
					this.memory.status = FactoryStatus.Idle;
					delete this.memory.activeProduction;
					this.memory.statusTick = Game.time;
				}
				break;

			default:
				log.error(
					`Bad factory state at ${this.print}! State: ${this.memory.status}`
				);
				this.memory.status = FactoryStatus.Idle;
				this.memory.statusTick = Game.time;
				break;
		}
		this.statusTimeoutCheck();
	}

	private statusTimeoutCheck(): void {
		const ticksInStatus = Game.time - this.memory.statusTick;
		let timeout = false;
		switch (this.memory.status) {
			case FactoryStatus.Idle:
				timeout = ticksInStatus > FactoryStageTimeouts.Idle;
				break;
			case FactoryStatus.AcquiringComponents:
				timeout =
					ticksInStatus > FactoryStageTimeouts.AcquiringComponents;
				break;
			case FactoryStatus.LoadingFactory:
				timeout = ticksInStatus > FactoryStageTimeouts.LoadingFactory;
				break;
			case FactoryStatus.Producing:
				timeout = ticksInStatus > FactoryStageTimeouts.Producing;
				break;
			case FactoryStatus.UnloadingFactory:
				timeout = ticksInStatus > FactoryStageTimeouts.UnloadingFactory;
				break;
			default:
				log.error(`Bad factory state at ${this.print}!`);
				this.memory.status = FactoryStatus.Idle;
				this.memory.statusTick = Game.time;
				break;
		}
		if (timeout) {
			log.warning(
				`${this.print}: stuck in state ${this.memory.status} for ${ticksInStatus} ticks, reverting to idle state!`
			);
			this.memory.status = FactoryStatus.Idle;
			this.memory.statusTick = Game.time;
			this.memory.activeProduction = undefined;
		}
	}

	private registerRequests() {
		// Don't care about the factory if you can't spawn any creeps!
		if (this.colony.state.bootstrapping) {
			return;
		}

		if (
			this.memory.status === FactoryStatus.Idle &&
			Game.time - this.memory.statusTick >
				InfestedFactory.settings.dumpDelay
		) {
			// Idle for a while, dump everything out
			for (const [resourceType, amount] of this.factory.store.contents) {
				this.debug(
					() => `requesting output of ${amount} of ${resourceType}`
				);
				this.transportRequests.requestOutput(
					this.factory,
					Priority.Low,
					{ resourceType, amount }
				);
			}
		}

		// Forcibly request output if there's not enough free space
		if (
			this.factory.store.getFreeCapacity() <
			InfestedFactory.settings.buffer
		) {
			this.transportRequests.requestOutput(
				this.factory,
				Priority.Critical
			);
		}

		const product = this.memory.activeProduction;
		const produced = this.memory.produced;
		if (!product) {
			return;
		}

		const recipe = this.getProductionRecipe(product.commodityType);
		for (const [component, amount] of recipe) {
			const neededAmount =
				amount * (product.requested - produced) -
				this.factory.store[component];
			if (neededAmount <= 0) {
				continue;
			}
			const cappedAmount = minMax(
				neededAmount,
				0,
				this.factory.store.getFreeCapacity() -
					InfestedFactory.settings.buffer
			);
			this.debug(
				() =>
					`requesting input of ${neededAmount} of ${component}, capped at ${cappedAmount}`
			);
			this.transportRequests.requestInput(this.factory, Priority.High, {
				resourceType: component,
				amount: cappedAmount,
			});
		}
		const stored = Math.min(
			this.factory.store[product.commodityType],
			produced * product.size
		);
		if (stored > 0) {
			this.debug(
				() =>
					`requesting output of ${stored} of ${product.commodityType}`
			);
			this.transportRequests.requestOutput(
				this.factory,
				Priority.Normal,
				{ resourceType: product.commodityType, amount: stored }
			);
		}
	}

	init(): void {
		this.debug(`init`);
		this.initFactoryStatus();

		this.registerRequests();
	}

	produce(commodity: CommodityConstant, amount: number = 1) {
		if (this.memory.status !== FactoryStatus.Idle) {
			log.warning(
				`${this.print} is currently producing, ignoring request`
			);
			return false;
		}
		this.memory.activeProduction = {
			commodityType: commodity,
			requested: amount,
			size: COMMODITIES[commodity].amount,
		};
		this.memory.produced = 0;
		return true;
	}

	run(): void {
		this.debug(
			`run: status: ${this.memory.status}, suspended until: ${this.memory.suspendProductionUntil}, cooldown: ${this.factory.cooldown}`
		);
		if (
			this.memory.suspendProductionUntil &&
			Game.time > this.memory.suspendProductionUntil
		) {
			delete this.memory.suspendProductionUntil;
		}

		let product = this.memory.activeProduction;
		if (!product && !this.memory.suspendProductionUntil) {
			const nextProduction = Abathur.getNextProduction(this.colony);
			// const nextProduction = ((): Production | undefined => undefined)();
			this.debug(
				() => `next production: ${JSON.stringify(nextProduction)}`
			);
			if (nextProduction) {
				product = this.memory.activeProduction = nextProduction;
				this.memory.produced = 0;
			} else {
				const sleepTime = getCacheExpiration(
					InfestedFactory.settings.sleepDelay,
					10
				);
				log.info(
					`${this.print}: no production available; sleeping until ${sleepTime}.`
				);
				this.memory.suspendProductionUntil = sleepTime;
			}
		}

		this.debug(
			`run: ${JSON.stringify(product)}, produced: ${this.memory.produced}`
		);
		if (
			this.memory.status === FactoryStatus.Producing &&
			product &&
			this.factory.cooldown === 0
		) {
			this.debug(() => `producing: ${JSON.stringify(product)}`);
			const result = this.factory.produce(product.commodityType);
			if (result === OK) {
				this.memory.produced += 1;

				if (!this.memory.stats.totalProduction[product.commodityType]) {
					this.memory.stats.totalProduction[product.commodityType] =
						0;
				}
				this.memory.stats.totalProduction[product.commodityType] +=
					product.size;
			} else {
				log.warning(
					`${this.print}: couldn't run production (${errorForCode(
						result
					)})!`
				);
			}
		}
	}
}
