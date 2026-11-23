package com.botw.track;

import java.util.ArrayList;
import java.util.List;
import org.junit.Test;
import static org.junit.Assert.*;

public class MobileHopTest
{
	@Test
	public void retriesWhenLoggedInArrivesBeforeThePlayerAndPublishesOnlyOnce()
	{
		MobileHop hop = new MobileHop();
		List<String> publications = new ArrayList<>();
		hop.started(12345);
		hop.publishIfReady(false, "MarcAss", (name, at) -> publications.add(name + ":" + at));
		hop.publishIfReady(true, null, (name, at) -> publications.add(name + ":" + at));
		assertTrue(publications.isEmpty());
		hop.publishIfReady(true, "MarcAss", (name, at) -> publications.add(name + ":" + at));
		hop.publishIfReady(true, "MarcAss", (name, at) -> publications.add(name + ":" + at));
		assertEquals(java.util.Collections.singletonList("MarcAss:12345"), publications);
	}

	@Test
	public void logoutDiscardsPendingHopSoAnotherAccountCannotUseIt()
	{
		MobileHop hop = new MobileHop();
		hop.started(12345);
		hop.reset();
		hop.publishIfReady(true, "Other", (name, at) -> fail("Logged-out hop must not be reused"));
	}
}
