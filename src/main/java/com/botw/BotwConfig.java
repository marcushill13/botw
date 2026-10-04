package com.botw;

import net.runelite.client.config.Config;
import net.runelite.client.config.ConfigGroup;
import net.runelite.client.config.ConfigItem;

@ConfigGroup("botw")
public interface BotwConfig extends Config
{
	@ConfigItem(
		keyName = "screenshotDrops",
		name = "Screenshot scoring drops",
		description = "Saves a picture under .runelite/botw whenever a drop scores you points.",
		position = 0
	)
	default boolean screenshotDrops()
	{
		return true;
	}

	@ConfigItem(
		keyName = "shareScreenshots",
		name = "Send screenshots to the challenge creator",
		description =
			"Sends a small copy of each scoring drop's screenshot to whoever runs the challenge, "
				+ "so they can verify it. Only they can see it. Turn this off to keep every screenshot "
				+ "on your own machine.",
		position = 1
	)
	default boolean shareScreenshots()
	{
		return true;
	}

	@ConfigItem(
		keyName = "discordWebhookUrl",
		name = "Discord leaderboard webhook",
		description = "Creators only: paste a Discord channel webhook URL, then open your challenge and "
			+ "select Post to Discord. Keep this URL private.",
		position = 2,
		secret = true
	)
	default String discordWebhookUrl()
	{
		return "";
	}

	@ConfigItem(
		keyName = "serverUrl",
		name = "Server address",
		description = "Where challenges and leaderboards live. Leave this alone unless your clan runs its own.",
		position = 3
	)
	default String serverUrl()
	{
		return "https://botw.marcushill3313.workers.dev";
	}
}
