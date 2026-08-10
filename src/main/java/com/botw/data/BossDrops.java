package com.botw.data;

import com.google.gson.Gson;
import com.google.gson.JsonSyntaxException;
import java.io.IOException;
import java.io.InputStream;
import java.io.InputStreamReader;
import java.nio.charset.StandardCharsets;
import java.util.ArrayList;
import java.util.Collections;
import java.util.List;
import java.util.Locale;
import javax.inject.Inject;
import javax.inject.Singleton;
import lombok.extern.slf4j.Slf4j;

/**
 * The bosses that can be picked, and the drops each is known for.
 * <p>
 * Bundled rather than fetched, so creating a challenge works offline and the wiki is not asked for the
 * same thing by every member of a clan. See {@code scripts/generate-boss-drops.mjs} for where it comes
 * from.
 * <p>
 * The uniques are a starting point, not a ruling. They are inferred from drop rarity, which catches
 * the pets and the visages but also lets the odd bolt tip through, so the create screen lets the list
 * be edited. Saving the creator typing out sixteen items matters more than being right about the
 * seventeenth.
 */
@Slf4j
@Singleton
public class BossDrops
{
	private static final String RESOURCE = "/com/botw/boss-drops.json";

	private final List<Boss> bosses;
	private final String attribution;

	@Inject
	private BossDrops(Gson gson)
	{
		File file = load(gson);
		this.bosses = file.bosses == null ? Collections.emptyList() : file.bosses;
		this.attribution = file.attribution == null ? "" : file.attribution;
	}

	private static File load(Gson gson)
	{
		try (InputStream stream = BossDrops.class.getResourceAsStream(RESOURCE))
		{
			if (stream == null)
			{
				log.warn("Boss data is missing; no boss can be picked");
				return new File();
			}

			File file = gson.fromJson(new InputStreamReader(stream, StandardCharsets.UTF_8), File.class);
			return file == null ? new File() : file;
		}
		catch (IOException | JsonSyntaxException e)
		{
			log.warn("Could not read the boss data", e);
			return new File();
		}
	}

	public List<Boss> all()
	{
		return Collections.unmodifiableList(bosses);
	}

	/**
	 * Required credit for the wiki's data.
	 */
	public String getAttribution()
	{
		return attribution;
	}

	/**
	 * Bosses whose name contains this, case-insensitively. An empty query returns everything, so the
	 * list is browsable before anything is typed.
	 */
	public List<Boss> search(String query)
	{
		String needle = query == null ? "" : query.trim().toLowerCase(Locale.ROOT);
		List<Boss> matches = new ArrayList<>();

		for (Boss boss : bosses)
		{
			if (needle.isEmpty() || boss.getName().toLowerCase(Locale.ROOT).contains(needle))
			{
				matches.add(boss);
			}
		}

		return matches;
	}

	public Boss byName(String name)
	{
		for (Boss boss : bosses)
		{
			if (boss.getName().equalsIgnoreCase(name))
			{
				return boss;
			}
		}

		return null;
	}

	/**
	 * One boss and the drops it is known for.
	 */
	public static class Boss
	{
		private String name = "";
		private List<Unique> uniques = new ArrayList<>();

		public String getName()
		{
			return name;
		}

		public List<Unique> getUniques()
		{
			return uniques == null ? Collections.emptyList() : uniques;
		}

		@Override
		public String toString()
		{
			return name;
		}
	}

	public static class Unique
	{
		private String name = "";
		private String rarity = "";
		private int oneIn;

		public String getName()
		{
			return name;
		}

		/** As the wiki writes it, e.g. "1/3000". Shown so the creator can judge what it is worth. */
		public String getRarity()
		{
			return rarity;
		}

		public int getOneIn()
		{
			return oneIn;
		}
	}

	/** Mirrors the generated JSON. */
	private static class File
	{
		int dataVersion;
		String source;
		String attribution;
		String generatedAt;
		List<Boss> bosses = new ArrayList<>();
	}
}
