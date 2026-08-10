package com.botw.track;

import java.awt.Graphics2D;
import java.awt.Image;
import java.awt.RenderingHints;
import java.awt.image.BufferedImage;
import java.io.ByteArrayOutputStream;
import java.io.File;
import java.io.IOException;
import java.time.LocalDateTime;
import java.time.format.DateTimeFormatter;
import java.util.Locale;
import javax.imageio.ImageIO;
import javax.inject.Inject;
import javax.inject.Singleton;
import lombok.extern.slf4j.Slf4j;
import net.runelite.client.RuneLite;
import net.runelite.client.ui.DrawManager;
import net.runelite.client.util.ImageCapture;

/**
 * Saves a picture of the moment a scoring drop landed.
 * <p>
 * A clan that has always verified drops with screenshots will keep wanting them, and asking people to
 * remember to press a key at the exact moment a pet drops is how you end up with no evidence at all.
 * <p>
 * Filed one folder per challenge, because the point is finding them again: "who has proof of that
 * visage on the Vorkath week" should be one folder, not a scroll through a thousand images named after
 * timestamps.
 * <p>
 * Everything stays on the player's own machine. Nothing is uploaded anywhere.
 */
@Slf4j
@Singleton
public class Screenshotter
{
	private static final String ROOT = "Boss of the Week";
	private static final DateTimeFormatter STAMP =
		DateTimeFormatter.ofPattern("yyyy-MM-dd HH-mm-ss", Locale.ENGLISH);

	private final DrawManager drawManager;
	private final ImageCapture imageCapture;

	@Inject
	private Screenshotter(DrawManager drawManager, ImageCapture imageCapture)
	{
		this.drawManager = drawManager;
		this.imageCapture = imageCapture;
	}

	/**
	 * Takes a shot of the next frame and files it under this challenge.
	 *
	 * @param challengeName what the creator called it, used as the folder
	 * @param itemName      what dropped, used in the file name so a folder is skimmable
	 */
	public void capture(String challengeName, String itemName)
	{
		capture(challengeName, itemName, null, null);
	}

	/**
	 * @param challengeCode when set, a small copy is also sent to the challenge's creator
	 * @param eventId       ties the picture to the drop it is evidence of
	 */
	public void capture(String challengeName, String itemName, String challengeCode, String eventId)
	{
		// The next frame rather than this one: the drop has only just been announced, and the item is
		// not on screen yet when the event fires.
		drawManager.requestNextFrameListener(image ->
			save(image, challengeName, itemName, challengeCode, eventId));
	}

	private void save(Image image, String challengeName, String itemName,
		String challengeCode, String eventId)
	{
		try
		{
			// With the client frame, so the shot shows the whole window rather than the game viewport
			// alone. That is what makes it read as evidence rather than as a cropped picture.
			BufferedImage shot = imageCapture.addClientFrame(image);

			File folder = new File(new File(RuneLite.SCREENSHOT_DIR, ROOT), safe(challengeName));
			if (!folder.exists() && !folder.mkdirs())
			{
				log.warn("Could not make the screenshot folder {}", folder);
				return;
			}

			String fileName = LocalDateTime.now().format(STAMP) + " " + safe(itemName) + ".png";
			File file = new File(folder, fileName);

			ImageIO.write(shot, "png", file);
			log.debug("Saved {}", file);

			if (challengeCode != null && eventId != null && uploader != null)
			{
				// Best effort, and off this thread. The full-size copy is already on disk, so a failed
				// upload costs the creator a thumbnail rather than the player their evidence.
				uploader.send(challengeCode, eventId, itemName, thumbnail(shot));
			}
		}
		catch (IOException | RuntimeException e)
		{
			// A failed screenshot must never cost anyone their points; the event has already been
			// recorded by the time this runs.
			log.warn("Could not save a screenshot", e);
		}
	}

	/**
	 * A small JPEG of the same picture.
	 * <p>
	 * The creator wants to see what happened, not to print it. Six hundred pixels wide at middling
	 * quality is readable — the drop message, the item, the interface — and lands around forty
	 * kilobytes rather than the two megabytes of the original.
	 */
	private static byte[] thumbnail(BufferedImage shot) throws IOException
	{
		int width = Math.min(600, shot.getWidth());
		int height = Math.max(1, shot.getHeight() * width / Math.max(1, shot.getWidth()));

		BufferedImage small = new BufferedImage(width, height, BufferedImage.TYPE_INT_RGB);
		Graphics2D graphics = small.createGraphics();
		graphics.setRenderingHint(
			RenderingHints.KEY_INTERPOLATION, RenderingHints.VALUE_INTERPOLATION_BILINEAR);
		graphics.drawImage(shot, 0, 0, width, height, null);
		graphics.dispose();

		ByteArrayOutputStream out = new ByteArrayOutputStream();
		ImageIO.write(small, "jpg", out);
		return out.toByteArray();
	}

	/**
	 * Where a thumbnail goes once it has been made. Set by the plugin rather than injected, because the
	 * uploader needs the panel's configuration and this class does not.
	 */
	public interface Uploader
	{
		void send(String challengeCode, String eventId, String itemName, byte[] jpeg);
	}

	private Uploader uploader;

	public void setUploader(Uploader uploader)
	{
		this.uploader = uploader;
	}

	/**
	 * A name that will survive being a folder or a file. Challenge names are typed by people and will
	 * contain colons, slashes and whatever else.
	 */
	private static String safe(String name)
	{
		String cleaned = name == null ? "" : name.replaceAll("[\\\\/:*?\"<>|]", "-").trim();
		return cleaned.isEmpty() ? "Unnamed" : cleaned;
	}
}
