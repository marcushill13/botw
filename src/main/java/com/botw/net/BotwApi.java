package com.botw.net;

import com.botw.data.Challenge;
import com.botw.data.DropRule;
import com.botw.data.LeaderboardEntry;
import com.botw.track.PendingEvent;
import com.google.gson.Gson;
import com.google.gson.JsonObject;
import com.google.gson.JsonSyntaxException;
import com.google.gson.reflect.TypeToken;
import java.io.IOException;
import java.lang.reflect.Type;
import java.util.ArrayList;
import java.util.List;
import javax.inject.Inject;
import javax.inject.Singleton;
import lombok.Value;
import lombok.extern.slf4j.Slf4j;
import okhttp3.HttpUrl;
import okhttp3.MediaType;
import okhttp3.OkHttpClient;
import okhttp3.Request;
import okhttp3.RequestBody;
import okhttp3.Response;
import okhttp3.ResponseBody;

/**
 * Talks to the service the plugins share.
 * <p>
 * Every call here blocks and must be made off the client thread. The panel runs them on the executor
 * and updates itself afterwards, because a request that hangs on the client thread freezes the game.
 * <p>
 * Failures come back as a {@link Result} carrying a message rather than as an exception. A challenge
 * failing to load is an ordinary thing — someone typed a code wrong, or the network is down — and the
 * panel needs to say so rather than swallow it.
 */
@Slf4j
@Singleton
public class BotwApi
{
	private static final MediaType JSON = MediaType.get("application/json");

	private final OkHttpClient httpClient;
	private final Gson gson;

	@Inject
	private BotwApi(OkHttpClient httpClient, Gson gson)
	{
		this.httpClient = httpClient;
		this.gson = gson;
	}

	/**
	 * Either what was asked for, or why not.
	 */
	@Value
	public static class Result<T>
	{
		T value;
		String error;

		public boolean ok()
		{
			return error == null;
		}

		static <T> Result<T> of(T value)
		{
			return new Result<>(value, null);
		}

		static <T> Result<T> failed(String error)
		{
			return new Result<>(null, error);
		}
	}

	/**
	 * A challenge and its leaderboard, which always travel together — there is no screen that wants one
	 * without the other.
	 */
	@Value
	public static class Snapshot
	{
		Challenge challenge;
		List<LeaderboardEntry> leaderboard;

		/** Only present when the challenge was just created or joined. */
		String creatorToken;
		String participantToken;
	}

	public Result<Snapshot> create(String baseUrl, Challenge challenge, String creatorRsn)
	{
		JsonObject body = new JsonObject();
		body.addProperty("name", challenge.getName());
		body.addProperty("boss", challenge.getBoss());
		body.addProperty("startsAt", challenge.getStartsAt());
		body.addProperty("endsAt", challenge.getEndsAt());
		body.addProperty("timezone", challenge.getTimezone());
		body.addProperty("kcPer", challenge.getKcPer());
		body.addProperty("kcPoints", challenge.getKcPoints());
		body.addProperty("creatorRsn", creatorRsn);
		body.add("drops", gson.toJsonTree(challenge.getDrops()));

		return send(new Request.Builder()
			.url(url(baseUrl, "v1", "challenges"))
			.post(RequestBody.create(JSON, gson.toJson(body))));
	}

	public Result<Snapshot> read(String baseUrl, String code)
	{
		return send(new Request.Builder()
			.url(url(baseUrl, "v1", "challenges", code))
			.get());
	}

	public Result<Snapshot> join(String baseUrl, String code, String rsn)
	{
		JsonObject body = new JsonObject();
		body.addProperty("rsn", rsn);

		return send(new Request.Builder()
			.url(url(baseUrl, "v1", "challenges", code, "join"))
			.post(RequestBody.create(JSON, gson.toJson(body))));
	}

	public Result<Snapshot> update(String baseUrl, Challenge challenge, String creatorToken)
	{
		JsonObject body = new JsonObject();
		body.addProperty("name", challenge.getName());
		body.addProperty("boss", challenge.getBoss());
		body.addProperty("startsAt", challenge.getStartsAt());
		body.addProperty("endsAt", challenge.getEndsAt());
		body.addProperty("timezone", challenge.getTimezone());
		body.addProperty("kcPer", challenge.getKcPer());
		body.addProperty("kcPoints", challenge.getKcPoints());
		body.add("drops", gson.toJsonTree(challenge.getDrops()));

		return send(new Request.Builder()
			.url(url(baseUrl, "v1", "challenges", challenge.getCode()))
			.patch(RequestBody.create(JSON, gson.toJson(body)))
			.header("X-Creator-Token", creatorToken));
	}

	/**
	 * Reports what happened. The events keep their ids, so a batch that is sent twice counts once.
	 */
	public Result<Snapshot> submit(
		String baseUrl, String code, String participantToken, List<PendingEvent> events)
	{
		JsonObject body = new JsonObject();
		body.add("events", gson.toJsonTree(events));

		return send(new Request.Builder()
			.url(url(baseUrl, "v1", "challenges", code, "events"))
			.post(RequestBody.create(JSON, gson.toJson(body)))
			.header("X-Participant-Token", participantToken));
	}

	private Result<Snapshot> send(Request.Builder builder)
	{
		try (Response response = httpClient.newCall(builder.build()).execute())
		{
			ResponseBody responseBody = response.body();
			String text = responseBody == null ? "" : responseBody.string();

			if (!response.isSuccessful())
			{
				return Result.failed(messageIn(text, "The server said no (" + response.code() + ")"));
			}

			return Result.of(parse(text));
		}
		catch (IOException e)
		{
			log.debug("Request failed", e);
			return Result.failed("Could not reach the server");
		}
		catch (JsonSyntaxException e)
		{
			log.warn("Unreadable response", e);
			return Result.failed("The server sent something unreadable");
		}
	}

	private Snapshot parse(String text)
	{
		JsonObject root = gson.fromJson(text, JsonObject.class);
		if (root == null)
		{
			return new Snapshot(null, new ArrayList<>(), null, null);
		}

		Challenge challenge = root.has("challenge") && !root.get("challenge").isJsonNull()
			? gson.fromJson(root.get("challenge"), Challenge.class)
			: null;

		List<LeaderboardEntry> leaderboard = new ArrayList<>();
		if (root.has("leaderboard") && root.get("leaderboard").isJsonArray())
		{
			Type type = new TypeToken<List<LeaderboardEntry>>()
			{
			}.getType();

			List<LeaderboardEntry> parsed = gson.fromJson(root.get("leaderboard"), type);
			if (parsed != null)
			{
				leaderboard.addAll(parsed);
			}
		}

		// The code comes back at the top level on create, where the challenge does not carry it yet.
		if (challenge != null && (challenge.getCode() == null || challenge.getCode().isEmpty())
			&& root.has("code"))
		{
			challenge.setCode(root.get("code").getAsString());
		}

		return new Snapshot(
			challenge,
			leaderboard,
			stringOrNull(root, "creatorToken"),
			stringOrNull(root, "participantToken"));
	}

	/**
	 * The server's own wording where there is one. It says "No challenge with that code", which is more
	 * use to a player than anything this class could invent.
	 */
	private String messageIn(String text, String fallback)
	{
		try
		{
			JsonObject root = gson.fromJson(text, JsonObject.class);
			if (root != null && root.has("error"))
			{
				return root.get("error").getAsString();
			}
		}
		catch (JsonSyntaxException ignored)
		{
			// Fall through to the generic message.
		}

		return fallback;
	}

	private static String stringOrNull(JsonObject root, String key)
	{
		return root.has(key) && !root.get(key).isJsonNull() ? root.get(key).getAsString() : null;
	}

	private static HttpUrl url(String baseUrl, String... segments)
	{
		HttpUrl parsed = HttpUrl.parse(baseUrl.trim());
		if (parsed == null)
		{
			throw new IllegalArgumentException("The server address is not a valid URL: " + baseUrl);
		}

		HttpUrl.Builder builder = parsed.newBuilder();
		for (String segment : segments)
		{
			builder.addPathSegment(segment);
		}

		return builder.build();
	}
}
