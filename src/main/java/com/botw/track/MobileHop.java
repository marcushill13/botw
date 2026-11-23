package com.botw.track;

import java.util.function.BiConsumer;

/** Keeps a detected hop until RuneLite has restored the character on the destination world. */
public final class MobileHop
{
	private long hoppedAt;

	public void started(long now)
	{
		hoppedAt = now;
	}

	public void reset()
	{
		hoppedAt = 0;
	}

	public void publishIfReady(boolean loggedIn, String rsn, BiConsumer<String, Long> publish)
	{
		if (hoppedAt == 0 || !loggedIn || rsn == null || rsn.trim().isEmpty()) return;
		publish.accept(rsn, hoppedAt);
		reset();
	}
}
