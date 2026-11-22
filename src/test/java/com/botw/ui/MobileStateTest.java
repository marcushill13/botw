package com.botw.ui;

import com.botw.data.LeaderboardEntry;
import com.google.gson.Gson;
import org.junit.Test;
import static org.junit.Assert.*;

public class MobileStateTest
{
	@Test
	public void missingServerFieldIsNotAConfirmationThatMobileWasDisabled()
	{
		Gson gson = new Gson();
		LeaderboardEntry old = gson.fromJson("{\"rsn\":\"Player\"}", LeaderboardEntry.class);
		assertFalse(old.hasMobileTrackingState());
		LeaderboardEntry active = gson.fromJson("{\"mobilePlayer\":true}", LeaderboardEntry.class);
		assertTrue(active.hasMobileTrackingState());
		assertTrue(active.isMobilePlayer());
		LeaderboardEntry inactive = gson.fromJson("{\"mobilePlayer\":false}", LeaderboardEntry.class);
		assertTrue(inactive.hasMobileTrackingState());
		assertFalse(inactive.isMobilePlayer());
	}
}
