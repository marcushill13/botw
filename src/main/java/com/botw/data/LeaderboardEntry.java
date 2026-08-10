package com.botw.data;

import lombok.Data;
import lombok.NoArgsConstructor;

/**
 * One row of the leaderboard, as the service computes it.
 */
@Data
@NoArgsConstructor
public class LeaderboardEntry
{
	private String rsn = "";
	private int points;
	private int kills;
	private int drops;
}
