export type NO_ACTION = 1;
export const NO_ACTION: NO_ACTION = 1;

export type CROSSING_PORTAL = 21;
export const CROSSING_PORTAL: CROSSING_PORTAL = 21;

export type ERR_NOT_IMPLEMENTED = -999;
export const ERR_NOT_IMPLEMENTED: ERR_NOT_IMPLEMENTED = -999;

export type ERR_ROOM_ENERGY_CAPACITY_NOT_ENOUGH = -20;
export const ERR_ROOM_ENERGY_CAPACITY_NOT_ENOUGH: ERR_ROOM_ENERGY_CAPACITY_NOT_ENOUGH =
	-20;
export type ERR_SPECIFIED_SPAWN_BUSY = -21;
export const ERR_SPECIFIED_SPAWN_BUSY: ERR_SPECIFIED_SPAWN_BUSY = -21;

export type ERR_CANNOT_PUSH_CREEP = -30;
export const ERR_CANNOT_PUSH_CREEP: ERR_CANNOT_PUSH_CREEP = -30;

export type ERR_SWARM_BUSY = -90;
export const ERR_SWARM_BUSY: ERR_SWARM_BUSY = -90;

export type ERR_SWARM_ROTATE_FAILED_1 = -200;
export const ERR_SWARM_ROTATE_FAILED_1: ERR_SWARM_ROTATE_FAILED_1 = -200;
export type ERR_SWARM_ROTATE_FAILED_2 = -201;
export const ERR_SWARM_ROTATE_FAILED_2: ERR_SWARM_ROTATE_FAILED_2 = -201;
export type ERR_SWARM_ROTATE_FAILED_3 = -202;
export const ERR_SWARM_ROTATE_FAILED_3: ERR_SWARM_ROTATE_FAILED_3 = -202;
export type ERR_SWARM_ROTATE_FAILED_4 = -203;
export const ERR_SWARM_ROTATE_FAILED_4: ERR_SWARM_ROTATE_FAILED_4 = -203;

export type ERR_NO_ORDER_TO_BUY_FROM = -101;
export const ERR_NO_ORDER_TO_BUY_FROM: ERR_NO_ORDER_TO_BUY_FROM = -101;
export type ERR_NO_ORDER_TO_SELL_TO = -102;
export const ERR_NO_ORDER_TO_SELL_TO: ERR_NO_ORDER_TO_SELL_TO = -102;
export type ERR_INSUFFICIENT_ENERGY_IN_TERMINAL = -103;
export const ERR_INSUFFICIENT_ENERGY_IN_TERMINAL: ERR_INSUFFICIENT_ENERGY_IN_TERMINAL =
	-103;
export type ERR_NOT_ENOUGH_MARKET_DATA = -104;
export const ERR_NOT_ENOUGH_MARKET_DATA: ERR_NOT_ENOUGH_MARKET_DATA = -104;
export type ERR_TOO_MANY_ORDERS_OF_TYPE = -105;
export const ERR_TOO_MANY_ORDERS_OF_TYPE: ERR_TOO_MANY_ORDERS_OF_TYPE = -105;
export type ERR_SELL_DIRECT_PRICE_TOO_LOW = -106;
export const ERR_SELL_DIRECT_PRICE_TOO_LOW: ERR_SELL_DIRECT_PRICE_TOO_LOW =
	-106;
export type ERR_BUY_DIRECT_PRICE_TOO_HIGH = -107;
export const ERR_BUY_DIRECT_PRICE_TOO_HIGH: ERR_BUY_DIRECT_PRICE_TOO_HIGH =
	-107;
export type ERR_CREDIT_THRESHOLDS = -108;
export const ERR_CREDIT_THRESHOLDS: ERR_CREDIT_THRESHOLDS = -108;
export type ERR_DONT_BUY_REACTION_INTERMEDIATES = -109;
export const ERR_DONT_BUY_REACTION_INTERMEDIATES: ERR_DONT_BUY_REACTION_INTERMEDIATES =
	-109;
export type ERR_DRY_RUN_ONLY_SUPPORTS_DIRECT_TRANSACTIONS = -110;
export const ERR_DRY_RUN_ONLY_SUPPORTS_DIRECT_TRANSACTIONS: ERR_DRY_RUN_ONLY_SUPPORTS_DIRECT_TRANSACTIONS =
	-110;

export type ERR_SWARM_ROTATE_FAILED =
	| ERR_SWARM_ROTATE_FAILED_1
	| ERR_SWARM_ROTATE_FAILED_2
	| ERR_SWARM_ROTATE_FAILED_3
	| ERR_SWARM_ROTATE_FAILED_4;

export type TerminalNetworkReturnCode =
	| ERR_NO_ORDER_TO_BUY_FROM
	| ERR_NO_ORDER_TO_SELL_TO
	| ERR_INSUFFICIENT_ENERGY_IN_TERMINAL
	| ERR_NOT_ENOUGH_MARKET_DATA
	| ERR_TOO_MANY_ORDERS_OF_TYPE
	| ERR_SELL_DIRECT_PRICE_TOO_LOW
	| ERR_BUY_DIRECT_PRICE_TOO_HIGH
	| ERR_CREDIT_THRESHOLDS
	| ERR_DONT_BUY_REACTION_INTERMEDIATES
	| ERR_DRY_RUN_ONLY_SUPPORTS_DIRECT_TRANSACTIONS;

export type OvermindReturnCode =
	| ScreepsReturnCode
	| TerminalNetworkReturnCode
	| NO_ACTION
	| CROSSING_PORTAL
	| ERR_SWARM_BUSY
	| ERR_ROOM_ENERGY_CAPACITY_NOT_ENOUGH
	| ERR_SPECIFIED_SPAWN_BUSY
	| ERR_CANNOT_PUSH_CREEP
	| ERR_NOT_IMPLEMENTED
	| ERR_SWARM_ROTATE_FAILED;

const errorMap: Record<OvermindReturnCode, string> = {
	"21": "CROSSING_PORTAL",
	"1": "NO_ACTION",
	"0": "OK",
	"-1": "ERR_NOT_OWNER",
	"-2": "ERR_NO_PATH",
	"-3": "ERR_NAME_EXISTS",
	"-4": "ERR_BUSY",
	"-5": "ERR_NOT_FOUND",
	"-6": "ERR_INSUFFICIENT",
	// "-6": "ERR_NOT_ENOUGH_ENERGY",
	// "-6": "ERR_NOT_ENOUGH_EXTENSIONS",
	// "-6": "ERR_NOT_ENOUGH_RESOURCES",
	"-7": "ERR_INVALID_TARGET",
	"-8": "ERR_FULL",
	"-9": "ERR_NOT_IN_RANGE",
	"-10": "ERR_INVALID_ARGS",
	"-11": "ERR_TIRED",
	"-12": "ERR_NO_BODYPART",
	"-14": "ERR_RCL_NOT_ENOUGH",
	"-15": "ERR_GCL_NOT_ENOUGH",
	"-20": "ERR_ROOM_ENERGY_CAPACITY_NOT_ENOUGH",
	"-21": "ERR_SPECIFIED_SPAWN_BUSY",
	"-30": "ERR_CANNOT_PUSH_CREEP",
	"-90": "ERR_SWARM_BUSY",
	"-101": "ERR_NO_ORDER_TO_BUY_FROM",
	"-102": "ERR_NO_ORDER_TO_SELL_TO",
	"-103": "ERR_INSUFFICIENT_ENERGY_IN_TERMINAL",
	"-104": "ERR_NOT_ENOUGH_MARKET_DATA",
	"-105": "ERR_TOO_MANY_ORDERS_OF_TYPE",
	"-106": "ERR_SELL_DIRECT_PRICE_TOO_LOW",
	"-107": "ERR_BUY_DIRECT_PRICE_TOO_HIGH",
	"-108": "ERR_CREDIT_THRESHOLDS",
	"-109": "ERR_DONT_BUY_REACTION_INTERMEDIATES",
	"-110": "ERR_DRY_RUN_ONLY_SUPPORTS_DIRECT_TRANSACTIONS",
	"-200": "ERR_SWARM_ROTATE_FAILED_1",
	"-201": "ERR_SWARM_ROTATE_FAILED_2",
	"-202": "ERR_SWARM_ROTATE_FAILED_3",
	"-203": "ERR_SWARM_ROTATE_FAILED_4",
	"-999": "ERR_NOT_IMPLEMENTED",
	// "-1000": "ERR_NO_AVAILABLE_SPAWNER",
};

export function errorForCode(code: OvermindReturnCode) {
	return errorMap[code] ? `${errorMap[code]} (${code})` : `unknown (${code})`;
}