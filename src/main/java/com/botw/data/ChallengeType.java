package com.botw.data;

/** The event format is fixed after a challenge is created. */
public enum ChallengeType
{
	BOSS("Boss of the Week"),
	RAID("Raid of the Week"),
	SKILL("Skill of the Week"),
	CLUE("Clue of the Week"),
	MINIGAME("Skill Minigame of the Week");

	private final String title;

	ChallengeType(String title)
	{
		this.title = title;
	}

	public String title()
	{
		return title;
	}
}
