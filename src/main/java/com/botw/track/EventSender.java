package com.botw.track;

import com.botw.BotwConfig;
import com.botw.net.BotwApi;
import java.util.List;
import java.util.Map;
import java.util.concurrent.ScheduledExecutorService;
import java.util.concurrent.ScheduledFuture;
import java.util.concurrent.TimeUnit;
import javax.inject.Inject;
import javax.inject.Singleton;
import lombok.extern.slf4j.Slf4j;

/**
 * Drains the outbox to the service.
 * <p>
 * Runs on a timer rather than sending as kills happen. A boss dies every minute or two and the
 * leaderboard is read by people, not machines — nobody needs their kill to appear within the second,
 * and batching keeps a week of killing to a few hundred requests instead of thousands.
 * <p>
 * Nothing here is on the client thread. A request that hangs would freeze the game if it were.
 */
@Slf4j
@Singleton
public class EventSender
{
	/** Often enough that the leaderboard feels current, rarely enough to be cheap. */
	private static final int EVERY_SECONDS = 60;

	private final ScheduledExecutorService executor;
	private final Outbox outbox;
	private final ChallengeStore challenges;
	private final BotwApi api;
	private final BotwConfig config;

	private ScheduledFuture<?> scheduled;

	/** Told after every successful send, so the panel can refresh without polling separately. */
	private Runnable onSent = () ->
	{
	};

	@Inject
	private EventSender(
		ScheduledExecutorService executor,
		Outbox outbox,
		ChallengeStore challenges,
		BotwApi api,
		BotwConfig config)
	{
		this.executor = executor;
		this.outbox = outbox;
		this.challenges = challenges;
		this.api = api;
		this.config = config;
	}

	public void setOnSent(Runnable onSent)
	{
		this.onSent = onSent;
	}

	public void start()
	{
		stop();
		scheduled = executor.scheduleWithFixedDelay(
			this::flush, EVERY_SECONDS, EVERY_SECONDS, TimeUnit.SECONDS);
	}

	public void stop()
	{
		if (scheduled != null)
		{
			scheduled.cancel(false);
			scheduled = null;
		}
	}

	/**
	 * Sends what is waiting. Safe to call at any time and safe to call twice — an event the service has
	 * already seen is ignored by it, and only a confirmed send clears anything locally.
	 */
	public void flush()
	{
		try
		{
			if (outbox.isEmpty())
			{
				return;
			}

			boolean sentAnything = false;

			for (Map.Entry<String, List<PendingEvent>> batch : outbox.nextBatch().entrySet())
			{
				String code = batch.getKey();
				String token = challenges.participantTokenFor(code);

				if (token == null)
				{
					// Joined on another account, or left the challenge. There is nobody to report to,
					// and keeping these forever would mean retrying them forever.
					log.debug("Dropping {} events for {}: not a participant", batch.getValue().size(), code);
					outbox.forget(code);
					continue;
				}

				BotwApi.Result<BotwApi.Snapshot> result =
					api.submit(config.serverUrl(), code, token, batch.getValue());

				if (!result.ok())
				{
					// Left in place deliberately. The next run tries again, and the ids mean a request
					// that actually landed before timing out will not count twice.
					log.debug("Could not send {} events for {}: {}",
						batch.getValue().size(), code, result.getError());
					continue;
				}

				outbox.confirm(batch.getValue());
				sentAnything = true;
			}

			if (sentAnything)
			{
				onSent.run();
			}
		}
		catch (Exception e)
		{
			// A scheduled task that throws stops being scheduled, which would quietly end all tracking.
			log.warn("Sending failed", e);
		}
	}
}
