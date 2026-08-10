package com.botw;

import net.runelite.client.config.Config;
import net.runelite.client.config.ConfigGroup;
import net.runelite.client.config.ConfigItem;

@ConfigGroup("botw")
public interface BotwConfig extends Config
{
	@ConfigItem(
		keyName = "serverUrl",
		name = "Server address",
		description = "Where challenges and leaderboards live. Leave this alone unless your clan runs its own.",
		position = 1
	)
	default String serverUrl()
	{
		return "https://botw.marcushill3313.workers.dev";
	}
}
