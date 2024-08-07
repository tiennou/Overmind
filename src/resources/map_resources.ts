export const RESOURCES_ALL_EXCEPT_ENERGY = _.without(
	RESOURCES_ALL,
	RESOURCE_ENERGY
) as _ResourceConstantSansEnergy[];

export const BOOSTS_T3 = [
	RESOURCE_CATALYZED_GHODIUM_ALKALIDE,
	RESOURCE_CATALYZED_GHODIUM_ACID,
	RESOURCE_CATALYZED_ZYNTHIUM_ALKALIDE,
	RESOURCE_CATALYZED_ZYNTHIUM_ACID,
	RESOURCE_CATALYZED_LEMERGIUM_ALKALIDE,
	RESOURCE_CATALYZED_LEMERGIUM_ACID,
	RESOURCE_CATALYZED_KEANIUM_ALKALIDE,
	RESOURCE_CATALYZED_KEANIUM_ACID,
	RESOURCE_CATALYZED_UTRIUM_ALKALIDE,
	RESOURCE_CATALYZED_UTRIUM_ACID,
];
export const BOOSTS_T2 = [
	RESOURCE_GHODIUM_ALKALIDE,
	RESOURCE_GHODIUM_ACID,
	RESOURCE_ZYNTHIUM_ALKALIDE,
	RESOURCE_ZYNTHIUM_ACID,
	RESOURCE_LEMERGIUM_ALKALIDE,
	RESOURCE_LEMERGIUM_ACID,
	RESOURCE_KEANIUM_ALKALIDE,
	RESOURCE_KEANIUM_ACID,
	RESOURCE_UTRIUM_ALKALIDE,
	RESOURCE_UTRIUM_ACID,
];

export const BOOSTS_T1 = [
	RESOURCE_GHODIUM_OXIDE,
	RESOURCE_GHODIUM_HYDRIDE,
	RESOURCE_ZYNTHIUM_OXIDE,
	RESOURCE_ZYNTHIUM_HYDRIDE,
	RESOURCE_LEMERGIUM_OXIDE,
	RESOURCE_LEMERGIUM_HYDRIDE,
	RESOURCE_KEANIUM_OXIDE,
	RESOURCE_KEANIUM_HYDRIDE,
	RESOURCE_UTRIUM_OXIDE,
	RESOURCE_UTRIUM_HYDRIDE,
];

export const INTERMEDIATE_REACTANTS: ResourceConstant[] = [
	RESOURCE_HYDROXIDE,
	RESOURCE_ZYNTHIUM_KEANITE,
	RESOURCE_UTRIUM_LEMERGITE,
	RESOURCE_GHODIUM,
];

export const BASE_RESOURCES: ResourceConstant[] = [
	RESOURCE_CATALYST,
	RESOURCE_ZYNTHIUM,
	RESOURCE_LEMERGIUM,
	RESOURCE_KEANIUM,
	RESOURCE_UTRIUM,
	RESOURCE_OXYGEN,
	RESOURCE_HYDROGEN,
];
export const _baseResourcesLookup: { [resource: string]: boolean | undefined } =
	_.zipObject(
		BASE_RESOURCES,
		_.map(BASE_RESOURCES, () => true)
	);

export const RESOURCE_IMPORTANCE: ResourceConstant[] = [
	RESOURCE_CATALYZED_GHODIUM_ALKALIDE,
	RESOURCE_CATALYZED_GHODIUM_ACID,
	RESOURCE_CATALYZED_ZYNTHIUM_ALKALIDE,
	RESOURCE_CATALYZED_ZYNTHIUM_ACID,
	RESOURCE_CATALYZED_LEMERGIUM_ALKALIDE,
	RESOURCE_CATALYZED_LEMERGIUM_ACID,
	RESOURCE_CATALYZED_KEANIUM_ALKALIDE,
	RESOURCE_CATALYZED_KEANIUM_ACID,
	RESOURCE_CATALYZED_UTRIUM_ALKALIDE,
	RESOURCE_CATALYZED_UTRIUM_ACID,

	RESOURCE_OPS,

	RESOURCE_GHODIUM_ALKALIDE,
	RESOURCE_GHODIUM_ACID,
	RESOURCE_ZYNTHIUM_ALKALIDE,
	RESOURCE_ZYNTHIUM_ACID,
	RESOURCE_LEMERGIUM_ALKALIDE,
	RESOURCE_LEMERGIUM_ACID,
	RESOURCE_KEANIUM_ALKALIDE,
	RESOURCE_KEANIUM_ACID,
	RESOURCE_UTRIUM_ALKALIDE,
	RESOURCE_UTRIUM_ACID,

	RESOURCE_GHODIUM_OXIDE,
	RESOURCE_GHODIUM_HYDRIDE,
	RESOURCE_ZYNTHIUM_OXIDE,
	RESOURCE_ZYNTHIUM_HYDRIDE,
	RESOURCE_LEMERGIUM_OXIDE,
	RESOURCE_LEMERGIUM_HYDRIDE,
	RESOURCE_KEANIUM_OXIDE,
	RESOURCE_KEANIUM_HYDRIDE,
	RESOURCE_UTRIUM_OXIDE,
	RESOURCE_UTRIUM_HYDRIDE,

	RESOURCE_GHODIUM,
	RESOURCE_UTRIUM_LEMERGITE,
	RESOURCE_ZYNTHIUM_KEANITE,
	RESOURCE_HYDROXIDE,

	RESOURCE_CATALYST,
	RESOURCE_ZYNTHIUM,
	RESOURCE_LEMERGIUM,
	RESOURCE_KEANIUM,
	RESOURCE_UTRIUM,
	RESOURCE_OXYGEN,
	RESOURCE_HYDROGEN,

	RESOURCE_POWER,
	RESOURCE_ENERGY,

	// All other resources are unimportant
];

export const RESOURCE_IMPORTANCE_ALL = _.sortBy(RESOURCES_ALL, (r) => {
	const idx = RESOURCE_IMPORTANCE.indexOf(r);
	return idx === -1 ? Infinity : idx;
});

export const REAGENTS: {
	[product: string]: [ResourceConstant, ResourceConstant];
} = {
	// Tier 3
	[RESOURCE_CATALYZED_GHODIUM_ALKALIDE]: [
		RESOURCE_GHODIUM_ALKALIDE,
		RESOURCE_CATALYST,
	],
	[RESOURCE_CATALYZED_GHODIUM_ACID]: [
		RESOURCE_GHODIUM_ACID,
		RESOURCE_CATALYST,
	],
	[RESOURCE_CATALYZED_ZYNTHIUM_ACID]: [
		RESOURCE_ZYNTHIUM_ACID,
		RESOURCE_CATALYST,
	],
	[RESOURCE_CATALYZED_ZYNTHIUM_ALKALIDE]: [
		RESOURCE_ZYNTHIUM_ALKALIDE,
		RESOURCE_CATALYST,
	],
	[RESOURCE_CATALYZED_LEMERGIUM_ALKALIDE]: [
		RESOURCE_LEMERGIUM_ALKALIDE,
		RESOURCE_CATALYST,
	],
	[RESOURCE_CATALYZED_LEMERGIUM_ACID]: [
		RESOURCE_LEMERGIUM_ACID,
		RESOURCE_CATALYST,
	],
	[RESOURCE_CATALYZED_KEANIUM_ALKALIDE]: [
		RESOURCE_KEANIUM_ALKALIDE,
		RESOURCE_CATALYST,
	],
	[RESOURCE_CATALYZED_KEANIUM_ACID]: [
		RESOURCE_KEANIUM_ACID,
		RESOURCE_CATALYST,
	],
	[RESOURCE_CATALYZED_UTRIUM_ACID]: [RESOURCE_UTRIUM_ACID, RESOURCE_CATALYST],
	[RESOURCE_CATALYZED_UTRIUM_ALKALIDE]: [
		RESOURCE_UTRIUM_ALKALIDE,
		RESOURCE_CATALYST,
	],
	// Tier 2
	[RESOURCE_GHODIUM_ACID]: [RESOURCE_GHODIUM_HYDRIDE, RESOURCE_HYDROXIDE],
	[RESOURCE_GHODIUM_ALKALIDE]: [RESOURCE_GHODIUM_OXIDE, RESOURCE_HYDROXIDE],
	[RESOURCE_ZYNTHIUM_ACID]: [RESOURCE_ZYNTHIUM_HYDRIDE, RESOURCE_HYDROXIDE],
	[RESOURCE_ZYNTHIUM_ALKALIDE]: [RESOURCE_ZYNTHIUM_OXIDE, RESOURCE_HYDROXIDE],
	[RESOURCE_LEMERGIUM_ALKALIDE]: [
		RESOURCE_LEMERGIUM_OXIDE,
		RESOURCE_HYDROXIDE,
	],
	[RESOURCE_LEMERGIUM_ACID]: [RESOURCE_LEMERGIUM_HYDRIDE, RESOURCE_HYDROXIDE],
	[RESOURCE_KEANIUM_ALKALIDE]: [RESOURCE_KEANIUM_OXIDE, RESOURCE_HYDROXIDE],
	[RESOURCE_KEANIUM_ACID]: [RESOURCE_KEANIUM_HYDRIDE, RESOURCE_HYDROXIDE],
	[RESOURCE_UTRIUM_ACID]: [RESOURCE_UTRIUM_HYDRIDE, RESOURCE_HYDROXIDE],
	[RESOURCE_UTRIUM_ALKALIDE]: [RESOURCE_UTRIUM_OXIDE, RESOURCE_HYDROXIDE],
	// Tier 1
	[RESOURCE_GHODIUM_HYDRIDE]: [RESOURCE_GHODIUM, RESOURCE_HYDROGEN],
	[RESOURCE_GHODIUM_OXIDE]: [RESOURCE_GHODIUM, RESOURCE_OXYGEN],
	[RESOURCE_ZYNTHIUM_HYDRIDE]: [RESOURCE_ZYNTHIUM, RESOURCE_HYDROGEN],
	[RESOURCE_ZYNTHIUM_OXIDE]: [RESOURCE_ZYNTHIUM, RESOURCE_OXYGEN],
	[RESOURCE_LEMERGIUM_OXIDE]: [RESOURCE_LEMERGIUM, RESOURCE_OXYGEN],
	[RESOURCE_LEMERGIUM_HYDRIDE]: [RESOURCE_LEMERGIUM, RESOURCE_HYDROGEN],
	[RESOURCE_KEANIUM_OXIDE]: [RESOURCE_KEANIUM, RESOURCE_OXYGEN],
	[RESOURCE_KEANIUM_HYDRIDE]: [RESOURCE_KEANIUM, RESOURCE_HYDROGEN],
	[RESOURCE_UTRIUM_HYDRIDE]: [RESOURCE_UTRIUM, RESOURCE_HYDROGEN],
	[RESOURCE_UTRIUM_OXIDE]: [RESOURCE_UTRIUM, RESOURCE_OXYGEN],
	// Tier 0
	[RESOURCE_GHODIUM]: [RESOURCE_ZYNTHIUM_KEANITE, RESOURCE_UTRIUM_LEMERGITE],
	[RESOURCE_HYDROXIDE]: [RESOURCE_OXYGEN, RESOURCE_HYDROGEN],
	[RESOURCE_ZYNTHIUM_KEANITE]: [RESOURCE_ZYNTHIUM, RESOURCE_KEANIUM],
	[RESOURCE_UTRIUM_LEMERGITE]: [RESOURCE_UTRIUM, RESOURCE_LEMERGIUM],
};

export const MINERAL_COMPOUNDS_ALL = _.keys(REAGENTS).concat(BASE_RESOURCES);
export const _mineralCompoundsAllLookup: {
	[resource: string]: boolean | undefined;
} = _.zipObject(
	MINERAL_COMPOUNDS_ALL,
	_.map(MINERAL_COMPOUNDS_ALL, () => true)
);

export const BOOST_PARTS: { [boost: string]: BodyPartConstant } = {
	UH: ATTACK,
	UO: WORK,
	KH: CARRY,
	KO: RANGED_ATTACK,
	LH: WORK,
	LO: HEAL,
	ZH: WORK,
	ZO: MOVE,
	GH: WORK,
	GO: TOUGH,

	UH2O: ATTACK,
	UHO2: WORK,
	KH2O: CARRY,
	KHO2: RANGED_ATTACK,
	LH2O: WORK,
	LHO2: HEAL,
	ZH2O: WORK,
	ZHO2: MOVE,
	GH2O: WORK,
	GHO2: TOUGH,

	XUH2O: ATTACK,
	XUHO2: WORK,
	XKH2O: CARRY,
	XKHO2: RANGED_ATTACK,
	XLH2O: WORK,
	XLHO2: HEAL,
	XZH2O: WORK,
	XZHO2: MOVE,
	XGH2O: WORK,
	XGHO2: TOUGH,
};

export type HARVEST = "harvest";
export type CONSTRUCT = "construct";
export type DISMANTLE = "dismantle";
export type UPGRADE = "upgrade";
export const HARVEST: HARVEST = "harvest";
export const CONSTRUCT: CONSTRUCT = "construct";
export const DISMANTLE: DISMANTLE = "dismantle";
export const UPGRADE: UPGRADE = "upgrade";

export type BoostType =
	| ATTACK
	| CARRY
	| RANGED_ATTACK
	| HEAL
	| MOVE
	| TOUGH
	| HARVEST
	| CONSTRUCT
	| DISMANTLE
	| UPGRADE;

export const BoostTypeBodyparts: {
	[boostType in BoostType]: BodyPartConstant;
} = {
	[ATTACK]: ATTACK,
	[CARRY]: CARRY,
	[RANGED_ATTACK]: RANGED_ATTACK,
	[HEAL]: HEAL,
	[MOVE]: MOVE,
	[TOUGH]: TOUGH,
	[HARVEST]: WORK,
	[CONSTRUCT]: WORK,
	[DISMANTLE]: WORK,
	[UPGRADE]: WORK,
};

/** Subkeys of the BOOST object spec */
export type BoostModifier =
	| "harvest"
	| "build"
	| "repair"
	| "dismantle"
	| "upgradeController"
	| "attack"
	| "rangedAttack"
	| "rangedMassAttack"
	| "heal"
	| "rangedHeal"
	| "capacity"
	| "fatigue"
	| "damage";

export const BoostTypeToBoostArray: {
	[boostType in BoostType]: BoostModifier;
} = {
	[ATTACK]: ATTACK,
	[CARRY]: "capacity",
	[RANGED_ATTACK]: "rangedAttack",
	// [RANGED_MASS_ATTACK]: "rangedMassAttack",
	[HEAL]: HEAL,
	[MOVE]: "fatigue",
	[TOUGH]: "damage",
	[HARVEST]: "harvest",
	[CONSTRUCT]: "build",
	// [REPAIR]: "repair",
	[DISMANTLE]: "dismantle",
	[UPGRADE]: "upgradeController",
};

export type BoostTier = "T1" | "T2" | "T3";

export function isBoostType(str: string): str is BoostType {
	return (
		str === ATTACK ||
		str === CARRY ||
		str === RANGED_ATTACK ||
		str === HEAL ||
		str === MOVE ||
		str === TOUGH ||
		str === HARVEST ||
		str === CONSTRUCT ||
		str === DISMANTLE ||
		str === UPGRADE
	);
}

export const BOOST_TIERS: {
	[boostType in BoostType]: {
		[boostTier in BoostTier]: MineralBoostConstant;
	};
} = {
	attack: {
		T1: "UH",
		T2: "UH2O",
		T3: "XUH2O",
	},
	carry: {
		T1: "KH",
		T2: "KH2O",
		T3: "XKH2O",
	},
	ranged_attack: {
		T1: "KO",
		T2: "KHO2",
		T3: "XKHO2",
	},
	heal: {
		T1: "LO",
		T2: "LHO2",
		T3: "XLHO2",
	},
	move: {
		T1: "ZO",
		T2: "ZHO2",
		T3: "XZHO2",
	},
	tough: {
		T1: "GO",
		T2: "GHO2",
		T3: "XGHO2",
	},
	harvest: {
		T1: "UO",
		T2: "UHO2",
		T3: "XUHO2",
	},
	construct: {
		T1: "LH",
		T2: "LH2O",
		T3: "XLH2O",
	},
	dismantle: {
		T1: "ZH",
		T2: "ZH2O",
		T3: "XZH2O",
	},
	upgrade: {
		T1: "GH",
		T2: "GH2O",
		T3: "XGH2O",
	},
};
// This inverts the second-level values from above, so you get an object that looks like:
// { attack: { UH: T1, UH2O: T2, XUH2O: T3 }, carry: { ... } ... }
export const _boostTypesTierLookup = _.mapValues(BOOST_TIERS, (boostType) =>
	_.invert(boostType)
) as {
	[boostType in BoostType]: { [resource in ResourceConstant]: BoostTier };
};

// This inverts the second-level values from above, so you get an object that looks like:
// { attack: { UH: T1, UH2O: T2, XUH2O: T3 }, carry: { ... } ... }
export const _boostTierLookupAllTypes: {
	[resource in ResourceConstant]: BoostTier;
} = _.extend({}, ..._.values(_boostTypesTierLookup));

export const COMMODITIES_DATA: {
	[resource: string]: { lvl: 0 | 1 | 2 | 3 | 4 | 5; chain?: string };
} = {
	// Compressed mineral compounds
	[RESOURCE_UTRIUM_BAR]: { lvl: 0 },
	[RESOURCE_LEMERGIUM_BAR]: { lvl: 0 },
	[RESOURCE_ZYNTHIUM_BAR]: { lvl: 0 },
	[RESOURCE_KEANIUM_BAR]: { lvl: 0 },
	[RESOURCE_GHODIUM_MELT]: { lvl: 0 },
	[RESOURCE_OXIDANT]: { lvl: 0 },
	[RESOURCE_REDUCTANT]: { lvl: 0 },
	[RESOURCE_PURIFIER]: { lvl: 0 },
	[RESOURCE_BATTERY]: { lvl: 0 },
	// Higher commodities
	[RESOURCE_COMPOSITE]: { lvl: 1, chain: "common" },
	[RESOURCE_CRYSTAL]: { lvl: 1, chain: "common" },
	[RESOURCE_LIQUID]: { lvl: 1, chain: "common" },
	// Mechanical chain
	[RESOURCE_ALLOY]: { lvl: 0, chain: RESOURCE_METAL },
	[RESOURCE_TUBE]: { lvl: 1, chain: RESOURCE_METAL },
	[RESOURCE_FIXTURES]: { lvl: 2, chain: RESOURCE_METAL },
	[RESOURCE_FRAME]: { lvl: 3, chain: RESOURCE_METAL },
	[RESOURCE_HYDRAULICS]: { lvl: 4, chain: RESOURCE_METAL },
	[RESOURCE_MACHINE]: { lvl: 5, chain: RESOURCE_METAL },
	// Biological chain
	[RESOURCE_CELL]: { lvl: 0, chain: RESOURCE_BIOMASS },
	[RESOURCE_PHLEGM]: { lvl: 1, chain: RESOURCE_BIOMASS },
	[RESOURCE_TISSUE]: { lvl: 2, chain: RESOURCE_BIOMASS },
	[RESOURCE_MUSCLE]: { lvl: 3, chain: RESOURCE_BIOMASS },
	[RESOURCE_ORGANOID]: { lvl: 4, chain: RESOURCE_BIOMASS },
	[RESOURCE_ORGANISM]: { lvl: 5, chain: RESOURCE_BIOMASS },
	// Electronic chain
	[RESOURCE_WIRE]: { lvl: 0, chain: RESOURCE_SILICON },
	[RESOURCE_SWITCH]: { lvl: 1, chain: RESOURCE_SILICON },
	[RESOURCE_TRANSISTOR]: { lvl: 2, chain: RESOURCE_SILICON },
	[RESOURCE_MICROCHIP]: { lvl: 3, chain: RESOURCE_SILICON },
	[RESOURCE_CIRCUIT]: { lvl: 4, chain: RESOURCE_SILICON },
	[RESOURCE_DEVICE]: { lvl: 5, chain: RESOURCE_SILICON },
	// Mystical chain
	[RESOURCE_CONDENSATE]: { lvl: 0, chain: RESOURCE_MIST },
	[RESOURCE_CONCENTRATE]: { lvl: 1, chain: RESOURCE_MIST },
	[RESOURCE_EXTRACT]: { lvl: 2, chain: RESOURCE_MIST },
	[RESOURCE_SPIRIT]: { lvl: 3, chain: RESOURCE_MIST },
	[RESOURCE_EMANATION]: { lvl: 4, chain: RESOURCE_MIST },
	[RESOURCE_ESSENCE]: { lvl: 5, chain: RESOURCE_MIST },
};

export const COMMODITIES_ALL: ResourceConstant[] = <ResourceConstant[]>(
	Object.keys(COMMODITIES_DATA)
);

export const COMMODITIES_CHAINS: ResourceConstant[] = Object.entries(
	COMMODITIES_DATA
)
	.filter(([_, data]) => data.chain)
	.map(([res, _]) => <ResourceConstant>res);

export const DEPOSITS_ALL: ResourceConstant[] = [
	RESOURCE_SILICON,
	RESOURCE_BIOMASS,
	RESOURCE_METAL,
	RESOURCE_MIST,
];

export const ALL_ZERO_ASSETS: StoreContents = _.zipObject(
	RESOURCES_ALL,
	_.map(RESOURCES_ALL, () => 0)
);
