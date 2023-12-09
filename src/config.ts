import * as settings from "settings";

let SERVER_SHARDS = settings.SERVER_SHARDS;
if (!SERVER_SHARDS.includes(Game.shard.name)) {
	console.log(
		`ERROR Current shard ${Game.shard.name} isn't in the list of server shards: ${SERVER_SHARDS}!`
	);
	SERVER_SHARDS = [Game.shard.name];
}

export { settings as config, SERVER_SHARDS };
